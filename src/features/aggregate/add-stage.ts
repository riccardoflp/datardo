/**
 * Feature: aggregate.add-stage
 *
 * Adds a `$match` stage at the end of the pipeline, with the template of `$match`, ready to be typed over. The stage
 * shown becomes the whole pipeline, and nothing runs. While the text is shown, the text is applied first and the
 * stage list comes back with the stages of the text and the new one after them.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appliedEditor, stagesOfEditor } from './edit-as-text';
import { stageTemplate } from './stage-template';
import { text } from './text';
import { editorOf, editorPlan, editorStep, makersOf, placeOf, withStages, type Stage } from './types';

/** The name of the stage added. */
export const addedName = '$match';

/** The stage added: `$match` with its template. */
export const addedStage: Stage = { name: addedName, body: stageTemplate(addedName) ?? '{}', enabled: true };

/** Adds a `$match` stage at the end. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.plans.addStage, []));
  }
  const makers = makersOf(context);
  const editor = editorOf(context, answers);
  const read = stagesOfEditor(editor, makers);
  if (!read.ok) {
    return refuse('aggregate.add-stage/invalid-text', read.message);
  }
  const applied = appliedEditor(editor, makers) ?? editor;
  const added = withStages(applied, [...applied.stages, addedStage], undefined);
  return run(editorPlan(text.plans.addStage, [editorStep(text.steps.add(addedName, place.collection), place, added)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.add-stage'), plan };
