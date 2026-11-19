/**
 * Feature: aggregate.remove-stage
 *
 * Takes one stage (`args.stage`, from 0) out of the pipeline. The cards after it are numbered again, and the stage
 * shown follows: removing the stage shown or one before it shows the stage before, and when that leaves no stage
 * before or the last one, the whole pipeline is shown. The mark of error goes. Nothing runs.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import {
  editorOf,
  editorPlan,
  editorStep,
  placeOf,
  stageArg,
  stageName,
  withStages,
  type PipelineEditor,
} from './types';

/** The editor without the stage at `index`, with the stage shown that follows. */
export function withoutStage(editor: PipelineEditor, index: number): PipelineEditor {
  const stages = editor.stages.filter((_stage, place) => place !== index);
  const shown = editor.shown === undefined || index > editor.shown ? editor.shown : editor.shown - 1;
  return withStages(editor, stages, shown !== undefined && shown >= 0 ? shown : undefined, 'clear-error');
}

/** Removes the stage named by `args.stage`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const editor = editorOf(context, answers);
  const index = stageArg(answers, editor);
  const removed = index === undefined ? undefined : editor.stages[index];
  if (place === undefined || index === undefined || removed === undefined) {
    return run(editorPlan(text.plans.removeStage, []));
  }
  const step = text.steps.remove(index + 1, stageName(removed), place.collection);
  return run(editorPlan(text.plans.removeStage, [editorStep(step, place, withoutStage(editor, index))]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.remove-stage'), plan };
