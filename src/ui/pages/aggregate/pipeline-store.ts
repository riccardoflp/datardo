/**
 * The window's own memory of the pipeline of each collection tab (`aggregate.show`): the editor as typed (its stages,
 * the stage shown, the text and its marks), what was last run, and what the editor asks of the focus. What the tab
 * keeps across starts is in `TabMemory.pipeline`, which the main process sets with the app step of each Operation of
 * the editor and once `aggregate.run` has read; the window reads it back whenever it changes.
 */
import { useSyncExternalStore } from 'react';
import { emptyEditor, keptPipeline, restoredPipeline, type PipelineEditor } from '../../../features/aggregate/types';
import type { TabId } from '../../../shared/ids';
import { currentAppState } from '../../state/store';

/** What the window keeps of the pipeline of one tab. */
export interface PipelineTab {
  /** The editor as it is now, with what was typed and not yet run. */
  readonly draft: PipelineEditor;
  /** The text of `TabMemory.pipeline` the draft was read from, or that the window expects it to become. */
  readonly basis?: string;
  /** The pipeline as last run, which the paging and **Refresh** run again. */
  readonly ran?: PipelineEditor;
  /** What the table says in place of rows after a pipeline that wrote. */
  readonly note?: string;
  /** Asks the name of a stage for the focus with its text selected: a new number each time. */
  readonly focusName?: { readonly stage: number; readonly at: number };
  /** Asks the text for the focus: a new number each time. */
  readonly focusText?: number;
  /** A card to flash once, after a condition was dropped into it. */
  readonly flash?: { readonly stage: number; readonly at: number };
  /** The stage whose body has the focus, which the commands that move a stage act on. */
  readonly focused?: number;
}

const tabs = new Map<TabId, PipelineTab>();
const listeners = new Set<() => void>();

function memoryOf(tab: TabId): string | undefined {
  return currentAppState().tabs.tabs.find((each) => each.id === tab)?.memory?.pipeline;
}

/** The pipeline the window keeps of a tab; the first time, the one the tab kept. */
export function pipelineOf(tab: TabId): PipelineTab {
  const known = tabs.get(tab);
  if (known !== undefined) {
    return known;
  }
  const kept = memoryOf(tab);
  const made: PipelineTab = {
    draft: restoredPipeline(kept) ?? emptyEditor,
    ...(kept === undefined ? {} : { basis: kept }),
  };
  // Kept at once, without drawing again, so that every read of the same tab gives the same object.
  tabs.set(tab, made);
  return made;
}

/** Changes what the window keeps of the pipeline of a tab, and draws it again. */
export function changePipeline(tab: TabId, change: (before: PipelineTab) => PipelineTab): void {
  const before = pipelineOf(tab);
  const after = change(before);
  if (after === before && tabs.has(tab)) {
    return;
  }
  tabs.set(tab, after);
  for (const listener of listeners) {
    listener();
  }
}

/** Changes the editor as typed. */
export function changeDraft(tab: TabId, change: (before: PipelineEditor) => PipelineEditor): void {
  changePipeline(tab, (before) => {
    const draft = change(before.draft);
    return draft === before.draft ? before : { ...before, draft };
  });
}

/** Notes the pipeline the window sends, which the tab will keep: reading it back then changes nothing typed since. */
export function expectKept(tab: TabId, editor: PipelineEditor): void {
  changePipeline(tab, (before) => ({ ...before, basis: keptPipeline(editor) }));
}

/** Reads the pipeline the tab keeps again, when it is not what the draft came from: an Operation changed it. */
export function readKept(tab: TabId, kept: string | undefined = memoryOf(tab)): void {
  if (kept === undefined || kept === pipelineOf(tab).basis) {
    return;
  }
  const editor = restoredPipeline(kept);
  changePipeline(tab, (before) => ({ ...before, basis: kept, ...(editor === undefined ? {} : { draft: editor }) }));
}

/** Forgets the tabs that are no longer open. */
export function forgetClosedPipelines(open: ReadonlySet<TabId>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The pipeline of a tab as the window keeps it, drawn again whenever it changes. */
export function usePipeline(tab: TabId): PipelineTab {
  return useSyncExternalStore(subscribe, () => tabs.get(tab) ?? pipelineOf(tab));
}
