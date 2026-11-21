/**
 * What the controls of a console tab start through the bridge: the lines of the input run one after the other
 * (`console.input`, `console.run`), **Stop** (`console.stop`), **Clear output** (`console.clear`), the history on `Up`
 * and `Down` (`console.history`), and the read of the commands the server knows (`console.command-docs`).
 */
import { builtinDocs, type CommandDocs } from '../../../features/console/command-docs';
import { browseHistory } from '../../../features/console/history';
import { linesToRun } from '../../../features/console/input';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId, type Place } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import type { Target } from '../../../shared/target';
import { startFeature } from '../../shell/intent';
import { changeTab, consoleTabOf, withText } from './console-store';

/** What the features of a console are started on: its connection. */
export function consoleTarget(connection: ConnectionId): Target {
  return { kind: 'connection', connection };
}

function start(connection: ConnectionId, feature: string, place: Place, args?: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: consoleTarget(connection),
    place,
    ...(args === undefined ? {} : { args }),
  });
}

/**
 * Runs the lines of the input, each after the reply of the one before (`console.input`): a line run leaves the input;
 * the run stops at the first line refused, that cannot be read or whose confirmation is cancelled, which stays there
 * with the lines after it.
 */
export async function runInput(tab: string, place: Place = 'editor'): Promise<void> {
  const state = consoleTabOf(tab);
  if (state === undefined || state.running) {
    return;
  }
  const lines = linesToRun(state.typed);
  if (lines.length === 0) {
    return;
  }
  changeTab(tab, (each) => ({ ...each, running: true }));
  try {
    let left = lines;
    for (const line of lines) {
      const result = await start(state.connection, 'console.run', place, { line, lines: lines.length });
      if (result.kind !== 'done') {
        break;
      }
      left = left.slice(1);
      changeTab(tab, (each) => ({ ...withText(each, left.join('\n')), browsing: { typed: '' } }));
    }
  } finally {
    changeTab(tab, (each) => ({ ...each, running: false, focus: each.focus + 1 }));
  }
}

/** Runs one line as if it were typed, the input left as it is: the database menu, **Run again**. */
export function runLine(connection: ConnectionId, line: string, place: Place): void {
  void start(connection, 'console.run', place, { line, lines: 1 });
}

/** **Stop**: closes the console's connection and opens it again (`console.stop`). */
export function stopCommand(connection: ConnectionId): void {
  startFeature('console.stop', { place: 'editor', target: consoleTarget(connection) });
}

/** **Clear output** and `Ctrl+L` (`console.clear`); the focus goes back to the input. */
export function clearOutput(tab: string, connection: ConnectionId, place: Place): void {
  startFeature('console.clear', { place, target: consoleTarget(connection) });
  changeTab(tab, (each) => ({ ...each, shown: {}, whole: [], focus: each.focus + 1 }));
}

/** `Up` (older) and `Down` (newer): the line of the history the input shows (`console.history`). */
export function browse(tab: string, history: readonly string[], direction: 'older' | 'newer'): void {
  changeTab(tab, (state) => {
    const went = browseHistory(history, state.browsing, state.typed, direction);
    return went.line === state.typed && went.browsing === state.browsing
      ? state
      : { ...withText(state, went.line), browsing: went.browsing };
  });
}

/** The `redis_version` of a connection's server, empty when it is not known. */
export function versionOf(app: AppState, connection: ConnectionId): string {
  const server = app.connections.live[connection]?.server;
  return server?.engine === 'redis' ? server.redisVersion : '';
}

/**
 * Reads the commands the server knows, once for each opening of the console's connection, on the ordinary client;
 * the built-in list stands for them until the reply arrives, and when the read fails.
 */
export async function readDocs(tab: string, connection: ConnectionId, opened: number, version: string): Promise<void> {
  changeTab(tab, (state) => ({ ...state, docs: { read: builtinDocs(version), opened } }));
  const result = await start(connection, 'console.command-docs', 'editor', { connection });
  if (result.kind !== 'read') {
    return;
  }
  const read = result.result as CommandDocs;
  changeTab(tab, (state) => (state.docs?.opened === opened ? { ...state, docs: { read, opened } } : state));
}

/** Runs the input of the active console tab, when one is active: **Run console command** in Go to. */
export function runActiveConsole(app: AppState): boolean {
  const active = activeTabOf(app.tabs);
  if (active?.shows.kind !== 'console' || consoleTabOf(active.id) === undefined) {
    return false;
  }
  void runInput(active.id);
  return true;
}
