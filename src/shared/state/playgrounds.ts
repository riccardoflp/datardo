/**
 * The part of the app's state about the playgrounds (playground.md): for each playground tab, its text, the text of its
 * file as last saved, its default database, the run in progress and the result of the last run. The main process
 * keeps it; one run at a time, across every playground tab (D51). The results are not kept when the tab closes or
 * Datardo restarts. A tab closed while its playground runs keeps its playground until the run ends, so that no other
 * playground runs before (`playground.stop`).
 */
import type { Json } from '../engine-request';
import type { ConnectionId, TabId } from '../ids';

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
  /** Its tab was closed while it ran: it goes when the run ends. */
  readonly closed?: boolean;
}

/** The playgrounds, by tab. */
export type PlaygroundsState = Readonly<Record<string, PlaygroundState>>;

/** No playground open. */
export const initialPlaygroundsState: PlaygroundsState = {};

/** The events of this part of the state. */
export type PlaygroundsEvent =
  | { readonly slice: 'playgrounds'; readonly type: 'opened'; readonly playground: PlaygroundState }
  | {
      readonly slice: 'playgrounds';
      readonly type: 'edited';
      readonly tab: TabId;
      readonly text: string;
      readonly selection?: TextRange;
    }
  | { readonly slice: 'playgrounds'; readonly type: 'target-set'; readonly tab: TabId; readonly database: string }
  | { readonly slice: 'playgrounds'; readonly type: 'saved'; readonly tab: TabId; readonly text: string }
  | { readonly slice: 'playgrounds'; readonly type: 'run-started'; readonly run: PlaygroundRun }
  | { readonly slice: 'playgrounds'; readonly type: 'run-waiting'; readonly tab: TabId; readonly waiting: boolean }
  | { readonly slice: 'playgrounds'; readonly type: 'run-ended'; readonly tab: TabId; readonly result: RunResult }
  | {
      readonly slice: 'playgrounds';
      readonly type: 'layout-chosen';
      readonly tab: TabId;
      readonly layout: ResultLayout;
    }
  | { readonly slice: 'playgrounds'; readonly type: 'closed'; readonly tab: TabId };

function changed(
  state: PlaygroundsState,
  tab: TabId,
  change: (playground: PlaygroundState) => PlaygroundState,
): PlaygroundsState {
  const playground = state[tab];
  return playground === undefined ? state : { ...state, [tab]: change(playground) };
}

function without(state: PlaygroundsState, tab: TabId): PlaygroundsState {
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== tab));
}

/** A run that ended: its result, the line it failed on, and a tab closed while it ran goes. */
function ended(state: PlaygroundsState, tab: TabId, result: RunResult): PlaygroundsState {
  const playground = state[tab];
  if (playground === undefined) {
    return state;
  }
  if (playground.closed === true) {
    return without(state, tab);
  }
  const { run: _run, failedLine: _failed, ...rest } = playground;
  const line = result.stopped === true ? undefined : result.error?.line;
  return { ...state, [tab]: { ...rest, result, ...(line === undefined ? {} : { failedLine: line }) } };
}

function edited(playground: PlaygroundState, text: string, selection: TextRange | undefined): PlaygroundState {
  const { failedLine, selection: _selection, ...rest } = playground;
  const keptLine = text === playground.text && failedLine !== undefined ? { failedLine } : {};
  return { ...rest, text, ...keptLine, ...(selection === undefined ? {} : { selection }) };
}

function closed(state: PlaygroundsState, tab: TabId): PlaygroundsState {
  const playground = state[tab];
  if (playground?.run !== undefined) {
    return { ...state, [tab]: { ...playground, closed: true } };
  }
  return without(state, tab);
}

/** Changes this part of the state. */
export function reducePlaygrounds(state: PlaygroundsState, event: PlaygroundsEvent): PlaygroundsState {
  switch (event.type) {
    case 'opened':
      return { ...state, [event.playground.tab]: event.playground };
    case 'edited':
      return changed(state, event.tab, (playground) => edited(playground, event.text, event.selection));
    case 'target-set':
      return changed(state, event.tab, (playground) => ({ ...playground, defaultDatabase: event.database }));
    case 'saved':
      return changed(state, event.tab, (playground) => ({ ...playground, savedText: event.text }));
    case 'run-started':
      return changed(state, event.run.tab, (playground) => {
        const { failedLine: _failed, ...rest } = playground;
        return { ...rest, run: event.run };
      });
    case 'run-waiting':
      return changed(state, event.tab, (playground) =>
        playground.run === undefined
          ? playground
          : { ...playground, run: { ...playground.run, waitingForDrop: event.waiting } },
      );
    case 'run-ended':
      return ended(state, event.tab, event.result);
    case 'layout-chosen':
      return Object.fromEntries(
        Object.entries(state).map(([key, playground]) => [key, { ...playground, layout: event.layout }]),
      );
    case 'closed':
      return closed(state, event.tab);
  }
}
