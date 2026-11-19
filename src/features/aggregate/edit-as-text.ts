/**
 * Feature: aggregate.edit-as-text
 *
 * Switches between the stage list and one editor with the whole pipeline. Going to the text, the editor holds the
 * text of the stages (`aggregate.to-text`); going back, the stages are those of the text (`aggregate.from-text`), all
 * enabled, and the whole pipeline is shown; when the text was not changed, the stages are left as they were, disabled
 * ones included. A text that does not parse is refused, and the text stays shown.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { pipelineStages } from './from-text';
import type { Makers } from './mongosh/helpers';
import { text } from './text';
import { pipelineText } from './to-text';
import {
  editorOf,
  editorPlan,
  editorStep,
  makersOf,
  placeOf,
  startArgs,
  withStages,
  type PipelineEditor,
  type Stage,
} from './types';

/** The stages an editor holds: those of its text while the text is shown and was changed, else its own. */
export type EditorStages =
  | { readonly ok: true; readonly stages: readonly Stage[]; readonly changed: boolean }
  | { readonly ok: false; readonly message: string };

/** The stages of the editor; while the text is shown, those of the text, or why the text is not a pipeline. */
export function stagesOfEditor(editor: PipelineEditor, makers: Makers): EditorStages {
  if (editor.text === undefined || editor.text.value === pipelineText(editor.stages)) {
    return { ok: true, stages: editor.stages, changed: false };
  }
  const read = pipelineStages(editor.text.value, makers);
  return read.ok
    ? { ok: true, stages: read.stages, changed: true }
    : { ok: false, message: text.errors.invalidPipeline(read.message) };
}

/**
 * The editor with its text applied, as the stage list shows it: the stages of the text and the whole pipeline when
 * the text changed, the editor as it was otherwise. `undefined` for a text that does not parse.
 */
export function appliedEditor(editor: PipelineEditor, makers: Makers): PipelineEditor | undefined {
  const read = stagesOfEditor(editor, makers);
  if (!read.ok) {
    return undefined;
  }
  const { text: _text, ...rest } = editor;
  return read.changed ? withStages(rest, read.stages, undefined, 'clear-error') : rest;
}

/** The editor after a change made on the stages of `before`: while the text was shown, it shows the new text. */
export function withTextKept(before: PipelineEditor, after: PipelineEditor): PipelineEditor {
  return before.text === undefined ? after : { ...after, text: { value: pipelineText(after.stages) } };
}

/** Where the command or the button goes: `text` or `stages`; the other one of what is shown when none is said. */
function wanted(answers: Answers, editor: PipelineEditor): 'text' | 'stages' {
  const args = answers['args'];
  const asked = typeof args === 'string' ? args : startArgs(answers)['to'];
  if (asked === 'text' || asked === 'stages') {
    return asked;
  }
  return editor.text === undefined ? 'text' : 'stages';
}

/** Shows the pipeline as text, or as stages again. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const editor = editorOf(context, answers);
  const to = wanted(answers, editor);
  const title = to === 'text' ? text.plans.editAsText : text.plans.editAsStages;
  if (place === undefined || (to === 'text') === (editor.text !== undefined)) {
    return run(editorPlan(title, []));
  }
  if (to === 'text') {
    const shown: PipelineEditor = { ...editor, text: { value: pipelineText(editor.stages) } };
    return run(editorPlan(title, [editorStep(text.steps.asText(place.collection), place, shown)]));
  }
  const read = stagesOfEditor(editor, makersOf(context));
  if (!read.ok) {
    return refuse('aggregate.edit-as-text/invalid-text', read.message);
  }
  const back = appliedEditor(editor, makersOf(context)) ?? editor;
  return run(editorPlan(title, [editorStep(text.steps.asStages(place.collection), place, back)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.edit-as-text'), plan };
