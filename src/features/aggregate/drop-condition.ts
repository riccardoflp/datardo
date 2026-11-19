/**
 * Feature: aggregate.drop-condition
 *
 * A cell or a column header dragged from the table adds its condition to the pipeline at the point the table shows:
 * the stage shown, or the last stage for the whole pipeline. That stage being an enabled `$match`, the condition is
 * merged into its body as into a filter (operators on the same field join into one range; a field of the elements of
 * an expanded array goes into the `$elemMatch` of that array); otherwise a new enabled `$match` with the condition is
 * inserted right after it, and becomes the stage shown when a stage was shown. The pipeline is then run.
 *
 * Started with `{ field, condition, within? }`: the dotted field, its condition as canonical Extended JSON (the value
 * for **equals**, `{ $lte: 50 }` for **to**…, as the drag and drop of the query bar makes it), and the expanded array
 * the field is an element field of.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appliedEditor, stagesOfEditor, withTextKept } from './edit-as-text';
import { formattedValue, isTypedValue } from './mongosh/format';
import { valueOf } from './mongosh/parse';
import { text } from './text';
import {
  editorOf,
  editorPlan,
  editorStep,
  makersOf,
  placeOf,
  runAfter,
  stageName,
  startArgs,
  upToIndex,
  withStages,
  type PipelineEditor,
  type Stage,
} from './types';

/** The element of the table a cell or a header is dragged from, onto the pipeline editor. */
export const dropElement = 'aggregate.drop-condition@table';

type JsonObject = Readonly<Record<string, Json>>;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An object of query operators, `{ $gte: 1, $lt: 5 }`, not a value of a BSON type. */
function isOperatorObject(value: Json | undefined): value is JsonObject {
  return (
    isObject(value) &&
    !isTypedValue(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every((key) => key.startsWith('$'))
  );
}

function withField(filter: JsonObject, key: string, condition: Json): JsonObject {
  const existing = filter[key];
  const merged = isOperatorObject(condition) && isOperatorObject(existing) ? { ...existing, ...condition } : condition;
  return { ...filter, [key]: merged };
}

/** A filter with a condition merged into it, as the drag and drop of the query bar merges it. */
export function mergedCondition(filter: JsonObject, key: string, condition: Json, within?: string): JsonObject {
  if (within === undefined || !key.startsWith(`${within}.`)) {
    return withField(filter, key, condition);
  }
  const existing = filter[within];
  const target = isOperatorObject(existing) ? existing : {};
  const elements = isObject(target['$elemMatch']) ? target['$elemMatch'] : {};
  const elemMatch = withField(elements, key.slice(within.length + 1), condition);
  return { ...filter, [within]: { ...target, $elemMatch: elemMatch } };
}

/** What the editor says while a cell is dragged over it: where the condition will go. */
export function dropTarget(editor: PipelineEditor): string {
  const index = upToIndex(editor);
  const stage = editor.stages[index];
  if (stage?.enabled === true && stageName(stage) === '$match') {
    return text.drop.into(index + 1);
  }
  return index < 0 ? text.drop.asNew : text.drop.after(index + 1);
}

interface Dropped {
  readonly field: string;
  readonly condition: Json;
  readonly within?: string;
}

function droppedOf(answers: Answers): Dropped | undefined {
  const args = startArgs(answers);
  const { field, within } = args;
  const condition = args['condition'] as Json | undefined;
  if (typeof field !== 'string' || field === '' || condition === undefined) {
    return undefined;
  }
  return typeof within === 'string' ? { field, condition, within } : { field, condition };
}

type Change = { readonly editor: PipelineEditor; readonly step: string } | { readonly refused: string };

function changeOf(editor: PipelineEditor, dropped: Dropped, context: Context, collection: string): Change {
  const index = upToIndex(editor);
  const stage = editor.stages[index];
  const added = formattedValue({ [dropped.field]: dropped.condition }, { kind: 'one-line' });
  if (stage?.enabled === true && stageName(stage) === '$match') {
    const parsed = stage.body.trim() === '' ? { ok: true as const, value: {} } : valueOf(stage.body, makersOf(context));
    if (!parsed.ok || !isObject(parsed.value) || isTypedValue(parsed.value)) {
      return { refused: text.errors.fixBeforeDrop(index + 1, parsed.ok ? text.errors.notAnObject : parsed.message) };
    }
    const filter = mergedCondition(parsed.value, dropped.field, dropped.condition, dropped.within);
    const body = formattedValue(filter, { kind: 'filter' });
    const stages = editor.stages.map((each, place) => (place === index ? { ...each, body } : each));
    return {
      editor: withStages(editor, stages, editor.shown),
      step: text.steps.addInto(added, index + 1, '$match', collection),
    };
  }
  const filter = mergedCondition({}, dropped.field, dropped.condition, dropped.within);
  const inserted: Stage = { name: '$match', body: formattedValue(filter, { kind: 'filter' }), enabled: true };
  const stages = [...editor.stages.slice(0, index + 1), inserted, ...editor.stages.slice(index + 1)];
  const shown = editor.shown === undefined ? undefined : index + 1;
  const stageText = `$match ${inserted.body}`;
  const step =
    index < 0
      ? text.steps.insertFirst(stageText, collection)
      : text.steps.insertAfter(stageText, index + 1, collection);
  return { editor: withStages(editor, stages, shown), step };
}

/** Adds the condition dropped to the pipeline, and runs it up to the stage that received it. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const dropped = droppedOf(answers);
  if (place === undefined || dropped === undefined) {
    return run(editorPlan(text.plans.dropCondition, []));
  }
  const editor = editorOf(context, answers);
  const read = stagesOfEditor(editor, makersOf(context));
  if (!read.ok) {
    return refuse('aggregate.drop-condition/invalid-text', read.message);
  }
  const applied = appliedEditor(editor, makersOf(context)) ?? editor;
  const change = changeOf(applied, dropped, context, place.collection);
  if ('refused' in change) {
    return refuse('aggregate.drop-condition/invalid-stage', change.refused);
  }
  const after = withTextKept(editor, change.editor);
  const step = editorStep(change.step, place, after);
  return run(editorPlan(text.plans.dropCondition, [step], [runAfter(place, after)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.drop-condition'), plan };
