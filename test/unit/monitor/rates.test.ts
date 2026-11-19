import { describe, expect, it } from 'vitest';
import { emptyHistory, historyPoints, linePoints, rates } from '../../../src/features/monitor/rates';
import type { ServerStatus } from '../../../src/features/monitor/read-server-status';
import { rateText, sizeText } from '../../../src/features/monitor/parts/units';
import { now } from './context';

function status(at: number, counters: Partial<ServerStatus['counters']> = {}, bytesIn = 0): ServerStatus {
  return {
    host: 'db1.example.net:27017',
    version: '8.2.0',
    uptime: 100,
    connections: { current: 10, available: 100, totalCreated: 20 },
    counters: { query: 0, insert: 0, update: 0, delete: 0, getmore: 0, command: 0, ...counters },
    network: { bytesIn, bytesOut: 0, requests: 0 },
    at,
  };
}

describe('monitor.rates', () => {
  it('has no rates with no previous read, or when no time passed', () => {
    expect(rates(undefined, status(now), emptyHistory).rates).toBeUndefined();
    expect(rates(status(now), status(now), emptyHistory).rates).toBeUndefined();
  });

  it('gives 12 per second for query 1,000 at 14:00:00 then 1,060 at 14:00:05', () => {
    const result = rates(status(now, { query: 1000 }), status(now + 5000, { query: 1060 }), emptyHistory);
    expect(result.rates?.counters.query).toBe(12);
    expect(rateText(result.rates?.counters.query ?? -1)).toBe('12');
  });

  it('gives 0.4 for insert 500 then 502 over 5 seconds', () => {
    const result = rates(status(now, { insert: 500 }), status(now + 5000, { insert: 502 }), emptyHistory);
    expect(rateText(result.rates?.counters.insert ?? -1)).toBe('0.4');
  });

  it('gives 0 for a counter that went down (a restart)', () => {
    const result = rates(status(now, { command: 9000 }), status(now + 5000, { command: 120 }), emptyHistory);
    expect(result.rates?.counters.command).toBe(0);
  });

  it('gives 1,572,864 bytes in per second, written 1.5 MB', () => {
    const result = rates(status(now, {}, 10_000_000), status(now + 5000, {}, 17_864_320), emptyHistory);
    expect(result.rates?.bytesIn).toBe(1_572_864);
    expect(sizeText(result.rates?.bytesIn ?? 0)).toBe('1.5 MB');
  });

  it('sums the six counters in the total', () => {
    const result = rates(status(now), status(now + 1000, { query: 3, insert: 2, command: 5 }), emptyHistory);
    expect(result.rates?.total).toBe(10);
  });

  it('keeps the last 60 points of 61 reads in a row', () => {
    let history = emptyHistory;
    let previous: ServerStatus | undefined;
    for (let index = 0; index <= historyPoints; index += 1) {
      const current = status(now + index * 5000, { query: index * 10 });
      history = rates(previous, current, history).history;
      previous = current;
    }
    expect(history.connections).toHaveLength(historyPoints);
    expect(history.operations).toHaveLength(historyPoints);
  });

  it('starts again from nothing when the page opens', () => {
    expect(emptyHistory.operations).toHaveLength(0);
    expect(rates(undefined, status(now), emptyHistory).history.connections).toEqual([10]);
  });

  it('draws no line with fewer than 2 points, and draws from the smallest to the largest', () => {
    expect(linePoints([4])).toEqual([]);
    expect(linePoints([2, 4, 6])).toEqual([0, 0.5, 1]);
    expect(linePoints([3, 3])).toEqual([0.5, 0.5]);
  });
});
