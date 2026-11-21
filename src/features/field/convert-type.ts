/**
 * Feature: field.convert-type
 *
 * Converts the values of a field to another BSON type with `$convert`, keeping the values that cannot be converted.
 * Started from **Convert type…** in the menu of a column header with `{ connection, database, collection, field,
 * array?, view?, filter, written? }`; it reads the current types of the field (`field.type-counts`), asks the type,
 * counts the values to convert with and without the array guard, and confirms.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { CONVERT_TYPES, convertPlan, convertTypeOf, type ConvertType } from './convert-plan';
import { fieldPathError } from './path-rules';
import { leftAfter } from './reads/left';
import { documentsText, text } from './text';
import type { TypeCount } from './type-counts';
import {
  afterOf,
  isDocument,
  countNeed,
  countOf,
  dangerOf,
  fieldUndo,
  filterOf,
  guard,
  labelOf,
  placeOf,
  scopeOf,
  undoTitle,
  updateManyStep,
  type FieldPlace,
} from './types';

/**
 * The list **Convert `<field>`**: the line with the current types, most frequent first (without them when counting
 * failed), and the types with their descriptions.
 */
export function convertQuestion(place: FieldPlace, counts: readonly TypeCount[]): Question {
  const line = counts.length === 0 ? text.convert.line : `${text.convert.line} · ${text.convert.now(counts)}`;
  return {
    title: text.convert.title(place.field),
    button: text.convert.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'type',
        label: line,
        choices: CONVERT_TYPES.map((each) => ({ value: each.type, label: each.type, description: each.description })),
      },
    ],
  };
}

function typesRead(place: FieldPlace): Outcome {
  const args: Json = {
    connection: place.connection.id,
    database: place.database,
    collection: place.collection,
    filter: filterOf(place),
    field: place.field,
  };
  return needRead('types', 'field.type-counts', args);
}

/** The rows of the count of the types, as read; none when the read gave nothing usable. */
function typesOf(answers: Answers): readonly TypeCount[] {
  const types: unknown = answers['types'];
  return Array.isArray(types) ? types.filter(isTypeCount) : [];
}

function isTypeCount(value: unknown): value is TypeCount {
  return isDocument(value) && typeof value['type'] === 'string' && typeof value['count'] === 'number';
}

/** The plan once the values are counted. */
function convertRun(
  context: Context,
  place: FieldPlace,
  type: ConvertType,
  counts: readonly [number, number],
): Outcome {
  const [reached, converted] = counts;
  const conversion = convertPlan(filterOf(place), place.field, type);
  const scope = scopeOf(place);
  if (converted === 0) {
    return refuse('field.convert-type/nothing-to-convert', text.convert.nothing(place.field, scope, type));
  }
  const leftOut = reached - converted;
  const lines = [
    text.convert.question(place.field, type, converted, scope),
    text.convert.keep,
    ...(leftOut > 0 ? [text.convert.leftOut(leftOut, place.field)] : []),
  ];
  const { recorded, undo } = fieldUndo(context, place, conversion.filter, converted);
  return run({
    title: undoTitle(text.convert.undo(place.field, type), place),
    steps: [updateManyStep(place, conversion.filter, conversion.update)],
    danger: dangerOf(place, lines, recorded, { some: text.convert.confirm, all: text.convert.confirmAll }),
    touches: documentsText(converted),
    undo,
    publishes: true,
    after: [
      ...afterOf(place, text.convert.done(place.field, type, converted, place.collection)),
      leftAfter(place, conversion.filter),
    ],
  });
}

function refusalOf(place: FieldPlace): Outcome | undefined {
  const refused = guard(place, {
    readOnly: 'field.convert-type/read-only',
    view: 'field.convert-type/view',
    invalidFilter: 'field.convert-type/invalid-filter',
  });
  if (refused !== undefined) {
    return refused;
  }
  if (place.array !== undefined) {
    const message = `${text.arrayElement(labelOf(place), place.array, text.convert.action)}\n${text.arrayAdvice}`;
    return refuse('field.convert-type/array-element', message);
  }
  const invalid = fieldPathError(place.field);
  return invalid === undefined
    ? undefined
    : refuse('field.convert-type/invalid-path', text.invalidPath(place.field, invalid));
}

/** Feature: field.convert-type — refuses, reads the types, asks one, counts, then plans the `$convert`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('field.convert-type needs { connection, database, collection, field } of a saved connection.');
  }
  const refused = refusalOf(place);
  if (refused !== undefined) {
    return refused;
  }
  const type = convertTypeOf(answers['type']);
  if (type === undefined) {
    return answers['types'] === undefined ? typesRead(place) : ask(convertQuestion(place, typesOf(answers)));
  }
  const conversion = convertPlan(filterOf(place), place.field, type);
  const reached = countOf(answers, 'reached');
  if (reached === undefined) {
    return countNeed(context, place, 'reached', conversion.reached);
  }
  const converted = countOf(answers, 'converted');
  return converted === undefined
    ? countNeed(context, place, 'converted', conversion.filter)
    : convertRun(context, place, type, [reached, converted]);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('field.convert-type'), plan };
