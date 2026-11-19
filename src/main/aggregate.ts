/**
 * What the aggregate area does in the main process: a collection tab keeps its pipeline (`TabMemory.pipeline`), its
 * stages, the disabled ones and the stage shown, which `tab.restore` brings back at the next start (`aggregate.show`).
 * The pipeline is set by the app step of the editor's Operations (`aggregate.set-pipeline`), and kept as it was run
 * once `aggregate.run` read a page; the mode of the tab and its page are kept with it, in `TabMemory.query`, as
 * `query.run` keeps them (`query.restore`).
 */
import type { Intent, IntentResult } from '../shared/bridge';
import type { Json } from '../shared/engine-request';
import type { TabId } from '../shared/ids';
import type { Tab } from '../shared/state/tabs';
import { keptPipeline, readEditor } from '../features/aggregate/types';
import { keptText, restoredQuery } from '../features/query/restore';
import type { AppStateHolder } from './app-state';

function field(args: Json | undefined, name: string): unknown {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, unknown>>)[name]
    : undefined;
}

/** The collection tab named by `args.tab`, or the open tab of the collection `args` names. */
function tabOf(state: AppStateHolder, args: Json | undefined): Tab | undefined {
  const tabs = state.get().tabs.tabs;
  const named = field(args, 'tab');
  if (typeof named === 'string') {
    return tabs.find((each) => each.id === (named as TabId) && each.shows.kind === 'collection');
  }
  return tabs.find(
    (each) =>
      each.shows.kind === 'collection' &&
      each.shows.connection === field(args, 'connection') &&
      each.shows.database === field(args, 'database') &&
      each.shows.collection === field(args, 'collection'),
  );
}

/** Keeps a pipeline and, when given, the query of a tab in its memory; nothing changes when both are kept already. */
function keep(state: AppStateHolder, tab: Tab, pipeline: string, query: string | undefined): void {
  const memory = tab.memory ?? {};
  if (memory.pipeline === pipeline && (query === undefined || memory.query === query)) {
    return;
  }
  state.dispatch({
    slice: 'tabs',
    type: 'changed',
    tab: tab.id,
    memory: { ...memory, pipeline, ...(query === undefined ? {} : { query }) },
  });
}

/** `aggregate.set-pipeline`: the app step of the editor's Operations, which sets the pipeline of a tab. */
export function setPipeline(state: AppStateHolder, args: Json): Promise<void> {
  const editor = readEditor(field(args, 'pipeline'));
  const tab = tabOf(state, args);
  if (editor === undefined) {
    return Promise.reject(new Error('The step needs the pipeline to set.'));
  }
  // A tab closed meanwhile has no pipeline left to set: the step did what it could and says nothing more.
  if (tab !== undefined) {
    // Told to the window even when the pipeline is the same: it waits for this change before it reads it back.
    state.dispatch({
      slice: 'tabs',
      type: 'changed',
      tab: tab.id,
      memory: { ...tab.memory, pipeline: keptPipeline(editor) },
    });
  }
  return Promise.resolve();
}

/** Keeps the pipeline of a collection tab, and its mode, after `aggregate.run` read a page of its output. */
export function keepTabPipeline(state: AppStateHolder, intent: Intent, result: IntentResult): void {
  if (intent.feature !== 'aggregate.run' || result.kind !== 'read') {
    return;
  }
  const editor = readEditor(field(intent.args, 'pipeline'));
  const tab = tabOf(state, intent.args);
  if (editor === undefined || tab === undefined) {
    return;
  }
  const kept = field(intent.args, 'keep');
  keep(state, tab, keptPipeline(editor), typeof kept === 'string' ? keptText(restoredQuery(kept)) : undefined);
}
