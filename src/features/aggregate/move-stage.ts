/**
 * Feature: aggregate.move-stage
 *
 * Changes the place of a stage among the others: **Move left** and **Move right** on a card, and the commands
 * `aggregate.move-stage:left` and `aggregate.move-stage:right` for the stage whose body has the focus. The window
 * sends the stage in `args.stage` and the direction in `args.to` (`left`, `right`, or a place from 0). The whole
 * pipeline is shown after, the mark of error goes, a disabled stage stays disabled, and nothing runs.
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
  startArgs,
  withStages,
  type PipelineEditor,
} from './types';

/** Whether **Move left** (`left`) or **Move right** (`right`) is enabled for the stage at `index`. */
export function canMove(editor: PipelineEditor, index: number, direction: 'left' | 'right'): boolean {
  return direction === 'left' ? index > 0 : index < editor.stages.length - 1;
}

/** The place, from 0, the stage goes to; `undefined` when it cannot move there. */
function placeTo(answers: Answers, editor: PipelineEditor, index: number): number | undefined {
  const args = answers['args'];
  const to = typeof args === 'string' ? args : startArgs(answers)['to'];
  if (to === 'left' || to === 'right') {
    return canMove(editor, index, to) ? index + (to === 'left' ? -1 : 1) : undefined;
  }
  return typeof to === 'number' && Number.isInteger(to) && to >= 0 && to < editor.stages.length && to !== index
    ? to
    : undefined;
}

/** The editor with the stage at `index` moved to `to`, the whole pipeline shown and no mark of error. */
export function withStageMoved(editor: PipelineEditor, index: number, to: number): PipelineEditor {
  const stages = [...editor.stages];
  const [moved] = stages.splice(index, 1);
  if (moved !== undefined) {
    stages.splice(to, 0, moved);
  }
  return withStages(editor, stages, undefined, 'clear-error');
}

/** Moves the stage named by `args.stage` left, right or to a place. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const editor = editorOf(context, answers);
  const index = stageArg(answers, editor);
  const moved = index === undefined ? undefined : editor.stages[index];
  const to = index === undefined ? undefined : placeTo(answers, editor, index);
  if (place === undefined || index === undefined || moved === undefined || to === undefined) {
    return run(editorPlan(text.plans.moveStage, []));
  }
  const step = text.steps.move(index + 1, stageName(moved), place.collection, to + 1);
  return run(editorPlan(text.plans.moveStage, [editorStep(step, place, withStageMoved(editor, index, to))]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.move-stage'), plan };
