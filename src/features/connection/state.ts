/**
 * Feature: connection.state — keeps the state of every saved connection from what happens to its client, and takes
 * the latency of the current one from its ping. The ping itself is the one `nav.ping` sends: this module says what to
 * send and what its answer does to the state.
 */
import type { ConnectionStateName } from '../../shared/connection';
import type { EngineRequest, Json } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { stateText } from './text';
import { connectionById, jsonFields } from './types';

/** How often the current connection is pinged, and how long it has to answer (connection.state, `nav.ping`). */
export const pingEveryMs = 10_000;

/** How long a ping has to answer before it reads *no answer*. */
export const pingAnswerMs = 5000;

/** The ping of an engine: `db.adminCommand({ ping: 1 })` or `PING`. */
export function pingRequest(engine: 'mongodb' | 'redis'): EngineRequest {
  return engine === 'mongodb'
    ? {
        engine: 'mongodb',
        database: 'admin',
        method: 'runCommand',
        arguments: [{ ping: { $numberInt: '1' } }],
        timeLimitMs: pingAnswerMs,
      }
    : { ...redisCommand(0, 'PING'), timeLimitMs: pingAnswerMs };
}

/** Feature: connection.state — the ping of the connection `args.connection`. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const fields = jsonFields(args);
  const id = connectionId(typeof fields['connection'] === 'string' ? fields['connection'] : '');
  const connection = connectionById(context, id);
  if (connection === undefined) {
    throw new Error(`No connection is saved with the id ${id}.`);
  }
  return { kind: 'engine', requests: [{ connection: id, request: pingRequest(connection.engine) }] };
}

/** How a ping ended: answered in time, answered after the 5 seconds, or *no answer* (an error, or nothing). */
export type PingOutcome = 'answered' | 'late' | 'no-answer';

/** Feature: connection.state — a reply to the ping is an answer; an error never reaches here. */
export function parse(_replies: readonly unknown[]): PingOutcome {
  return 'answered';
}

/** The state after a ping of the current connection: *no answer* starts reconnecting; a late reply changes nothing. */
export function stateAfterPing(state: ConnectionStateName, ping: PingOutcome): ConnectionStateName {
  return state === 'connected' && ping === 'no-answer' ? 'reconnecting' : state;
}

/** The state as it is written: **not connected**, **connecting…**, **connected**, **reconnecting…**, **failed**. */
export function connectionStateText(state: ConnectionStateName): string {
  return stateText[state];
}
