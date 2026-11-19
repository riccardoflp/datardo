/**
 * What the cards of the playground area share: a playground as the main process keeps it, a run in progress and the
 * result of the last one, and the reading of the playgrounds from the app's state.
 *
 * The playgrounds are the part of the app's state named `playgrounds` (`src/shared/state/playgrounds.ts`), by tab, which
 * the main process keeps (D51: one run at a time, across every playground tab).
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { tabId, type TabId } from '../../shared/ids';
import type { PlaygroundRun, PlaygroundState, PlaygroundsState } from '../../shared/state/playgrounds';
import type { AppState } from '../../shared/state';
import type { Tab } from '../../shared/state/tabs';

export type {
  PlaygroundRun,
  PlaygroundState,
  PlaygroundsState,
  ResultLayout,
  RunError,
  RunPart,
  RunResult,
  RunValue,
  TextRange,
} from '../../shared/state/playgrounds';

/** The playgrounds in the app's state (the part named `playgrounds`). */
export function playgroundsOf(state: AppState): PlaygroundsState {
  return state.playgrounds;
}

/** The playground of a tab, when the tab is one. */
export function playgroundOf(state: AppState, tab: TabId): PlaygroundState | undefined {
  return playgroundsOf(state)[tab];
}

/** The run in progress, in whichever playground tab (D51: one at a time). */
export function runInProgress(state: AppState): PlaygroundRun | undefined {
  return Object.values(playgroundsOf(state)).find((each) => each.run !== undefined)?.run;
}

/** A playground tab: its tab, with what it shows. */
export type PlaygroundTab = Tab & { readonly shows: Extract<Tab['shows'], { kind: 'playground' }> };

/** The playground tab with this identifier, when it is open. */
export function playgroundTab(state: AppState, tab: TabId | undefined): PlaygroundTab | undefined {
  const found = state.tabs.tabs.find((each) => each.id === tab);
  return found?.shows.kind === 'playground' ? (found as PlaygroundTab) : undefined;
}

/** The active tab, when it is a playground tab. */
export function activePlayground(state: AppState): PlaygroundTab | undefined {
  return playgroundTab(state, state.tabs.active);
}

/** Whether a playground has unsaved changes: its text differs from its file, or from the text it opened with. */
export function hasUnsavedChanges(playground: PlaygroundState): boolean {
  return playground.text !== playground.savedText;
}

/** The arguments an Operation was started with (`Intent.args`), as an object; empty when there are none. */
export function startArgs(answers: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

/** A document of Extended JSON: an object of fields. */
export type JsonObject = { readonly [key: string]: Json };

/** A value as an object of fields, when it is one. */
export function jsonObject(value: Json | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

/** A text argument, when it is one. */
export function textArgument(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' ? value : undefined;
}

/** The playground tab a feature was started for: the tab named by its arguments, else the active one. */
export function startedTab(context: Context, args: Readonly<Record<string, unknown>>): PlaygroundTab | undefined {
  const named = textArgument(args, 'tab');
  return named === undefined ? activePlayground(context.state) : playgroundTab(context.state, tabId(named));
}

/** The button of a playground: `Local › shop`, followed by `(read-only)` on a read-only connection. */
export function targetLabel(connection: string, database: string, readOnly: boolean): string {
  return `${connection} › ${database}${readOnly ? ' (read-only)' : ''}`;
}
