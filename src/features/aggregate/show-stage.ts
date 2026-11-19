/**
 * Feature: aggregate.show-stage
 *
 * Shows in the table what the pipeline returns up to one stage (`args.stage`, from 0), or the whole pipeline (no
 * stage: **show full pipeline**). The number of the stage already shown, and the number of the last stage, show the
 * whole pipeline. The pipeline is run up to the stage shown from its first page; the stages after it are not sent.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import {
  editorOf,
  editorPlan,
  editorStep,
  placeOf,
  runAfter,
  stageArg,
  stageName,
  withStages,
  type PipelineEditor,
} from './types';

/** The stage shown after a click on the number of the stage at `index`, or on **show full pipeline** (`undefined`). */
export function shownAfter(editor: PipelineEditor, index: number | undefined): number | undefined {
  if (index === undefined || index === editor.shown || index >= editor.stages.length - 1) {
    return undefined;
  }
  return index;
}

/** The name the number of a stage has for a screen reader. */
export function numberLabel(editor: PipelineEditor, index: number): string {
  return editor.shown === index ? text.editor.previewing : text.editor.showUpTo;
}

/** Shows the output of a stage, or of the whole pipeline, and runs it. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.plans.showStage, []));
  }
  const editor = editorOf(context, answers);
  const shown = shownAfter(editor, stageArg(answers, editor));
  const after = withStages(editor, editor.stages, shown);
  const stage = shown === undefined ? undefined : editor.stages[shown];
  const step =
    shown === undefined || stage === undefined
      ? text.steps.showWhole(place.collection)
      : text.steps.show(shown + 1, stageName(stage), place.collection);
  return run(editorPlan(text.plans.showStage, [editorStep(step, place, after)], [runAfter(place, after)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.show-stage'), plan };
