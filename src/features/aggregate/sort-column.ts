/**
 * Feature: aggregate.sort-column
 *
 * A click on a column header sorts the output shown, by adding or changing a `$sort` stage at the point the table
 * shows (the stage shown, or the last stage): a stage that is not an enabled `$sort` gets a `$sort { <field>: 1 }`
 * right after it, which becomes the stage shown when a stage was shown; an enabled `$sort` without the field, or with
 * it ascending, becomes `{ <field>: 1 }` or `{ <field>: -1 }`, one field at a time as in Find; one with the field
 * descending is removed. The window that started it then runs the pipeline (`aggregate.run`), since the output of a
 * read goes back to the control that started it. Started with `{ field }`; the field of the column of an expanded
 * array is its dotted path (`items[].sku` sorts by `items.sku`).
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appliedEditor, stagesOfEditor, withTextKept } from './edit-as-text';
import { formattedValue } from './mongosh/format';
import { valueOf } from './mongosh/parse';
import { withoutStage } from './remove-stage';
import { text } from './text';
import {
  editorOf,
  editorPlan,
  editorStep,
  makersOf,
  placeOf,
  stageName,
  startArgs,
  upToIndex,
  withStages,
  type PipelineEditor,
  type Stage,
} from './types';

/** The element of the table whose header sorts the output of the pipeline. */
export const sortElement = 'aggregate.sort-column@table';

/** The dotted path of a column: `items[].sku` is `items.sku`. */
export function sortField(column: string): string {
  return column.replaceAll('[]', '');
}

/** The direction of a field in a sort body: 1, -1, or 0 when it is not there or the body does not parse. */
function directionOf(body: string, field: string): number {
  const parsed = valueOf(body, {});
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    return 0;
  }
  const direction: Json | undefined = (parsed.value as Readonly<Record<string, Json>>)[field];
  const inner = typeof direction === 'object' && direction !== null ? Object.values(direction)[0] : direction;
  const number = Number(inner);
  return number === 1 || number === -1 ? number : 0;
}

/**
 * The direction each field has in the sort at the point the table shows, for the `▲` and `▼` of the headers, as in
 * Find: the fields of the enabled `$sort` that is the stage shown, or the last stage; none otherwise.
 */
export function sortDirections(editor: PipelineEditor): ReadonlyMap<string, 1 | -1> {
  const stage = editor.stages[upToIndex(editor)];
  const directions = new Map<string, 1 | -1>();
  if (stage?.enabled !== true || stageName(stage) !== '$sort') {
    return directions;
  }
  const parsed = valueOf(stage.body, {});
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    return directions;
  }
  for (const field of Object.keys(parsed.value)) {
    const direction = directionOf(stage.body, field);
    if (direction === 1 || direction === -1) {
      directions.set(field, direction);
    }
  }
  return directions;
}

/** The editor after a click on the header of `field`, and the text of its step. */
export function sortedEditor(
  editor: PipelineEditor,
  field: string,
  collection: string,
): { readonly editor: PipelineEditor; readonly step: string } {
  const index = upToIndex(editor);
  const stage = editor.stages[index];
  if (stage?.enabled === true && stageName(stage) === '$sort') {
    const direction = directionOf(stage.body, field);
    if (direction === -1) {
      return { editor: withoutStage(editor, index), step: text.steps.remove(index + 1, '$sort', collection) };
    }
    const body = formattedValue({ [field]: { $numberInt: direction === 1 ? '-1' : '1' } }, { kind: 'one-line' });
    const stages = editor.stages.map((each, place) => (place === index ? { ...each, body } : each));
    return {
      editor: withStages(editor, stages, editor.shown),
      step: text.steps.setBody(index + 1, '$sort', collection, body),
    };
  }
  const inserted: Stage = {
    name: '$sort',
    body: formattedValue({ [field]: { $numberInt: '1' } }, { kind: 'one-line' }),
    enabled: true,
  };
  const stages = [...editor.stages.slice(0, index + 1), inserted, ...editor.stages.slice(index + 1)];
  const stageText = `$sort ${inserted.body}`;
  const step =
    index < 0
      ? text.steps.insertFirst(stageText, collection)
      : text.steps.insertAfter(stageText, index + 1, collection);
  return { editor: withStages(editor, stages, editor.shown === undefined ? undefined : index + 1), step };
}

/** Sorts the output shown by the column clicked; the window runs the pipeline once it is done. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const column = startArgs(answers)['field'];
  if (place === undefined || typeof column !== 'string' || column === '') {
    return run(editorPlan(text.plans.sortColumn, []));
  }
  const editor = editorOf(context, answers);
  const read = stagesOfEditor(editor, makersOf(context));
  if (!read.ok) {
    return refuse('aggregate.sort-column/invalid-text', read.message);
  }
  const applied = appliedEditor(editor, makersOf(context)) ?? editor;
  const sorted = sortedEditor(applied, sortField(column), place.collection);
  const after = withTextKept(editor, sorted.editor);
  const step = editorStep(sorted.step, place, after);
  return run(editorPlan(text.plans.sortColumn, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.sort-column'), plan };
