/**
 * Feature: server.slow-log-reset
 *
 * Empties the server's slow log, to see what is slow from now on: one step, `SLOWLOG RESET`, after a confirmation
 * that says how many entries are removed, for every client and every tool. The threshold is not changed. It cannot be
 * undone: the entries are kept nowhere else. Built as Mongoster's **Clear** of the profiler (`src/monitor.ts ›
 * clearProfile`). It is not offered to an AI assistant.
 */
import type { Answers, Context, EngineStep, Outcome } from '../../shared/feature';
import { needRead, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { runnerText } from '../runner/text';
import { stepText } from '../runner/step-text';
import type { SlowLogRead } from './read-slow-log';
import { text } from './text';
import { connectionTarget, isObject, serverCommand } from './types';

/** The number of entries the read of `SLOWLOG LEN` gave under `length`; `undefined` until it is read. */
function lengthOf(answers: Answers): number | undefined {
  const read = answers['length'];
  if (!isObject(read)) {
    return undefined;
  }
  const length = (read as SlowLogRead).length;
  if (length?.kind === 'unavailable') {
    throw new Error(length.unavailable.sentence);
  }
  return length?.value;
}

/** Feature: server.slow-log-reset — on the connection of the target: reads `SLOWLOG LEN`, then the plan. */
export function plan(context: Context, answers: Answers): Outcome {
  const id = targetConnection(context.target);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection === undefined) {
    throw new Error('server.slow-log-reset needs a Redis connection.');
  }
  if (connection.readOnly) {
    return refuse('server.slow-log-reset/read-only', runnerText.readOnly(connection.name));
  }
  const length = lengthOf(answers);
  if (length === undefined) {
    return needRead('length', 'server.read-slow-log', { connection: connection.id, part: 'length' });
  }
  if (length === 0) {
    return refuse('server.slow-log-reset/empty', text.reset.empty(connection.name));
  }
  const step: Omit<EngineStep, 'text'> = {
    kind: 'engine',
    connection: connection.id,
    request: serverCommand('SLOWLOG', 'RESET'),
    writes: true,
  };
  return run({
    title: text.reset.title(connection.name),
    steps: [{ ...step, text: stepText(step) }],
    danger: { kind: 'confirm', text: text.reset.removed(length), button: text.reset.button },
    touches: text.reset.touches(length),
    undo: { cannot: text.reset.cannotUndo },
    publishes: false,
    after: [
      { kind: 'notify', level: 'success', text: text.reset.cleared(connection.name) },
      {
        kind: 'start',
        feature: featureId('server.read-slow-log'),
        target: connectionTarget(connection.id),
        args: { connection: connection.id, part: 'entries' },
      },
    ],
  });
}
