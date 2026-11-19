/**
 * Feature: monitor.rates
 *
 * Turns the counters of the server, which only grow, into operations and bytes per second between two reads of
 * `monitor.read-server-status`, and keeps the last 60 points of the lines the tiles draw. The history lives while the
 * page is open: it starts empty and is not restored. Ported from Mongoster's `src/webview/monitor.ts › renderServer`
 * (the rates); the history and its lines are new in Datardo.
 */
import { operationCounters, type OperationCounter, type ServerStatus } from './read-server-status';

/** How many points a line keeps (Datardo's choice). */
export const historyPoints = 60;

/** The rates between two reads, per second. */
export interface ServerRates {
  readonly counters: Readonly<Record<OperationCounter, number>>;
  /** The sum of the rates of the six counters. */
  readonly total: number;
  /** Bytes in and out per second, when the server reports its network. */
  readonly bytesIn?: number;
  readonly bytesOut?: number;
}

/** The last values of the lines of the tiles, the oldest first. */
export interface RatesHistory {
  readonly connections: readonly number[];
  readonly operations: readonly number[];
  readonly bytesIn: readonly number[];
  readonly bytesOut: readonly number[];
}

/** No point yet: how the page starts. */
export const emptyHistory: RatesHistory = { connections: [], operations: [], bytesIn: [], bytesOut: [] };

/** The rates, when there are some, and the history with the new point. */
export interface RatesResult {
  readonly rates?: ServerRates;
  readonly history: RatesHistory;
}

/** The rate of a counter, never under 0: a counter that went down (the server restarted) gives 0. */
function rateOf(previous: number, current: number, seconds: number): number {
  return Math.max(0, (current - previous) / seconds);
}

function withPoint(points: readonly number[], value: number | undefined): readonly number[] {
  return value === undefined ? points : [...points, value].slice(-historyPoints);
}

function ratesBetween(previous: ServerStatus, current: ServerStatus, seconds: number): ServerRates {
  const counters = Object.fromEntries(
    operationCounters.map((name) => [name, rateOf(previous.counters[name], current.counters[name], seconds)]),
  ) as Record<OperationCounter, number>;
  const total = operationCounters.reduce((sum, name) => sum + counters[name], 0);
  const network =
    previous.network !== undefined && current.network !== undefined
      ? {
          bytesIn: rateOf(previous.network.bytesIn, current.network.bytesIn, seconds),
          bytesOut: rateOf(previous.network.bytesOut, current.network.bytesOut, seconds),
        }
      : {};
  return { counters, total, ...network };
}

/** Feature: monitor.rates — the rates between two reads, and the history with the new point. */
export function rates(previous: ServerStatus | undefined, current: ServerStatus, history: RatesHistory): RatesResult {
  const seconds = previous === undefined ? 0 : (current.at - previous.at) / 1000;
  const computed = previous === undefined || seconds <= 0 ? undefined : ratesBetween(previous, current, seconds);
  const next: RatesHistory = {
    connections: withPoint(history.connections, current.connections.current),
    operations: withPoint(history.operations, computed?.total),
    bytesIn: withPoint(history.bytesIn, computed?.bytesIn),
    bytesOut: withPoint(history.bytesOut, computed?.bytesOut),
  };
  return computed === undefined ? { history: next } : { rates: computed, history: next };
}

/**
 * The points of a line, each from 0 (the smallest value shown) to 1 (the largest); none with fewer than 2 points. A
 * line whose points are all equal is drawn at the middle.
 */
export function linePoints(points: readonly number[]): readonly number[] {
  if (points.length < 2) {
    return [];
  }
  const smallest = Math.min(...points);
  const largest = Math.max(...points);
  return points.map((value) => (largest === smallest ? 0.5 : (value - smallest) / (largest - smallest)));
}
