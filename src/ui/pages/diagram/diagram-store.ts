/**
 * What the window keeps of each Relationship diagram tab (`relation.diagram`) until Datardo quits: the options kept
 * with the tab (**Sample**, **Keys only**, the moved boxes, the scale), what is selected, where the drawing is moved
 * to, and whether it was fitted in the tab once. The references themselves are the main process's, in the app's
 * state (`relation` slice).
 */
import { useSyncExternalStore } from 'react';
import type { KeptDiagram } from '../../../features/relation/model/page';
import type { DiagramSelection } from '../../../features/relation/model/drawing';
import type { ConnectionId } from '../../../shared/ids';

/** What one diagram tab keeps in the window. */
export interface DiagramTab {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly kept: KeptDiagram;
  readonly selection?: DiagramSelection;
  /** Where the top left corner of the drawing is, in pixels of the page. */
  readonly offset: { readonly x: number; readonly y: number };
  /** Whether the drawing was fitted in the tab since it was last laid out. */
  readonly fitted: boolean;
  /** The number of the last selection asked by the main process the page followed. */
  readonly selectFollowed: number;
}

const tabs = new Map<string, DiagramTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changedAll(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** What a tab keeps, when the page was shown in this run. */
export function diagramTabOf(tab: string): DiagramTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab shown for the first time. */
export function keepDiagramTab(tab: string, state: DiagramTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes what a tab keeps, and draws the page again. */
export function changeDiagramTab(tab: string, change: (state: DiagramTab) => DiagramTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are no longer open. */
export function forgetClosedDiagramTabs(open: ReadonlySet<string>): void {
  for (const tab of tabs.keys()) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** What a tab keeps, drawn again whenever it changes. */
export function useDiagramTab(tab: string): DiagramTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tabs.get(tab);
}
