/**
 * Feature: field.remove
 *
 * Removes a field from the documents matching the filter of the query bar with `$unset`, also from every element of
 * an expanded array (`items[].sku`). Started from **Remove field…** in the menu of a column header with `{ connection,
 * database, collection, field, array?, view?, filter, written? }`; it counts the documents it changes and those it
 * leaves out, and confirms.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { fieldPathError } from './path-rules';
import { removePlan, type RemovePlan } from './remove-plan';
import { documentsText, text } from './text';
import {
  afterOf,
  countNeed,
  countOf,
  dangerOf,
  filterOf,
  guard,
  isRecorded,
  keptOf,
  labelOf,
  layoutStep,
  placeOf,
  scopeOf,
  undoTitle,
  updateManyStep,
  type FieldPlace,
} from './types';

/** The plan of the removal of the column's field. */
export function removalOf(place: FieldPlace): RemovePlan {
  return removePlan(filterOf(place), place.field, place.array);
}

function leftOutLine(place: FieldPlace, leftOut: number): readonly string[] {
  if (leftOut <= 0) {
    return [];
  }
  return [
    place.array === undefined
      ? text.remove.leftOut(leftOut, place.field)
      : text.remove.leftOutElements(leftOut, place.array),
  ];
}

function questionOf(place: FieldPlace, count: number): string {
  const scope = scopeOf(place);
  return place.array === undefined
    ? text.remove.question(place.field, count, scope)
    : text.remove.questionElements(labelOf(place), place.array, count, scope);
}

/** The plan once the documents are counted. */
function removeRun(context: Context, place: FieldPlace, reached: number, removed: number): Outcome {
  const removal = removalOf(place);
  const label = labelOf(place);
  const leftOut = leftOutLine(place, reached - removed);
  if (removed === 0) {
    return refuse('field.remove/no-field', [text.noField(scopeOf(place), label), ...leftOut].join('\n'));
  }
  const recorded = isRecorded(context, place.connection, removed);
  const namespace = `${place.database}.${place.collection}`;
  return run({
    title: undoTitle(text.remove.undo(label), place),
    steps: [
      updateManyStep(place, removal.filter, removal.update),
      layoutStep(place, text.remove.layoutStep(label, namespace)),
    ],
    danger: dangerOf(place, [questionOf(place, removed), ...leftOut], recorded, {
      some: text.remove.confirm,
      all: text.remove.confirmAll,
    }),
    touches: documentsText(removed),
    undo: { keeps: keptOf(place, removal.filter) },
    publishes: true,
    after: afterOf(place, text.remove.done(label, removed, place.collection)),
  });
}

/** Feature: field.remove — refuses, counts, then plans the `$unset`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('field.remove needs { connection, database, collection, field } of a saved connection.');
  }
  const refused = guard(place, {
    readOnly: 'field.remove/read-only',
    view: 'field.remove/view',
    invalidFilter: 'field.remove/invalid-filter',
  });
  if (refused !== undefined) {
    return refused;
  }
  const invalid = fieldPathError(place.field);
  if (invalid !== undefined) {
    return refuse('field.remove/invalid-path', text.invalidPath(labelOf(place), invalid));
  }
  const removal = removalOf(place);
  const reached = countOf(answers, 'reached');
  if (reached === undefined) {
    return countNeed(context, place, 'reached', removal.reached);
  }
  const removed = countOf(answers, 'removed');
  return removed === undefined
    ? countNeed(context, place, 'removed', removal.filter)
    : removeRun(context, place, reached, removed);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('field.remove'), plan };
