import { describe, expect, it } from 'vitest';
import {
  afterPage,
  cancelled,
  freshScan,
  keysOfRun,
  loadMore,
  nextCall,
  parse,
  request,
  type ScanPage,
} from '../../../src/features/tree/scan-namespaces';
import { bytes, contextOf, recordedRedis } from './context';

const decoder = new TextDecoder();

function page(cursor: string, count: number, from = 0): ScanPage {
  return { cursor, keys: bytes(...Array.from({ length: count }, (_, index) => `k:${String(from + index)}`)) };
}

describe('tree.scan-namespaces', () => {
  it('expanding db1 sends SCAN 0 COUNT 1000 in database 1, then each cursor the server returned; never KEYS, MATCH or TYPE', () => {
    const first = request(contextOf('tree.scan-namespaces'), { connection: 'c-cache', database: 1 });
    const next = request(contextOf('tree.scan-namespaces'), { connection: 'c-cache', database: 1, cursor: '1792' });
    const words = [first, next].map((read) => {
      const sent = read.kind === 'engine' ? read.requests[0]?.request : undefined;
      return sent?.engine === 'redis'
        ? `${String(sent.database)} ${sent.command.map((word) => decoder.decode(word)).join(' ')}`
        : '';
    });
    expect(words).toEqual(['1 SCAN 0 COUNT 1000', '1 SCAN 1792 COUNT 1000']);
  });

  it('the scan stops after the call that brings the keys returned to 10,000, or when the cursor is 0', () => {
    let scan = freshScan;
    for (let call = 0; call < 9; call += 1) {
      scan = afterPage(scan, page(String(call + 1), 1000, call * 1000));
      expect(scan.ended).toBeUndefined();
    }
    scan = afterPage(scan, page('77', 1000, 9000));
    expect(scan.ended).toBe('paused');
    expect(scan.returned).toBe(keysOfRun);
    expect(nextCall(scan, 'c-cache', 0)).toBeUndefined();
  });

  it('a database of 3,500 keys is scanned to the end, and offers no Load more', () => {
    let scan = freshScan;
    scan = afterPage(scan, page('5', 1000));
    scan = afterPage(scan, page('9', 1000, 1000));
    scan = afterPage(scan, page('0', 1500, 2000));
    expect(scan.ended).toBe('whole');
    expect(scan.keys).toHaveLength(3500);
    expect(loadMore(scan)).toBe(scan);
  });

  it('Load more goes on from the cursor kept for 10,000 more keys; a key returned twice is counted once', () => {
    const paused = { ...afterPage(freshScan, page('42', 10_000)), ended: 'paused' as const };
    const more = loadMore(paused);
    expect(more.returned).toBe(0);
    expect(nextCall(more, 'c-cache', 3)).toEqual({ connection: 'c-cache', database: 3, cursor: '42' });
    const after = afterPage(more, page('0', 10, 9995));
    expect(after.keys).toHaveLength(10_005);
    expect(after.ended).toBe('whole');
  });

  it('cancelled, the keys seen so far are kept and Load more is offered', () => {
    const scan = cancelled(afterPage(freshScan, page('8', 300)));
    expect(scan.keys).toHaveLength(300);
    expect(scan.ended).toBe('paused');
  });

  it('keeps key names as bytes: a name that is not UTF-8 is scanned and counted (recorded from Redis 7.4)', () => {
    const scanned = parse([recordedRedis('redis-7.4-tree-scan.json')]);
    expect(scanned.cursor).toBe('0');
    expect(scanned.keys).toHaveLength(3);
    expect(scanned.keys.some((key) => key.includes(0xff))).toBe(true);
    expect(afterPage(freshScan, scanned).keys).toHaveLength(3);
  });

  it('a call that fails fails the scan with the message of the server', () => {
    expect(() => parse([{ kind: 'error', message: 'NOPERM' }])).toThrow('NOPERM');
  });
});
