/**
 * Feature: monitor.step-down
 *
 * Asks the primary of the replica set to step down, so that the members elect another one: `db.adminCommand({
 * replSetStepDown: 60, secondaryCatchUpPeriodSecs: 10 })`, after a confirmation. It reads `hello` first
 * (`monitor.read-replication`, step `hello`) for the name of the set and its primary as they are now. The command
 * goes to the server the connection reaches: the driver sends it to the primary. Ported from Mongoster's
 * `src/monitor.ts › stepDown`.
 */
import { featureId } from '../../shared/ids';
import {
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { int, isRecord } from './parts/ejson';
import { adminCommand, mongoStep, writeTimeLimitMs } from './parts/requests';
import type { ReplicationRead } from './read-replication';
import { text } from './text';
import { requiredConnection, startArgs } from './types';

/** How long the primary does not seek election, in seconds. */
export const stepDownSeconds = 60;

/** How long it waits for a secondary to catch up, in seconds. */
export const catchUpSeconds = 10;

/** The set and its primary, when `hello` found both. */
function primaryOf(read: unknown): { readonly setName: string; readonly primary: string } | undefined {
  if (!isRecord(read)) {
    return undefined;
  }
  const hello = read as unknown as ReplicationRead;
  if (hello.step !== 'hello' || hello.server.kind !== 'read') {
    return undefined;
  }
  const server = hello.server.value;
  return server.kind === 'replica-set' && server.primary !== undefined
    ? { setName: server.setName, primary: server.primary }
    : undefined;
}

/** Feature: monitor.step-down — refused without a primary, on a read-only connection; otherwise the one step. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = requiredConnection(context, startArgs(answers));
  if (connection.readOnly) {
    return refuse('monitor.step-down/read-only', text.readOnly(connection.name));
  }
  if (!('hello' in answers)) {
    return needRead('hello', 'monitor.read-replication', { connection: connection.id, step: 'hello' });
  }
  const found = primaryOf(answers['hello']);
  if (found === undefined) {
    return refuse('monitor.step-down/no-primary', text.replication.stepDown.noPrimary);
  }
  const words = text.replication.stepDown;
  const command = { replSetStepDown: int(stepDownSeconds), secondaryCatchUpPeriodSecs: int(catchUpSeconds) };
  return run({
    title: words.title(found.primary, found.setName),
    steps: [mongoStep(connection.id, adminCommand(command, writeTimeLimitMs), true)],
    danger: {
      kind: 'confirm',
      text: `${words.question(found.primary, found.setName)}\n${words.warning}`,
      button: words.button,
    },
    undo: { cannot: words.cannotUndo },
    publishes: false,
    after: [
      { kind: 'notify', level: 'success', text: words.done(found.primary) },
      {
        kind: 'start',
        feature: featureId('monitor.read-replication'),
        target: { kind: 'connection', connection: connection.id },
        args: { connection: connection.id, step: 'hello' },
      },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.step-down'), plan };
