/**
 * What the controls of the pipeline editor do (`aggregate.show`): each starts its feature through the bridge with the
 * tab and the editor as it is (`args.tab`, `args.pipeline`), and the window reads back the pipeline the tab then keeps.
 * The features that change what the table shows (`aggregate.clear`, `aggregate.show-stage`, `aggregate.drop-condition`,
 * `aggregate.sort-column`) leave the run to the window that started them: it runs the pipeline once they are done.
 * Typing in the name or the body of a stage, or in the text, changes the editor of the window only, until it is sent.
 */
import type { EditorControl } from '../../../features/aggregate/show';
import { bodyAfterRename } from '../../../features/aggregate/stage-template';
import { editorJson, stageName, upToIndex, withStages, type PipelineEditor } from '../../../features/aggregate/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import type { CollectionRef } from '../../query/collection-reads';
import { currentAppState } from '../../state/store';
import { flashCopied } from '../../table/copied-flash';
import { showCode } from '../code/code-actions';
import { changeDraft, changePipeline, pipelineOf, readKept } from './pipeline-store';
import { runPipeline, showError, startOnTab } from './pipeline-reads';

/** Runs the pipeline as the editor holds it, from its first page, with its count. */
export function runFromEditor(ref: CollectionRef): void {
  void runPipeline(ref, { texts: 'bar', page: 1, count: true });
}

/** **Run**, and `Ctrl+Enter` in the text: the whole pipeline is shown, then run. */
export function runWhole(ref: CollectionRef): void {
  changeDraft(ref.tab, (draft) => (draft.shown === undefined ? draft : withStages(draft, draft.stages, undefined)));
  runFromEditor(ref);
}

function placeOfElement(element: string): Place | undefined {
  const at = element.indexOf('@');
  return at < 0 ? undefined : (element.slice(at + 1) as Place);
}

function argsOf(control: EditorControl): Readonly<Record<string, Json>> {
  const args = control.args;
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

/** A refusal or a failure is said above the table; a text that does not parse stays marked until it is edited. */
function sayWhy(ref: CollectionRef, feature: string, result: IntentResult): void {
  if (result.kind !== 'refused' && result.kind !== 'failed') {
    return;
  }
  if (result.kind === 'refused' && result.code === `${feature}/invalid-text`) {
    changeDraft(ref.tab, (draft) =>
      draft.text === undefined ? draft : { ...draft, text: { ...draft.text, invalid: result.message } },
    );
  }
  showError(ref, { message: result.message, runAgain: false });
}

/** What follows a feature of the editor once done: the focus it asks, the copy said, the run of the pipeline. */
function afterDone(ref: CollectionRef, feature: string, before: PipelineEditor): void {
  const draft = pipelineOf(ref.tab).draft;
  switch (feature) {
    case 'aggregate.add-stage':
      changePipeline(ref.tab, (kept) => ({ ...kept, focusName: { stage: draft.stages.length - 1, at: Date.now() } }));
      return;
    case 'aggregate.edit-as-text':
      if (draft.text !== undefined) {
        changePipeline(ref.tab, (kept) => ({ ...kept, focusText: Date.now() }));
      }
      return;
    case 'aggregate.copy':
      flashCopied();
      return;
    case 'aggregate.drop-condition': {
      const index = upToIndex(before);
      const stage = before.stages[index];
      const into = stage?.enabled === true && stageName(stage) === '$match';
      changePipeline(ref.tab, (kept) => ({ ...kept, flash: { stage: into ? index : index + 1, at: Date.now() } }));
      runFromEditor(ref);
      return;
    }
    case 'aggregate.clear':
    case 'aggregate.show-stage':
    case 'aggregate.sort-column':
      runFromEditor(ref);
      return;
    default:
      return;
  }
}

/** The features of the editor whose plan sets no pipeline of the tab: copying, and saving it as a view. */
const keepsNoPipeline: ReadonlySet<string> = new Set(['aggregate.copy', 'aggregate.save-as-view']);

/** How long the window waits for the pipeline a step set to reach it, in ms, before it goes on without it. */
const keptWaitMs = 2000;

/**
 * Waits until the tabs of the app's state changed since `before`: the event of the step that set the pipeline of the
 * tab may reach the window after the result of the feature.
 */
async function tabsChangedSince(before: ReturnType<typeof currentAppState>['tabs']): Promise<void> {
  for (let waited = 0; waited < keptWaitMs && currentAppState().tabs === before; waited += 20) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Starts a feature of the editor on the pipeline as it is, from the place of its element. */
export async function startOnPipeline(ref: CollectionRef, control: EditorControl): Promise<void> {
  const before = pipelineOf(ref.tab).draft;
  const args = { ...argsOf(control), tab: ref.tab, pipeline: editorJson(before) };
  const place = placeOfElement(control.element);
  const tabs = currentAppState().tabs;
  const result = await startOnTab(ref, control.feature, args, place);
  if (result.kind !== 'done') {
    sayWhy(ref, control.feature, result);
    return;
  }
  if (!keepsNoPipeline.has(control.feature)) {
    await tabsChangedSince(tabs);
  }
  readKept(ref.tab);
  afterDone(ref, control.feature, before);
}

/** Starts a control of the editor: **Run** runs the whole pipeline; the others start their feature. */
export function pressControl(ref: CollectionRef, control: EditorControl): void {
  if (control.feature === 'aggregate.run') {
    runWhole(ref);
    return;
  }
  // **Code**: the code of the pipeline as the editor holds it now, in the Code section.
  if (control.feature === 'codegen.show') {
    showCode(ref, { kind: 'query' }, 'query-bar');
    return;
  }
  void startOnPipeline(ref, control);
}

/** The name of a stage typed: its body follows the template of the new name, as long as it was the old one's. */
export function renameStage(ref: CollectionRef, index: number, name: string, focusedName: string): void {
  changeDraft(ref.tab, (draft) => {
    const stage = draft.stages[index];
    if (stage === undefined) {
      return draft;
    }
    const body = bodyAfterRename({ name: focusedName, body: stage.body }, name);
    const stages = draft.stages.map((each, place) => (place === index ? { ...each, name, body } : each));
    return { ...draft, stages };
  });
}

/** The body of a stage typed: the mark of error of that stage goes. */
export function editBody(ref: CollectionRef, index: number, body: string): void {
  changeDraft(ref.tab, (draft) => {
    const stages = draft.stages.map((each, place) => (place === index ? { ...each, body } : each));
    const { error, ...rest } = draft;
    return error?.stage === index ? { ...rest, stages } : { ...draft, stages };
  });
}

/** The text typed: its mark of invalid goes. */
export function editText(ref: CollectionRef, value: string): void {
  changeDraft(ref.tab, (draft) => ({ ...draft, text: { value } }));
}

/** The stage whose body has the focus, which the commands that move a stage act on. */
export function focusStage(ref: CollectionRef, index: number | undefined): void {
  changePipeline(ref.tab, (kept) => {
    if (kept.focused === index) {
      return kept;
    }
    const { focused: _gone, ...rest } = kept;
    return index === undefined ? rest : { ...rest, focused: index };
  });
}
