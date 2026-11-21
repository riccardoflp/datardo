/**
 * What each Index advisor tab keeps in the window alone (`advisor.show`): its scope, whether the reads run, the last
 * analysis and when it was made, and the advices whose queries are all shown. A tab's state lives until Datardo quits
 * or the tab is closed; nothing of it is saved, and the page analyzes again when it opens.
 */
import { useSyncExternalStore } from 'react';
import type { AnalysisRead } from '../../../features/advisor/parts/reading';
import type { Scope } from '../../../features/advisor/types';
import type { ConnectionId } from '../../../shared/ids';

/** What one Index advisor tab keeps. */
export interface AdvisorTab {
  readonly connection: ConnectionId;
  readonly scope: Scope;
  /** The analysis in progress: a newer one drops the replies of an older one. */
  readonly run: number;
  readonly analyzing: boolean;
  readonly analyzedAt?: number;
  readonly read?: AnalysisRead;
  readonly expanded: readonly string[];
}

const tabs = new Map<string, AdvisorTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A tab never shown in this run. */
export function freshAdvisorTab(connection: ConnectionId, scope: Scope): AdvisorTab {
  return { connection, scope, run: 0, analyzing: false, expanded: [] };
}

/** The state of a tab, when it was shown once. */
export function advisorTabOf(tab: string): AdvisorTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepAdvisorTab(tab: string, state: AdvisorTab): void {
  tabs.set(tab, state);
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** Changes the state of a tab, when it has one. */
export function changeAdvisorTab(tab: string, change: (state: AdvisorTab) => AdvisorTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    keepAdvisorTab(tab, change(state));
  }
}

/** Forgets the tabs that are closed. */
export function forgetClosedAdvisorTabs(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useAdvisorTab(tab: string | undefined): AdvisorTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
