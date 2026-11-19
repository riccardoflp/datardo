/**
 * Feature: aggregate.copy
 *
 * Copies the whole pipeline as mongosh text (`aggregate.to-text`), even while a stage is shown, without its disabled
 * stages. While the text is shown, the text is read first: one that does not parse is refused and nothing is copied.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { stagesOfEditor } from './edit-as-text';
import { text } from './text';
import { pipelineText } from './to-text';
import { editorOf, editorPlan, makersOf, placeOf } from './types';

/** The app action that puts a text on the clipboard (`nav.copy-path` uses it too). */
export const copyAction = 'nav.copy';

/** Copies the pipeline to the clipboard. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.plans.copy, []));
  }
  const read = stagesOfEditor(editorOf(context, answers), makersOf(context));
  if (!read.ok) {
    return refuse('aggregate.copy/invalid-text', read.message);
  }
  const copied = pipelineText(read.stages);
  const step = {
    kind: 'app',
    text: text.steps.copy(place.collection),
    action: copyAction,
    args: { text: copied },
  } as const;
  // The status line says *Copied to the clipboard* once the window learns that the copy is done.
  return run(editorPlan(text.plans.copy, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.copy'), plan };
