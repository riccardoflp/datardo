/**
 * Feature: aggregate.clear
 *
 * Empties the pipeline and shows the documents of the collection again: the empty pipeline is run, so the table shows
 * the first page of the documents. While the text is shown, the text becomes `[]`. No confirmation is asked.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { editorOf, editorPlan, editorStep, placeOf, runAfter, type PipelineEditor } from './types';

/** Removes every stage, and runs the empty pipeline. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.plans.clear, []));
  }
  const editor = editorOf(context, answers);
  const cleared: PipelineEditor = editor.text === undefined ? { stages: [] } : { stages: [], text: { value: '[]' } };
  const step = editorStep(text.steps.clear(place.collection), place, cleared);
  return run(editorPlan(text.plans.clear, [step], [runAfter(place, cleared)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.clear'), plan };
