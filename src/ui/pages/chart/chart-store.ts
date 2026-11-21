/**
 * What the window keeps of the Chart section of each collection tab (`chart.show`): what the controls hold, **Data**,
 * the last draw asked for, whether it runs, the chart it drew or why it failed. The input starts from what the tab
 * kept (`TabMemory.choices`, kept by the main process once a chart is drawn); the rest lasts as long as the window.
 * The canvas of each drawn chart is known here too, for the picture of **Save picture…**.
 */
import { useSyncExternalStore } from 'react';
import { inputOfChoices, type ChartDataMode, type DrawnChart } from '../../../features/chart/show';
import type { ChartInput } from '../../../features/chart/types';
import type { TabId } from '../../../shared/ids';
import { currentAppState } from '../../state/store';

/** The Chart section of one tab. */
export interface ChartMemory {
  readonly input: ChartInput;
  readonly mode: ChartDataMode;
  /** The number of the last draw asked for: an earlier one that ends later is not shown. */
  readonly number: number;
  readonly running: boolean;
  readonly drawn?: DrawnChart;
  readonly error?: string;
  /** Whether a draw was asked for: the message of options that are wrong is then shown. */
  readonly checked: boolean;
}

const memories = new Map<TabId, ChartMemory>();
const canvases = new Map<TabId, HTMLCanvasElement>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A section never shown in this run: the input the tab kept, or a Bar of count with **Top** at 20. */
function unshown(tab: TabId): ChartMemory {
  const kept = currentAppState().tabs.tabs.find((each) => each.id === tab)?.memory?.choices;
  return { input: inputOfChoices(kept), mode: 'filter', number: 0, running: false, checked: false };
}

/** What the window keeps of the Chart section of a tab. */
export function chartMemoryOf(tab: TabId): ChartMemory {
  const memory = memories.get(tab);
  if (memory !== undefined) {
    return memory;
  }
  const first = unshown(tab);
  memories.set(tab, first);
  return first;
}

/** Changes what the window keeps of the Chart section of a tab. */
export function changeChartMemory(tab: TabId, change: (before: ChartMemory) => ChartMemory): void {
  memories.set(tab, change(chartMemoryOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** The canvas the chart of a tab is drawn on, while it is drawn. */
export function keepCanvas(tab: TabId, canvas: HTMLCanvasElement | undefined): void {
  if (canvas === undefined) {
    canvases.delete(tab);
  } else {
    canvases.set(tab, canvas);
  }
}

/** The canvas of the chart of a tab, while it is drawn. */
export function canvasOf(tab: TabId): HTMLCanvasElement | undefined {
  return canvases.get(tab);
}

/** Forgets the sections of the tabs that are closed. */
export function forgetClosedCharts(open: ReadonlySet<string>): void {
  for (const tab of [...memories.keys()]) {
    if (!open.has(tab)) {
      memories.delete(tab);
      canvases.delete(tab);
    }
  }
}

/** What the window keeps of the Chart section of a tab, drawn again when it changes. */
export function useChartMemory(tab: TabId): ChartMemory {
  return useSyncExternalStore(subscribe, () => chartMemoryOf(tab));
}
