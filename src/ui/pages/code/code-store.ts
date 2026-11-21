/**
 * What the window keeps of the Code section of each collection tab (`codegen.show`): what the code is asked of (the
 * query of the tab, or the aggregation of a chart), the query as it was taken (`codegen.source`), and the language and
 * **Full program**, which start from what the tab kept (`TabMemory.choices`). The query is taken again each time the
 * section is shown or **Code** is pressed; it lasts as long as the window.
 */
import { useSyncExternalStore } from 'react';
import { choicesOfCode, type CodeAsk } from '../../../features/codegen/show';
import type { CodeResult } from '../../../features/codegen/source';
import type { CodeLanguage } from '../../../features/codegen/types';
import type { TabId } from '../../../shared/ids';
import { currentAppState } from '../../state/store';

/** The Code section of one tab. */
export interface CodeMemory {
  /** What the code is asked of: the query of the tab, unless the Chart section asked for its own. */
  readonly ask: CodeAsk;
  /** Counted up each time the code is asked for: the section then takes the query again. */
  readonly asked: number;
  /** The query as taken when the section was shown or **Code** was pressed. */
  readonly source?: CodeResult;
  /** The `asked` the source was taken for. */
  readonly taken: number;
  readonly language: CodeLanguage;
  readonly program: boolean;
}

const memories = new Map<TabId, CodeMemory>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A section never shown in this run: the query of the tab, in the language the tab kept. */
function unshown(tab: TabId): CodeMemory {
  const kept = currentAppState().tabs.tabs.find((each) => each.id === tab)?.memory?.choices;
  return { ask: { kind: 'query' }, asked: 1, taken: 0, ...choicesOfCode(kept) };
}

/** What the window keeps of the Code section of a tab. */
export function codeMemoryOf(tab: TabId): CodeMemory {
  const memory = memories.get(tab);
  if (memory !== undefined) {
    return memory;
  }
  const first = unshown(tab);
  memories.set(tab, first);
  return first;
}

/** Changes what the window keeps of the Code section of a tab. */
export function changeCodeMemory(tab: TabId, change: (before: CodeMemory) => CodeMemory): void {
  memories.set(tab, change(codeMemoryOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** The code is asked for again, of the query of the tab or of a chart: the section takes it when shown. */
export function askCode(tab: TabId, ask: CodeAsk): void {
  changeCodeMemory(tab, (memory) => ({ ...memory, ask, asked: memory.asked + 1 }));
}

/** Forgets the sections of the tabs that are closed. */
export function forgetClosedCodes(open: ReadonlySet<string>): void {
  for (const tab of [...memories.keys()]) {
    if (!open.has(tab)) {
      memories.delete(tab);
    }
  }
}

/** What the window keeps of the Code section of a tab, drawn again when it changes. */
export function useCodeMemory(tab: TabId): CodeMemory {
  return useSyncExternalStore(subscribe, () => codeMemoryOf(tab));
}
