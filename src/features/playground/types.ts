/**
 * What the cards of the playground area share: a playground as the main process keeps it, a run in progress and the
 * result of the last one, and the reading of the playgrounds from the app's state.
 *
 * The playgrounds are a part of the app's state named `playgrounds`, by tab, which the main process keeps (D51: one
 * run at a time, across every playground tab). Until that part is registered in `src/shared/state`, the cards read it
 * as the console area reads its own, through {@link playgroundsOf}.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { tabId, type ConnectionId, type TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Tab } from '../../shared/state/tabs';

/** What a run runs: the whole script, the selected text, or one statement. */
export type RunPart = 'all' | 'selection' | 'statement';

/** A range of the text, as offsets: a selection of the editor. */
export interface TextRange {
  readonly from: number;
  readonly to: number;
}

/** A run in progress (glossary, "run"; `PlaygroundRun`). */
export interface PlaygroundRun {
  readonly tab: TabId;
  /** `Playground 1`, `Playground 1 (lines 3–5)`. */
  readonly title: string;
  readonly connection: ConnectionId;
  readonly connectionName: string;
  readonly database: string;
  /** When it started, in milliseconds since 1970. */
  readonly startedAt: number;
  /** The line of the script on which the text run starts, from 1. */
  readonly firstLine: number;
  /** While the run waits at a drop for the user's answer (`playground.writes`). */
  readonly waitingForDrop?: boolean;
}

/** An error of a run: its message, and its line in the script when it is known. */
export interface RunError {
  readonly message: string;
  readonly line?: number;
}

/**
 * The value of the last expression of a run, as the process sends it: documents (of a cursor, or an array whose every
 * element is a document) as canonical Extended JSON; any other value as canonical Extended JSON, or as the text
 * JavaScript gives it when it cannot be BSON (a function, a cycle, the connection); or nothing.
 */
export type RunValue =
  | { readonly kind: 'documents'; readonly documents: readonly Json[]; readonly more: boolean }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'none' };

/** What a run left: shown under the editor until the next run (`playground.results`). */
export interface RunResult {
  readonly title: string;
  readonly connectionName: string;
  /** The database current when the script ended. */
  readonly database: string;
  readonly durationMs: number;
  readonly value: RunValue;
  /** The lines the script printed, in order, and the notes of `playground.sessions`. */
  readonly output: readonly string[];
  readonly error?: RunError;
  /** The run was stopped (`playground.stop`). */
  readonly stopped?: boolean;
}

/** How the documents of a result are shown; the choice is kept for the next runs. */
export type ResultLayout = 'table' | 'json';

/** A playground as the main process keeps it, by its tab. */
export interface PlaygroundState {
  readonly tab: TabId;
  /** The database it runs on until its script calls `use("…")` (glossary, "default database"). */
  readonly defaultDatabase: string;
  /** The text of the editor. */
  readonly text: string;
  /** The text of its file as last saved, or for one never saved the text it opened with. */
  readonly savedText: string;
  /** The selection and the caret the editor last reported, for **Run selection** and **Run statement** from Go to. */
  readonly selection?: TextRange;
  readonly run?: PlaygroundRun;
  readonly result?: RunResult;
  /** The line marked after a run that failed with a line, until the text changes or another run starts. */
  readonly failedLine?: number;
  readonly layout: ResultLayout;
}

/** The playgrounds, by tab. */
export type PlaygroundsState = Readonly<Record<string, PlaygroundState>>;

/** The playgrounds in the app's state (the part named `playgrounds`). */
export function playgroundsOf(state: AppState): PlaygroundsState {
  return (state as AppState & { readonly playgrounds?: PlaygroundsState }).playgrounds ?? {};
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
