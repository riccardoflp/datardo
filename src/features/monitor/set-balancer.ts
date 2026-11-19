/**
 * Feature: monitor.set-balancer
 *
 * Stops the balancer of the cluster, or starts it again: `db.adminCommand({ balancerStop: 1 })` or
 * `db.adminCommand({ balancerStart: 1 })`, after a confirmation. Started with `{ connection, balancer }`, `balancer`
 * being `stop` or `start` (the button the section shows for the mode it read). Ported from Mongoster's
 * `src/monitor.ts › setBalancer`; `src/sharding.ts › setBalancer`.
 */
import { featureId } from '../../shared/ids';
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { int } from './parts/ejson';
import { adminCommand, mongoStep, writeTimeLimitMs } from './parts/requests';
import { text } from './text';
import { requiredConnection, startArgs, textArg } from './types';

/** Feature: monitor.set-balancer — refused on a read-only connection and not through a mongos; otherwise one step. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  const words = text.sharding.setBalancer;
  if (connection.readOnly) {
    return refuse('monitor.set-balancer/read-only', text.readOnly(connection.name));
  }
  if (!connection.mongos) {
    return refuse('monitor.set-balancer/unsupported', words.unsupported);
  }
  const stop = textArg(args, 'balancer') !== 'start';
  const command = stop ? { balancerStop: int(1) } : { balancerStart: int(1) };
  return run({
    title: stop ? words.stopTitle : words.startTitle,
    steps: [mongoStep(connection.id, adminCommand(command, writeTimeLimitMs), true)],
    danger: {
      kind: 'confirm',
      text: stop ? `${words.stopQuestion}\n${words.stopWarning}` : `${words.startQuestion}\n${words.startWarning}`,
      button: stop ? words.stopButton : words.startButton,
    },
    undo: { cannot: words.cannotUndo },
    publishes: false,
    after: [
      { kind: 'notify', level: 'success', text: stop ? words.stopped : words.started },
      {
        kind: 'start',
        feature: featureId('monitor.read-sharding'),
        target: { kind: 'connection', connection: connection.id },
        args: { connection: connection.id, step: 'cluster', full: true },
      },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.set-balancer'), plan };
