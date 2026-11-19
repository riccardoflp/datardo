/**
 * Feature: manage.edit-view
 *
 * Applies the source and the pipeline typed in the Definition section to the view, with `collMod`. Started by **Save**
 * with `{ connection, database, collection, definition }`, where `definition` is the editor's text as `query.parse`
 * read it.
 */
import type { Json } from '../../shared/engine-request';
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
  mongoRequest,
  namespaceOf,
  parsedAnswer,
  placeOf,
  unknownField,
  writeStep,
  type KnownPlace,
} from './types';

/** The fields of a view's definition. */
export const viewFields = ['viewOn', 'pipeline'] as const;

/** A definition that can be applied, or why not. */
export type Checked =
  | { readonly kind: 'definition'; readonly viewOn: string; readonly pipeline: readonly Json[] }
  | { readonly kind: 'refuse'; readonly outcome: Outcome };

/** Feature: manage.edit-view — the definition typed, checked in the order of the card. */
export function checkDefinition(answer: unknown): Checked {
  const parsed = parsedAnswer(answer);
  if (parsed.kind === 'invalid') {
    return refused(refuse('manage.edit-view/invalid', text.definition.invalid(parsed.message)));
  }
  if (parsed.kind === 'empty' || !isDocument(parsed.value)) {
    return refused(refuse('manage.edit-view/not-an-object', text.definition.notAnObject));
  }
  const { viewOn, pipeline } = parsed.value;
  if (typeof viewOn !== 'string' || viewOn.trim() === '') {
    return refused(refuse('manage.edit-view/view-on', text.definition.viewOn));
  }
  if (!Array.isArray(pipeline)) {
    return refused(refuse('manage.edit-view/pipeline', text.definition.pipeline));
  }
  const unknown = unknownField(parsed.value, viewFields);
  if (unknown !== undefined) {
    return refused(refuse('manage.edit-view/unknown-field', text.definition.unknownViewField(unknown)));
  }
  return { kind: 'definition', viewOn, pipeline: pipeline as readonly Json[] };
}

function refused(outcome: Outcome): Checked {
  return { kind: 'refuse', outcome };
}

/** Feature: manage.edit-view — `db.runCommand({ collMod: "recent", viewOn: "orders", pipeline: [ … ] })`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place?.database === undefined || place.collection === undefined) {
    throw new Error('manage.edit-view needs { connection, database, collection, definition }.');
  }
  if (place.connection.readOnly) {
    return refuse('manage.edit-view/read-only', text.readOnly(place.connection.name));
  }
  const checked = checkDefinition(place.args['definition']);
  if (checked.kind === 'refuse') {
    return checked.outcome;
  }
  const known: KnownPlace = { ...place, database: place.database, collection: place.collection };
  const namespace = namespaceOf(known.database, known.collection);
  const command = { collMod: known.collection, viewOn: checked.viewOn, pipeline: checked.pipeline };
  return run({
    title: text.editView.title(namespace),
    steps: [
      writeStep(
        known,
        mongoRequest({ database: known.database }, 'runCommand', [command]),
        databaseTarget(known, known.database),
      ),
    ],
    danger: noDanger,
    undo: { cannot: text.editView.cannotUndo },
    publishes: false,
    after: [
      { kind: 'notify', level: 'success', text: text.editView.saved(namespace) },
      { kind: 'refresh', connection: known.connection.id },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.edit-view'), plan };
