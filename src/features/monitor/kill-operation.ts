/**
 * Feature: monitor.kill-operation
 *
 * Stops one server operation in progress after a confirmation: `db.adminCommand({ killOp: 1, op: 4721 })`, with the
 * opid as `currentOp` gave it (a number, or the text of a mongos). Started with `{ connection, operation }`, the row
 * of the Operations section (`opid`, `type`, `namespace`, `microseconds`, `command`). Its client receives an error;
 * it cannot be undone. Not offered to an AI assistant. Ported from Mongoster's `src/monitor.ts › killOp`.
 */
import type { Json } from '../../shared/engine-request';
import {
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { int, numberField, recordOf, textField } from './parts/ejson';
import { adminCommand, mongoStep, writeTimeLimitMs } from './parts/requests';
import { runningText } from './parts/units';
import { text } from './text';
import { requiredConnection, startArgs, type MonitorConnection } from './types';

/** The operation to kill, as its row gives it. */
export interface OperationToKill {
  readonly opid: number | string;
  readonly type: string;
  readonly namespace: string;
  readonly microseconds?: number;
  readonly command: string;
}

/** The operation of the arguments, or `undefined` when it has no opid. */
export function operationOfArgs(args: unknown): OperationToKill | undefined {
  const row = recordOf(recordOf(args)['operation']);
  const opid = typeof row['opid'] === 'string' ? row['opid'] : numberField(row, 'opid');
  if (opid === undefined) {
    return undefined;
  }
  const microseconds = numberField(row, 'microseconds');
  return {
    opid,
    type: textField(row, 'type') ?? '',
    namespace: textField(row, 'namespace') ?? '',
    ...(microseconds === undefined ? {} : { microseconds }),
    command: textField(row, 'command') ?? '',
  };
}

/** The opid as it is sent: a whole number as an Int32 or a Long, the text of a mongos as text. */
export function opidValue(opid: number | string): Json {
  return typeof opid === 'string' ? opid : int(opid);
}

/** The text of the confirmation: the operation, its command on one line, then what killing it does. */
export function killText(operation: OperationToKill): string {
  const running =
    operation.microseconds === undefined ? text.operations.idleRunning : runningText(operation.microseconds);
  return [
    text.kill.operation(operation.type, operation.namespace, running),
    ...(operation.command === '' ? [] : [operation.command]),
    text.kill.warning,
  ].join('\n');
}

/** What follows the kill: the notification, and the operations read again. */
function afterKill(connection: MonitorConnection, opid: string): readonly After[] {
  return [
    { kind: 'notify', level: 'success', text: text.kill.killed(opid) },
    {
      kind: 'start',
      feature: featureId('monitor.read-operations'),
      target: { kind: 'connection', connection: connection.id },
      args: { connection: connection.id },
    },
  ];
}

/** Feature: monitor.kill-operation — refused on a read-only connection; otherwise the one step, confirmed. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  if (connection.readOnly) {
    return refuse('monitor.kill-operation/read-only', text.readOnly(connection.name));
  }
  const operation = operationOfArgs(args);
  if (operation === undefined) {
    throw new Error('monitor.kill-operation is started on an operation with an opid.');
  }
  const opid = String(operation.opid);
  const command = { killOp: int(1), op: opidValue(operation.opid) };
  return run({
    title: text.kill.title(opid),
    steps: [mongoStep(connection.id, adminCommand(command, writeTimeLimitMs), true)],
    danger: { kind: 'confirm', text: killText(operation), button: text.kill.button },
    undo: { cannot: text.kill.cannotUndo },
    publishes: false,
    after: afterKill(connection, opid),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.kill-operation'), plan };
