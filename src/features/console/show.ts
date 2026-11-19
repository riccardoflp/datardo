/**
 * Feature: console.show
 *
 * The console tab of a Redis connection: the toolbar with the console's database as a menu, **Clear output** and the
 * notice that commands run here are not recorded in the undo history; the output; the input. One tab per connection,
 * on a connection of its own to the server. `view` says what the tab shows; `plan` is what **Console** of the tree
 * island and Go to start: it opens the tab, connecting the connection first when it is not connected.
 */
import type { After, Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { durationText } from './output';
import { promptOf } from './session';
import { text } from './text';
import type { ConsoleState } from './types';
import { consoleConnection } from './types';

/** The status line shows a command as work in progress once it has run for 400 ms (Datardo's choice). */
export const workShownAfterMs = 400;

/** One database of the menu: `db3`, and the line it runs, `SELECT 3`. */
export interface DatabaseChoice {
  readonly label: string;
  readonly line: string;
  readonly chosen: boolean;
}

/** What the console tab shows. */
export interface ConsoleView {
  readonly title: string;
  readonly toolbar: {
    readonly database: {
      readonly label: string;
      readonly value: string;
      readonly choices: readonly DatabaseChoice[];
      readonly feature: 'console.run';
      readonly element: 'console.run@toolbar';
    };
    readonly clear: {
      readonly label: string;
      readonly feature: 'console.clear';
      readonly element: 'console.clear@toolbar';
    };
    readonly notice: string;
  };
  readonly state: 'connecting' | 'empty' | 'running' | 'ready' | 'closed';
  readonly prompt: string;
  /** **Read-only** on the status line, for a read-only connection. */
  readonly readOnly?: string;
  /** *db0 · RESP3 · 12 ms* */
  readonly status: string;
}

/** What the tab is drawn from: its console, the connection's name and read-only, the databases the tree island shows. */
export interface ConsoleShowInput {
  readonly console: ConsoleState;
  readonly readOnly: boolean;
  readonly databases: readonly number[];
}

function stateOf(console: ConsoleState): ConsoleView['state'] {
  if (console.status === 'connecting' || console.status === 'running' || console.status === 'closed') {
    return console.status;
  }
  return console.entries.length === 0 ? 'empty' : 'ready';
}

/** Feature: console.show — what the console tab shows. */
export function view(input: ConsoleShowInput): ConsoleView {
  const { console } = input;
  const database = console.session.database;
  const databases = input.databases.includes(database) ? input.databases : [...input.databases, database];
  return {
    title: text.show.title,
    toolbar: {
      database: {
        label: text.show.database,
        value: `db${String(database)}`,
        choices: [...databases]
          .sort((first, second) => first - second)
          .map((each) => ({ label: `db${String(each)}`, line: `SELECT ${String(each)}`, chosen: each === database })),
        feature: 'console.run',
        element: 'console.run@toolbar',
      },
      clear: { label: text.show.clearOutput, feature: 'console.clear', element: 'console.clear@toolbar' },
      notice: input.readOnly ? `${text.show.notice} ${text.show.readOnlyNotice}` : text.show.notice,
    },
    state: stateOf(console),
    prompt: promptOf(console.session),
    ...(input.readOnly ? { readOnly: text.show.readOnly } : {}),
    status: text.show.status(
      database,
      console.session.protocol,
      console.lastReplyMs === undefined ? undefined : durationText(console.lastReplyMs),
    ),
  };
}

/** Whether **Console** is offered: the connection is a Redis connection. */
export function isOffered(state: AppState, connection: string): boolean {
  return state.connections.saved.some((each) => each.id === connection && each.engine === 'redis');
}

/** Feature: console.show — opens the console tab of the Redis connection, connecting it first when it is not. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = consoleConnection(context) ?? context.state.nav.current;
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const after: After[] = [];
  if (connection?.engine === 'redis') {
    const target = { kind: 'connection', connection: connection.id } as const;
    if (connectionState(context.state.connections, connection.id) !== 'connected') {
      after.push({ kind: 'start', feature: featureId('connection.connect'), target });
    }
    after.push({
      kind: 'start',
      feature: featureId('tab.open'),
      target,
      args: { shows: { kind: 'console', connection: connection.id } },
    });
  }
  return run({
    title: text.show.title,
    steps: [],
    danger: { kind: 'none' },
    undo: { cannot: text.connect.nothingWritten },
    publishes: false,
    after,
  });
}
