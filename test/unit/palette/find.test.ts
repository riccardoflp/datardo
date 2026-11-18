import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as findCollections from '../../../src/features/palette/find-collections';
import {
  afterPage,
  keysPlace,
  parse as parseScan,
  request as scanRequest,
  scanStart,
  wantedKeys,
  type KeysWanted,
  type ScanPage,
  type ScanProgress,
} from '../../../src/features/palette/find-keys';
import { view } from '../../../src/features/palette/open';
import { connectionId } from '../../../src/shared/ids';
import { mongoReply } from '../connection/replies';
import { contextOf } from '../tab/harness';
import { cacheLocal, harness, keys, knowledgeOf, local } from './harness';

const context = contextOf(harness().state(), 'palette.find-keys');

/** The `SCAN` reply recorded from Redis 7.4, as the engine gives it: the cursor and the names, as bytes. */
function recordedScan(): readonly unknown[] {
  const file = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', 'redis-7.4-scan.json');
  const recorded = JSON.parse(readFileSync(file, 'utf8')) as { cursor: string; keys: string[] };
  const bytes = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'base64'));
  return [[bytes(recorded.cursor), recorded.keys.map(bytes)]];
}

function wanted(typed: string): KeysWanted {
  const found = wantedKeys(typed);
  if (found === undefined) {
    throw new Error(`${typed} is not scanned.`);
  }
  return found;
}

/** The command a scan of the text sends first. */
function firstCall(typed: string): readonly string[] {
  const read = scanRequest(context, {
    connection: 'cache-local',
    database: 0,
    pattern: wanted(typed).pattern,
    cursor: '0',
  });
  if (read.kind !== 'engine') {
    throw new Error('A scan asks the engine.');
  }
  const request = read.requests[0]?.request;
  const words: readonly unknown[] = request?.engine === 'redis' ? request.command : [];
  return words.map((word) => (word instanceof Uint8Array ? new TextDecoder().decode(word) : String(word)));
}

/** A scan of pages that find nothing, the cursor never back to 0. */
function emptyScan(typed: string, pages: number, ends = false): ScanProgress {
  let progress = scanStart;
  for (let call = 1; call <= pages && progress.ended === undefined; call += 1) {
    const page: ScanPage = { cursor: ends && call === pages ? '0' : String(call * 1000), keys: [] };
    progress = afterPage(progress, page, wanted(typed));
  }
  return progress;
}

describe('palette.find-collections', () => {
  it('asks for the databases first, then the collections of each database, one request for each', () => {
    const first = findCollections.request(context, { connection: 'local' });
    expect(first).toMatchObject({
      kind: 'engine',
      requests: [
        { request: { database: 'admin', method: 'runCommand', arguments: [{ listDatabases: 1, nameOnly: true }] } },
      ],
    });
    const second = findCollections.request(context, { connection: 'local', databases: ['crm', 'shop'] });
    expect(second.kind === 'engine' ? second.requests.map((each) => each.request) : []).toMatchObject([
      { database: 'crm', method: 'listCollections', arguments: [{}, { nameOnly: true, authorizedCollections: true }] },
      { database: 'shop', method: 'listCollections' },
    ]);
  });

  it('reads the databases of the reply recorded from MongoDB 8.2, sorted by name', () => {
    expect(findCollections.parse([mongoReply('mongodb-8.2-listDatabases')], { connection: 'local' })).toEqual({
      kind: 'databases',
      databases: ['admin', 'config', 'goto_shop', 'local'],
    });
  });

  it('the collections fs.files and fs.chunks are one row, the bucket fs; a view is a view', () => {
    const found = findCollections.parse([mongoReply('mongodb-8.2-listCollections')], {
      connection: 'local',
      databases: ['goto_shop'],
    });
    expect(found).toEqual({
      kind: 'collections',
      more: false,
      names: [
        { database: 'goto_shop', name: 'fs', kind: 'bucket' },
        { database: 'goto_shop', name: 'order_items', kind: 'collection' },
        { database: 'goto_shop', name: 'orders', kind: 'collection' },
        { database: 'goto_shop', name: 'system.views', kind: 'collection' },
        { database: 'goto_shop', name: 'big_orders', kind: 'view' },
      ],
    });
  });

  it('beyond 10,000 names, Go to says that the tree reaches the others', () => {
    const many = Array.from({ length: 10_001 }, (_, index) => ({ name: `c${String(index)}`, type: 'collection' }));
    const found = findCollections.parse([many], { connection: 'local', databases: ['shop'] });
    expect(found).toMatchObject({ kind: 'collections', more: true });
    expect(found.kind === 'collections' ? found.names : []).toHaveLength(10_000);
    const h = harness();
    h.connect(local.id);
    const shown = view({
      state: h.state(),
      knowledge: { ...knowledgeOf(h.state()), collections: { [local.id]: { names: [], more: true, at: 0 } } },
      typed: '#c1',
    });
    expect(shown.notes).toEqual(['Local has more than 10,000 collections. Use the tree to reach the others.']);
  });

  it('the names are read again when Go to opens more than 5 minutes after the last read', () => {
    expect(findCollections.isStale(undefined, 0)).toBe(true);
    expect(findCollections.isStale({ names: [], more: false, at: 0 }, 60_000)).toBe(false);
    expect(findCollections.isStale({ names: [], more: false, at: 0 }, 5 * 60_000 + 1)).toBe(true);
  });
});

