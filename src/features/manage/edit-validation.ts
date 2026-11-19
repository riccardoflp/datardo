/**
 * Feature: manage.edit-validation
 *
 * Applies the validator, the validation level and the validation action typed in the Validation section, with
 * `collMod`. Started by **Save** with `{ connection, database, collection, rules, view? }`, where `rules` is the
 * editor's text as `query.parse` read it.
 */
import {
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import {
  databaseTarget,
  isDocument,
  knownPlace,
  mongoRequest,
  namespaceOf,
  parsedAnswer,
  placeOf,
  unknownField,
  writeStep,
  type JsonDocument,
} from './types';

/** The fields of the validation rules, in the order they are sent. */
export const ruleFields = ['validator', 'validationLevel', 'validationAction'] as const;

/** Rules that can be applied: only the fields present in the text; or why not. */
export type CheckedRules =
  { readonly kind: 'rules'; readonly rules: JsonDocument } | { readonly kind: 'refuse'; readonly outcome: Outcome };

function refused(outcome: Outcome): CheckedRules {
  return { kind: 'refuse', outcome };
}

/** Feature: manage.edit-validation — the rules typed, checked in the order of the card. */
export function checkRules(answer: unknown): CheckedRules {
  const parsed = parsedAnswer(answer);
  if (parsed.kind === 'invalid') {
    return refused(refuse('manage.edit-validation/invalid', text.definition.invalid(parsed.message)));
  }
  const value = parsed.kind === 'value' ? parsed.value : undefined;
  if (!isDocument(value)) {
    return refused(refuse('manage.edit-validation/not-an-object', text.definition.notAnObject));
  }
  const unknown = unknownField(value, ruleFields);
  if (unknown !== undefined) {
    return refused(refuse('manage.edit-validation/unknown-field', text.definition.unknownRulesField(unknown)));
  }
  if (value['validator'] !== undefined && !isDocument(value['validator'])) {
    return refused(refuse('manage.edit-validation/validator', text.definition.validator));
  }
  const rules: JsonDocument = Object.fromEntries(
    ruleFields.flatMap((name) => (value[name] === undefined ? [] : [[name, value[name]]])),
  );
  return { kind: 'rules', rules };
}

/** Feature: manage.edit-validation — `db.runCommand({ collMod: "orders", validator: { … }, … })`. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started?.database === undefined || started.collection === undefined) {
    throw new Error('manage.edit-validation needs { connection, database, collection, rules }.');
  }
  if (started.connection.readOnly) {
    return refuse('manage.edit-validation/read-only', text.readOnly(started.connection.name));
  }
  if (started.view === true) {
    return refuse('manage.edit-validation/view', text.definition.noValidation);
  }
  const checked = checkRules(started.args['rules']);
  if (checked.kind === 'refuse') {
    return checked.outcome;
  }
  const place = knownPlace(started);
  const namespace = namespaceOf(place.database, place.collection);
  const request = mongoRequest({ database: place.database }, 'runCommand', [
    { collMod: place.collection, ...checked.rules },
  ]);
  return run({
    title: text.editValidation.title(namespace),
    steps: [writeStep(place, request, databaseTarget(place, place.database))],
    danger: noDanger,
    undo: { cannot: text.editValidation.cannotUndo },
    publishes: false,
    after: [
      { kind: 'notify', level: 'success', text: text.editValidation.applied(namespace) },
      { kind: 'refresh', connection: place.connection.id },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.edit-validation'), plan };
