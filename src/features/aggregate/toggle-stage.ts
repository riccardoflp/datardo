/**
 * Feature: aggregate.toggle-stage
 *
 * Skips a stage without losing it, or takes it back: the checkbox **Enabled (uncheck to skip this stage)** on a card,
 * **Disable stage** and **Enable stage** in its menu. `args.stage` is the stage, from 0; `args.enabled` what it
 * becomes, the other of what it is when absent. A disabled stage is never sent nor parsed (`aggregate.build`); the
 * marks of the cards are worked out again from the stages. Nothing runs.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { editorOf, editorPlan, editorStep, placeOf, stageArg, stageName, startArgs, withStages } from './types';

/** Disables or enables the stage named by `args.stage`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const editor = editorOf(context, answers);
  const index = stageArg(answers, editor);
  const stage = index === undefined ? undefined : editor.stages[index];
  if (place === undefined || index === undefined || stage === undefined) {
    return run(editorPlan(text.plans.disableStage, []));
  }
  const asked = startArgs(answers)['enabled'];
  const enabled = typeof asked === 'boolean' ? asked : !stage.enabled;
  const title = enabled ? text.plans.enableStage : text.plans.disableStage;
  if (enabled === stage.enabled) {
    return run(editorPlan(title, []));
  }
  const stages = editor.stages.map((each, place) => (place === index ? { ...each, enabled } : each));
  const words = enabled ? text.steps.enable : text.steps.disable;
  const step = words(index + 1, stageName(stage), place.collection);
  return run(editorPlan(title, [editorStep(step, place, withStages(editor, stages, editor.shown))]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.toggle-stage'), plan };
