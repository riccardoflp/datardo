/**
 * Feature: console.stop
 *
 * Ends the wait for a command that takes too long. A command that was sent cannot be taken back, so the one way to
 * stop waiting is to close the console's connection and open it again (`console.connect`): a blocking command is
 * dropped by the server with its connection and pops nothing; a script or a `KEYS` goes on until it ends. The database
 * is selected again, and an open transaction is discarded.
 */
import type { Answers, Context, Outcome, Step } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { connectSteps } from './connect';
import { durationText } from './output';
import { text } from './text';
import { consoleConnection, consoleOf } from './types';

/** The note under a stopped command: *Stopped after 12.4 s. …* */
export function stoppedNote(waitedMs: number): string {
  return text.stop.stopped(durationText(waitedMs));
}

/** Feature: console.stop — close the console's connection, then the steps of `console.connect`; nothing when idle. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = consoleConnection(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const console = id === undefined ? undefined : consoleOf(context.state, id);
  const steps: Step[] =
    connection === undefined || console?.status !== 'running'
      ? []
      : [
          {
            kind: 'app',
            text: text.stop.close(connection.name),
            action: 'console.close',
            args: { connection: connection.id },
          },
          ...connectSteps(connection, console.session.database),
        ];
  return run({
    title: text.stop.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.stop.nothingToPutBack },
    publishes: false,
    after: [],
  });
}
