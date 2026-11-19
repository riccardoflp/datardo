/**
 * Feature: console.clear-history
 *
 * Deletes the commands kept for the console of one connection, after a confirmation that says how many are forgotten.
 * The output of an open console stays, and the consoles of the other connections keep their history.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { text } from './text';
import { consoleConnection, consoleOf, startArgs } from './types';

/** How many commands are kept for the connection: its console's history, or `args.count` when the state has none. */
function keptCount(context: Context, answers: Answers, connection: ConnectionId): number {
  const console = consoleOf(context.state, connection);
  if (console !== undefined) {
    return console.history.length;
  }
  const count = startArgs(answers)['count'];
  return typeof count === 'number' ? count : 0;
}

/** Feature: console.clear-history — `clear the console history of Cache local`, confirmed. */
export function plan(context: Context, answers: Answers): Outcome {
  const id = consoleConnection(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const name = connection?.name ?? '';
  const count = connection === undefined ? 0 : keptCount(context, answers, connection.id);
  if (connection === undefined || count === 0) {
    return refuse('console.clear-history/empty', text.clearHistory.empty(name));
  }
  return run({
    title: text.clearHistory.title(name),
    steps: [
      {
        kind: 'app',
        text: text.clearHistory.step(name),
        action: 'console.clear-history',
        args: { connection: connection.id },
      },
    ],
    danger: { kind: 'confirm', text: text.clearHistory.forgotten(count), button: text.clearHistory.button },
    undo: { cannot: text.clearHistory.cannotUndo },
    publishes: false,
    after: [{ kind: 'notify', level: 'success', text: text.clearHistory.cleared(name) }],
  });
}
