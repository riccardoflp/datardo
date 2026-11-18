/**
 * Feature: nav.ping
 *
 * How long the server of the current connection takes to answer, for the connection island and the status line. It
 * runs by itself while the current connection is connected: at once, then every 10 seconds, never while the window is
 * minimized or hidden, never on a connection that is not current. It is not work in progress and writes no Log line.
 */
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { redisCommand, type Json } from '../../shared/engine-request';
import { connectionId, featureId } from '../../shared/ids';
import { currentOf } from './current-connection';
import { text } from './text';
import { findConnection, navInput, textArg, type NavInput, type SavedConnection } from './types';

/** How often the current connection is pinged, in ms (Datardo's choice). */
export const pingIntervalMs = 10_000;
/** How long a reply is waited for before it reads *no answer*, in ms (Datardo's choice). */
export const pingTimeLimitMs = 5000;
/** From how many ms a latency is shown in the warning color (Datardo's choice). */
export const slowLatencyMs = 500;

/** The connection to ping: the current one, while it is connected; `undefined` otherwise. */
export function connectionToPing(input: NavInput): SavedConnection | undefined {
  const current = currentOf(input);
  return current?.status.kind === 'connected' ? current : undefined;
}

/** What is sent: `db.adminCommand({ ping: 1 })` to MongoDB, `PING` to Redis; nothing to a connection not connected. */
export function request(context: Context, args: Json): ReadRequest {
  const input = navInput(context.state);
  const asked = textArg(args, 'connection');
  const connection =
    asked !== undefined ? findConnection(input.connections, connectionId(asked)) : connectionToPing(input);
  if (connection === undefined || connection.status.kind !== 'connected') {
    return { kind: 'engine', requests: [] };
  }
  const engineRequest =
    connection.engine === 'mongodb'
      ? {
          engine: 'mongodb' as const,
          database: 'admin',
          method: 'runCommand',
          arguments: [{ ping: 1 }],
          timeLimitMs: pingTimeLimitMs,
        }
      : { ...redisCommand(0, 'PING'), timeLimitMs: pingTimeLimitMs };
  return { kind: 'engine', requests: [{ connection: connection.id, request: engineRequest }] };
}

/**
 * Whether the server answered: `{ ok: 1 }` from MongoDB, `PONG` from Redis. The time from sending to the reply is
 * measured by whoever sends it, around the request, and written by {@link latencyText}.
 */
export function parse(replies: readonly unknown[]): boolean {
  const reply = replies[0];
  if (reply === 'PONG') {
    return true;
  }
  if (reply instanceof Uint8Array) {
    return new TextDecoder().decode(reply) === 'PONG';
  }
  return typeof reply === 'object' && reply !== null && Number((reply as { ok?: unknown }).ok) === 1;
}

/** A latency as the island and the status line write it: `<1 ms`, `4 ms`, `1.2 s`, or *no answer*. */
export function latencyText(milliseconds: number | undefined): string {
  if (milliseconds === undefined) {
    return text.ping.noAnswer;
  }
  if (milliseconds < 1) {
    return '<1 ms';
  }
  if (milliseconds < 1000) {
    return `${String(Math.round(milliseconds))} ms`;
  }
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

/** Whether a latency is shown in the warning color. */
export function isSlow(milliseconds: number | undefined): boolean {
  return milliseconds !== undefined && milliseconds >= slowLatencyMs;
}

/** The latency of a connection, as last read, when it was read for it. */
export function latencyOf(input: NavInput, connection: SavedConnection): number | undefined {
  const latency = input.nav.latency;
  return latency?.connection === connection.id ? latency.milliseconds : undefined;
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = {
  kind: 'read',
  id: featureId('nav.ping'),
  request,
  parse: (replies) => parse(replies),
};
