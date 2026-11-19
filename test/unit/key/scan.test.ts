import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScanPage, ScanState } from '../../../src/features/key/scan';
import {
  afterPage,
  parse,
  parseTypes,
  request,
  scanMore,
  scanStart,
  scannedAbout,
  typesArgs,
  typesRequest,
} from '../../../src/features/key/scan';
import type { ReadRequest } from '../../../src/shared/feature';
import { cache, connected, keyContext, name, onDatabase, recordedReplies, requestWords } from './context';

const context = keyContext('key.scan', onDatabase());
const args = (more: Record<string, string>) => ({
  connection: cache.id,
  database: 0,
  type: 'all',
  cursor: '0',
  ...more,
});

function sent(outcome: ReturnType<typeof request>): string[] {
  expect(outcome.kind).toBe('engine');
  return (outcome as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords);
}

const page = (cursor: string, keys: readonly string[], total?: number): ScanPage => ({
  cursor,
  keys: keys.map(name),
  ...(total === undefined ? {} : { total }),
});
const many = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `orders:${String(from + index)}`);

describe('key.scan', () => {
  it('sends SCAN 0 MATCH orders:* COUNT 500 and DBSIZE first, and the next call uses the cursor the reply gave', () => {
    expect(sent(request(context, args({ pattern: 'orders:*' })))).toEqual([
      'SCAN 0 MATCH orders:* COUNT 500',
      'DBSIZE',
    ]);
    const first = parse(recordedReplies('scan-all'), args({ pattern: '*' }));
    expect(first.total).toBe(10);
    expect(sent(request(context, args({ pattern: 'orders:*', cursor: '1792' })))).toEqual([
      'SCAN 1792 MATCH orders:* COUNT 500',
    ]);
  });

  it('sends SCAN 0 MATCH orders:* TYPE hash COUNT 500 with Hash, and no TYPE of a key', () => {
    expect(sent(request(context, args({ pattern: 'orders:*', type: 'hash' })))).toEqual([
      'SCAN 0 MATCH orders:* TYPE hash COUNT 500',
      'DBSIZE',
    ]);
  });

  it('sends SCAN 0 COUNT 500 with an empty pattern field', () => {
    expect(sent(request(context, args({ pattern: '*' })))).toEqual(['SCAN 0 COUNT 500', 'DBSIZE']);
  });

  it('is never KEYS: no feature of Datardo sends it', () => {
    const folder = join(import.meta.dirname, '..', '..', '..', 'src', 'features');
    const sources = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'));
    const sending = sources.filter((file) => /['"]KEYS['"]/u.test(readFileSync(join(folder, file), 'utf8')));
    expect(sending).toEqual([]);
  });

  it('stops a run at the first reply that brings the keys found to 500 or more, and Scan more goes on from its cursor', () => {
    const one = afterPage(scanStart, page('40', many(0, 300), 1_204_331));
    expect(one.ended).toBeUndefined();
    const two = afterPage(one, page('80', many(300, 300)));
    expect(two.ended).toBe('stopped');
    expect(two.rows).toHaveLength(600);
    const more = scanMore(two);
    expect(more.ended).toBeUndefined();
    expect(more.cursor).toBe('80');
    expect(more.rows).toHaveLength(600);
    expect(more.run).toEqual({ calls: 0, found: 0 });
  });

  it('stops after 200 calls that find nothing among 1,204,331 keys, about 100,000 scanned', () => {
    let state: ScanState = afterPage(scanStart, page('1', [], 1_204_331));
    for (let call = 2; state.ended === undefined; call += 1) {
      state = afterPage(state, page(String(call), []));
    }
    expect(state.calls).toBe(200);
    expect(state.ended).toBe('stopped');
    expect(scannedAbout(state)).toBe(100_000);
  });

  it('lists a key returned by two replies as one row', () => {
    const state = afterPage(afterPage(scanStart, page('5', ['a', 'b'])), page('0', ['b', 'c']));
    expect(state.rows.map((row) => new TextDecoder().decode(row.name))).toEqual(['a', 'b', 'c']);
    expect(state.ended).toBe('complete');
  });

  it('shows the hash typed, user:7, first, read with TYPE user:7', () => {
    const typed = args({ pattern: '*user:7*', plain: 'user:7' });
    expect(sent(request(context, typed))).toEqual(['SCAN 0 MATCH *user:7* COUNT 500', 'DBSIZE', 'TYPE user:7']);
    const first = parse(recordedReplies('scan-plain'), typed);
    expect(first.exact).toEqual({ name: name('user:7'), type: 'hash' });
    const withOthers: ScanPage = { ...first, keys: [name('a:user:7:b'), name('user:7')] };
    const state = afterPage(scanStart, withOthers);
    expect(state.rows.map((row) => new TextDecoder().decode(row.name))).toEqual(['user:7', 'a:user:7:b']);
    expect(state.rows[0]?.type).toBe('hash');
  });

  it('leaves out the key typed when it is not of the type asked', () => {
    const typed = args({ pattern: '*user:7*', plain: 'user:7', type: 'string' });
    expect(parse(recordedReplies('scan-plain'), typed).exact).toBeUndefined();
  });

  it('keeps the rows found when cancelled, and Scan more goes on from the cursor', () => {
    const cancelled = afterPage(scanStart, page('77', ['a', 'b'], 10_000));
    const more = scanMore(cancelled);
    expect(more.rows).toHaveLength(2);
    expect(more.cursor).toBe('77');
  });

  it('keeps as the total what DBSIZE answered when the scan started', () => {
    const state = afterPage(afterPage(scanStart, page('9', ['a'], 1_204_331)), page('12', ['b']));
    expect(state.total).toBe(1_204_331);
  });

  it('reads the recorded reply of a scan of db15: the cursor, ten names, one not text, and DBSIZE', () => {
    const read = parse(recordedReplies('scan-all'), args({ pattern: '*' }));
    expect(read.cursor).toBe('0');
    expect(read.keys).toHaveLength(10);
    expect(read.keys).toContainEqual(Uint8Array.of(0x75, 0x73, 0x65, 0x72, 0x3a, 0xff));
    expect(parse(recordedReplies('scan-hash'), args({ pattern: 'user:*', type: 'hash' })).keys).toEqual([
      name('user:7'),
    ]);
  });

  it('reads the types of the keys a reply returned in one pipeline, none for a key gone', () => {
    const typesOf = typesArgs(cache.id, 0, [name('user:7'), name('board'), name('nothing:here')]);
    expect(sent(typesRequest(context, typesOf))).toEqual(['TYPE user:7', 'TYPE board', 'TYPE nothing:here']);
    const types = parseTypes(recordedReplies('scan-types'));
    expect(types).toEqual(['hash', 'zset', 'none']);
    const state = afterPage(scanStart, page('0', ['user:7', 'board', 'nothing:here']), types);
    expect(state.rows.map((row) => row.type ?? 'gone')).toEqual(['hash', 'zset', 'gone']);
  });

  it('refuses a type filter on a server that cannot filter keys by type', () => {
    const old = keyContext('key.scan', onDatabase(), connected(cache, '5.0.7'));
    expect(request(old, args({ pattern: '*', type: 'hash' }))).toEqual({
      kind: 'refuse',
      code: 'key.scan/unsupported',
      message: 'This server cannot filter keys by type.',
    });
    expect(sent(request(old, args({ pattern: '*' })))).toEqual(['SCAN 0 COUNT 500', 'DBSIZE']);
  });
});
