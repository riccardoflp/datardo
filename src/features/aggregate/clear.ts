/**
 * Feature: aggregate.clear
 *
 * Empties the pipeline and shows the documents of the collection again: the empty pipeline is run, so the table shows
 * the first page of the documents. While the text is shown, the text becomes `[]`. No confirmation is asked. The
 * window that started it then runs the empty pipeline from its first page (`aggregate.run`): the output of a read
 * goes back to the control that started it, so the plan does not start the read itself.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { editorOf, editorPlan, editorStep, placeOf, type PipelineEditor } from './types';

/** Removes every stage; the window runs the empty pipeline once it is done. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.plans.clear, []));
  }
  const editor = editorOf(context, answers);
  const cleared: PipelineEditor = editor.text === undefined ? { stages: [] } : { stages: [], text: { value: '[]' } };
  const step = editorStep(text.steps.clear(place.collection), place, cleared);
  return run(editorPlan(text.plans.clear, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.clear'), plan };
