/**
 * Feature: console.clear
 *
 * Empties the output of the console of a connection. The history of commands, the database and an open transaction
 * stay; a command still running stays in the output, with its reply when it arrives. Nothing is sent to the server.
 */
import type { AppStep, Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { text } from './text';
import { consoleConnection } from './types';

export { clearedEntries } from '../../shared/state/consoles';

/** Feature: console.clear — the app step `clear the output of the console of Cache local`. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = consoleConnection(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const steps: AppStep[] =
    connection === undefined
      ? []
      : [
          {
            kind: 'app',
            text: text.clear.step(connection.name),
            action: 'console.clear',
            args: { connection: connection.id },
          },
        ];
  return run({
    title: text.clear.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.clear.cannotUndo },
    publishes: false,
    after: [],
  });
}
