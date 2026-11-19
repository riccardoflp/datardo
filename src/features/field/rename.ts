/**
 * Feature: field.rename
 *
 * Renames a field, or moves it to another field path, in the documents matching the filter of the query bar, with
 * `$rename`. Started from **Rename field…** in the menu of a column header with `{ connection, database, collection,
 * field, array?, view?, filter, written? }`; it asks the new name, counts the documents it renames, those it leaves
 * out because of arrays and those whose value at the new name it replaces, and confirms.
 */
import {
  ask,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { fieldPathError, renameError } from './path-rules';
import { renamePlan, type RenamePlan } from './rename-plan';
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

/** The dialog **Rename `<field>`**: the new name, filled with the current one; `problem` says why it is asked again. */
export function renameQuestion(place: FieldPlace, typed?: string, problem?: string): Question {
  return {
    title: text.rename.title(place.field),
    ...(problem === undefined ? {} : { text: problem }),
    button: text.rename.button,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.rename.prompt(place.field, scopeOf(place)),
        default: typed ?? place.field,
        rules: [
          { kind: 'not-empty', message: text.paths.enterName },
          { kind: 'not-one-of', values: [place.field], message: text.paths.different },
        ],
      },
    ],
  };
}

/** The counts a rename reads before it confirms; `undefined` for the first one not read yet. */
interface RenameCounts {
  readonly reached: number;
  readonly renamed: number;
  readonly overwrites: number;
}

function countsOf(context: Context, answers: Answers, place: FieldPlace, plan: RenamePlan): RenameCounts | Outcome {
  const reached = countOf(answers, 'reached');
  if (reached === undefined) {
    return countNeed(context, place, 'reached', plan.reached);
  }
  const renamed = countOf(answers, 'renamed');
  if (renamed === undefined) {
    return countNeed(context, place, 'renamed', plan.filter);
  }
  if (renamed === 0) {
    return { reached, renamed, overwrites: 0 };
  }
  const overwrites = countOf(answers, 'overwrites');
  return overwrites === undefined
    ? countNeed(context, place, 'overwrites', plan.overwrites)
    : { reached, renamed, overwrites };
}

function isCounts(value: RenameCounts | Outcome): value is RenameCounts {
  return 'renamed' in value;
}

/** The plan once the documents are counted. */
function renameRun(context: Context, place: FieldPlace, to: string, counts: RenameCounts): Outcome {
  const plan = renamePlan(filterOf(place), place.field, to);
  const leftOut = counts.reached - counts.renamed;
  const scope = scopeOf(place);
  if (counts.renamed === 0) {
    const message = [
      text.noField(scope, place.field),
      ...(leftOut > 0 ? [text.rename.leftOut(leftOut, place.field, to)] : []),
    ];
    return refuse('field.rename/no-field', message.join('\n'));
  }
  const lines = [
    text.rename.question(place.field, to, counts.renamed, scope),
    ...(counts.overwrites > 0 ? [text.rename.overwrites(counts.overwrites, to, place.field)] : []),
    ...(leftOut > 0 ? [text.rename.leftOut(leftOut, place.field, to)] : []),
  ];
  const recorded = isRecorded(context, place.connection, counts.renamed);
  const namespace = `${place.database}.${place.collection}`;
  return run({
    title: undoTitle(text.rename.undo(place.field, to), place),
    steps: [
      updateManyStep(place, plan.filter, plan.update),
      layoutStep(place, text.rename.layoutStep(place.field, to, namespace), to),
    ],
    danger: dangerOf(place, lines, recorded, { some: text.rename.confirm, all: text.rename.confirmAll }),
    touches: documentsText(counts.renamed),
    undo: { keeps: keptOf(place, plan.filter) },
    publishes: true,
    after: afterOf(place, text.rename.done(place.field, to, counts.renamed, place.collection)),
  });
}

/** Feature: field.rename — refuses, asks the new name, counts, then plans the `$rename`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('field.rename needs { connection, database, collection, field } of a saved connection.');
  }
  const refused = guard(place, {
    readOnly: 'field.rename/read-only',
    view: 'field.rename/view',
    invalidFilter: 'field.rename/invalid-filter',
  });
  if (refused !== undefined) {
    return refused;
  }
  if (place.array !== undefined) {
    const message = `${text.arrayElement(labelOf(place), place.array, text.rename.action)}\n${text.arrayAdvice}`;
    return refuse('field.rename/array-element', message);
  }
  const invalid = fieldPathError(place.field);
  if (invalid !== undefined) {
    return refuse('field.rename/invalid-path', text.invalidPath(place.field, invalid));
  }
  const typed = answers['name'];
  if (typeof typed !== 'string') {
    return ask(renameQuestion(place));
  }
  const problem = renameError(place.field, typed);
  if (problem !== undefined) {
    return ask(renameQuestion(place, typed, problem));
  }
  const to = typed.trim();
  const counts = countsOf(context, answers, place, renamePlan(filterOf(place), place.field, to));
  return isCounts(counts) ? renameRun(context, place, to, counts) : counts;
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('field.rename'), plan };