describe('palette.find-keys', () => {
  it('typing sess sends SCAN 0 MATCH *sess* COUNT 1000, and no KEYS', () => {
    expect(firstCall('sess')).toEqual(['SCAN', '0', 'MATCH', '*sess*', 'COUNT', '1000']);
  });

  it('typing s alone sends nothing; typing :s sends SCAN 0 MATCH *s* COUNT 1000', () => {
    expect(wantedKeys('s')).toBeUndefined();
    expect(firstCall(':s')).toEqual(['SCAN', '0', 'MATCH', '*s*', 'COUNT', '1000']);
  });

  it('typing :orders:4* sends MATCH orders:4*', () => {
    expect(firstCall(':orders:4*')).toEqual(['SCAN', '0', 'MATCH', 'orders:4*', 'COUNT', '1000']);
  });

  it('typing a*b without the prefix sends MATCH *a\\*b*', () => {
    expect(firstCall('a*b')).toEqual(['SCAN', '0', 'MATCH', '*a\\*b*', 'COUNT', '1000']);
  });

  it('reads the cursor and the names of the reply recorded from Redis 7.4, a name that is not text included', () => {
    const page = parseScan(recordedScan());
    expect(page.cursor).toBe('0');
    expect(page.keys.map((key) => Buffer.from(key).toString('latin1')).sort()).toEqual([
      'orders:41',
      'orders:42',
      'ordÿ',
    ]);
  });

  it('on a database where nothing matches, exactly 5 calls are sent, and Go to says how many keys it looked at', () => {
    const progress = emptyScan('sess', 10);
    expect(progress).toMatchObject({ calls: 5, ended: 'stopped' });
    const shown = keysOf('sess', progress);
    expect(shown?.status).toBe('Looked at about 5,000 keys of db0.');
    expect(shown?.scanAll?.label).toBe('Scan all in Keys');
  });

  it('on a database of 300 keys of which none matches, Go to says that no key holds the text', () => {
    const progress = emptyScan('sess', 1, true);
    expect(keysOf('sess', progress)?.status).toBe('No key of db0 holds "sess".');
  });

  it('no more than 20 keys are listed, whatever the scan finds', () => {
    const names = Array.from({ length: 50 }, (_, index) => new TextEncoder().encode(`session:${String(index)}`));
    const progress = afterPage(scanStart, { cursor: '99', keys: names }, wanted('sess'));
    expect(progress).toMatchObject({ ended: 'stopped' });
    expect(progress.keys).toHaveLength(20);
  });

  it('the other words typed are checked on the names that come back', () => {
    const names = ['session:a1', 'session:b2'].map((name) => new TextEncoder().encode(name));
    const progress = afterPage(scanStart, { cursor: '0', keys: names }, wanted('sess b2'));
    expect(progress.keys.map((key) => new TextDecoder().decode(key))).toEqual(['session:b2']);
  });

  it('with a MongoDB connection current, no key of any Redis connection is looked for', () => {
    const h = harness();
    h.connect(local.id);
    h.connect(cacheLocal.id);
    h.makeCurrent(local.id);
    expect(keysPlace(h.state())).toBeUndefined();
  });

  it('with the active tab on the keys of db3, the scan runs in db3 and the heading names it', async () => {
    const h = harness();
    h.connect(cacheLocal.id);
    await h.open(keys(3));
    expect(keysPlace(h.state())).toEqual({ connection: connectionId('cache-local'), name: 'Cache local', database: 3 });
    const shown = view({
      state: h.state(),
      knowledge: knowledgeOf(h.state()),
      typed: 'sess',
      keys: {
        place: { connection: cacheLocal.id, name: 'Cache local', database: 3 },
        wanted: wanted('sess'),
        progress: scanStart,
      },
    });
    expect(shown.keys?.heading).toBe('Keys of Cache local · db3');
  });
});

function keysOf(typed: string, progress: ScanProgress): ReturnType<typeof view>['keys'] {
  const h = harness();
  return view({
    state: h.state(),
    knowledge: knowledgeOf(h.state()),
    typed,
    keys: { place: { connection: cacheLocal.id, name: 'Cache local', database: 0 }, wanted: wanted(typed), progress },
  }).keys;
}
