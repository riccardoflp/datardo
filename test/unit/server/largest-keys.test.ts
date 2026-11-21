import { describe, expect, it } from 'vitest';
import {
  afterMeasure,
  afterScan,
  afterTypes,
  callArgs,
  cancelSearch,
  examineMore,
  largestKeysAsk,
  nextCall,
  parse,
  request,
  searchLine,
  startSearch,
  type LargestKeysSearch,
} from '../../../src/features/server/largest-keys';
import { largestKeysView } from '../../../src/features/server/memory';
import { parse as parseInfo } from '../../../src/features/server/read-info';
import { hexOf } from '../../../src/features/server/types';
import type { Outcome } from '../../../src/shared/feature';
import { bytes, cacheLocal, cacheProduction, commandsOf, contextOn, failed, planOf, recordedRedis } from './context';

const context = contextOn('server.largest-keys');

/** A database of `count` keys `k1` … whose size is their number, scanned 500 at a time; some keys vanish. */
interface Server {
  readonly count: number;
  readonly vanished?: ReadonlySet<string>;
  readonly sent: string[];
  /** The time, in ms, each reply of SCAN takes. */
  readonly scanMs?: number;
}

function reply(server: Server, args: ReturnType<typeof callArgs>): unknown[] {
  const commands = commandsOf(request(context, args));
  server.sent.push(...commands);
  return commands.map((command) => {
    const words = command.split(' ');
    if (words[0] === 'SCAN') {
      const from = Number(words[1]);
      const keys = Array.from({ length: Math.min(500, server.count - from) }, (_, index) =>
        bytes(`k${String(from + index + 1)}`),
      );
      const next = from + 500 >= server.count ? '0' : String(from + 500);
      return [bytes(next), keys];
    }
    const key = words[2] ?? '';
    if (words[0] === 'MEMORY') {
      return server.vanished?.has(key) === true ? null : Number(key.slice(1));
    }
    return bytes('string');
  });
}

/** Runs a search until it has nothing more to send, or `stopAfter` keys were returned and Cancel is pressed. */
function drive(server: Server, from: LargestKeysSearch, stopAfter?: number): LargestKeysSearch {
  let search = from;
  let clock = from.runStartedAt;
  for (let call = nextCall(search); call !== undefined; call = nextCall(search)) {
    const args = callArgs(call, cacheLocal.id, search.database);
    const read = parse(reply(server, args), args);
    clock += read.step === 'scan' ? (server.scanMs ?? 10) : 0;
    search =
      read.step === 'scan'
        ? afterScan(search, read.page, clock)
        : read.step === 'measure'
          ? afterMeasure(search, read.measured, clock)
          : afterTypes(search, read.types);
    if (stopAfter !== undefined && search.returned >= stopAfter && search.pending.length === 0) {
      search = cancelSearch(search);
    }
  }
  return search;
}

describe('server.largest-keys', () => {
  it('on 12,500 keys: SCAN 0 COUNT 500 and its followers until 0, one MEMORY USAGE per key, at most 100 TYPE, no KEYS', () => {
    const server: Server = { count: 12_500, sent: [] };
    const search = drive(server, startSearch(0, 12_500, 0));
    const scans = server.sent.filter((each) => each.startsWith('SCAN'));
    expect(scans[0]).toBe('SCAN 0 COUNT 500');
    expect(scans).toHaveLength(25);
    expect(scans.at(-1)).toBe('SCAN 12000 COUNT 500');
    expect(server.sent.filter((each) => each.startsWith('MEMORY USAGE'))).toHaveLength(12_500);
    expect(server.sent).toContain('MEMORY USAGE k1 SAMPLES 5');
    expect(server.sent.filter((each) => each.startsWith('TYPE'))).toHaveLength(100);
    expect(server.sent.some((each) => each.startsWith('KEYS'))).toBe(false);
    expect(search.ended).toBe('all');
    expect(searchLine(search)).toBe('Examined all 12,500 keys of db0 in 0.3 s.');
  });

  it('each call is sent on the database of the search', () => {
    const args = callArgs({ step: 'scan', cursor: '0' }, cacheLocal.id, 3);
    const read = request(context, args);
    expect(read.kind === 'engine' ? read.requests[0]?.request : undefined).toMatchObject({ database: 3 });
  });

  it('on 1,204,311 keys it stops at 100,000, with 100 rows and the line of a bound reached', () => {
    const server: Server = { count: 1_204_311, sent: [] };
    const search = drive(server, startSearch(0, 1_204_311, 0));
    expect(search.ended).toBe('bound');
    expect(search.returned).toBe(100_000);
    expect(search.ranking.keys).toHaveLength(100);
    expect(searchLine(search)).toBe(
      'Examined 100,000 of about 1,204,311 keys of db0 in 2.0 s. Larger keys may be among the others.',
    );
    const shown = largestKeysView({ connection: cacheLocal, databases: [], search });
    expect(shown.table?.rows).toHaveLength(100);
    expect(shown.table?.rows[0]).toMatchObject({
      rank: 1,
      key: 'k100000',
      type: 'string',
      memoryTooltip: '100,000 bytes',
    });
    expect(shown.more).toMatchObject({ label: 'Examine 100,000 more', element: 'server.largest-keys@toolbar' });
  });

  it('Examine 100,000 more sends SCAN with the last cursor, and a larger key takes its place in the table', () => {
    const server: Server = { count: 1_204_311, sent: [] };
    const first = drive(server, startSearch(0, 1_204_311, 0));
    server.sent.length = 0;
    const second = drive(server, examineMore(first, 50_000));
    expect(server.sent[0]).toBe('SCAN 100000 COUNT 500');
    expect(second.returned).toBe(200_000);
    expect(second.ranking.keys[0]?.bytes).toBe(200_000);
    expect(second.ended).toBe('bound');
  });

  it('a search that reaches 30 seconds stops after the reply in progress, with the same line and its own count', () => {
    const server: Server = { count: 1_204_311, sent: [], scanMs: 1000 };
    const search = drive(server, startSearch(0, 1_204_311, 0));
    expect(search.ended).toBe('bound');
    expect(search.returned).toBe(15_000);
    expect(server.sent.filter((each) => each.startsWith('MEMORY')).length).toBe(15_000);
    expect(searchLine(search)).toBe(
      'Examined 15,000 of about 1,204,311 keys of db0 in 30.0 s. Larger keys may be among the others.',
    );
  });

  it('Cancel after 37,500 keys leaves the table with the ranking of those 37,500', () => {
    const server: Server = { count: 1_204_311, sent: [] };
    const search = drive(server, startSearch(0, 1_204_311, 0), 37_500);
    expect(search.ended).toBe('cancelled');
    expect(search.ranking.examined).toBe(37_500);
    expect(search.ranking.keys[0]?.bytes).toBe(37_500);
    expect(searchLine(search)).toBe('Stopped after 37,500 of about 1,204,311 keys of db0.');
    expect(largestKeysView({ connection: cacheLocal, databases: [], search }).more).toBeDefined();
  });

  it('a key deleted between SCAN and MEMORY USAGE is in no row and stops nothing', () => {
    const server: Server = { count: 1000, sent: [], vanished: new Set(['k1000', 'k999']) };
    const search = drive(server, startSearch(0, 1000, 0));
    expect(search.ended).toBe('all');
    expect(search.ranking.skipped).toBe(2);
    expect(search.ranking.keys[0]?.bytes).toBe(998);
  });

  it('a key the user may not read is counted, and the line says so', () => {
    const keys = [hexOf(bytes('a')), hexOf(bytes('secret:b'))];
    const args = { connection: cacheLocal.id, database: 0, step: 'measure', keys };
    const read = parse([10, failed('NOPERM No permissions to access a key')], args);
    expect(read.step === 'measure' ? read.measured.kind : '').toBe('read');
    const search = afterMeasure(
      { ...startSearch(0, 2, 0), pending: [], ending: 'all', returned: 2 },
      read.step === 'measure' ? read.measured : { kind: 'read', value: [] },
      1000,
    );
    expect(searchLine(search)).toBe(
      'Examined all 2 keys of db0 in 1.0 s. 1 key could not be measured: the user of this connection may not read them.',
    );
  });

  it('MEMORY USAGE refused for the command stops the search with its sentence; SCAN refused gives its own', () => {
    const args = { connection: cacheLocal.id, database: 0, step: 'measure', keys: [hexOf(bytes('a'))] };
    const read = parse([failed("NOPERM User app has no permissions to run the 'memory|usage' command")], args);
    const search = afterMeasure(
      startSearch(0, 1, 0),
      read.step === 'measure' ? read.measured : { kind: 'read', value: [] },
      5,
    );
    expect(search.ended).toBe('unavailable');
    expect(searchLine(search)).toMatch(/^MEMORY USAGE needs a user that may run it: /u);
    const scan = parse([failed("NOPERM User app has no permissions to run the 'scan' command")], { step: 'scan' });
    const stopped = afterScan(
      startSearch(0, 1, 0),
      scan.step === 'scan' ? scan.page : { kind: 'read', value: { cursor: '0', keys: [] } },
      5,
    );
    expect(searchLine(stopped)).toMatch(/^SCAN needs a user that may run it: /u);
  });

  it('a double click on a row opens the key tab of that key, on the database of the search', () => {
    const server: Server = { count: 3, sent: [] };
    const search = drive(server, startSearch(4, 3, 0));
    const [row] = largestKeysView({ connection: cacheLocal, databases: [], search }).table?.rows ?? [];
    expect(row?.open).toMatchObject({
      kind: 'start',
      feature: 'key.open',
      target: { kind: 'key', connection: cacheLocal.id, database: 4, key: bytes('k3') },
    });
    expect(row?.click).toMatchObject({ feature: 'key.inspect' });
    expect(row?.menu.map((control) => control.label)).toEqual(['Open key', 'Copy name', 'Delete key…']);
  });

  it('on Cache production the search runs, and Delete key… is left to key.delete, which refuses it', () => {
    const server: Server = { count: 3, sent: [] };
    const search = drive(server, startSearch(0, 3, 0));
    const shown = largestKeysView({ connection: cacheProduction, databases: [], search });
    expect(shown.find).toMatchObject({ enabled: true });
    expect(shown.table?.rows[0]?.menu[2]).toMatchObject({ feature: 'key.delete', element: 'key.delete@row-menu' });
  });

  it('an empty database shows db0 has no keys. and sends one SCAN', () => {
    const server: Server = { count: 0, sent: [] };
    const search = drive(server, startSearch(0, undefined, 0));
    expect(server.sent).toEqual(['SCAN 0 COUNT 500']);
    expect(searchLine(search)).toBe('db0 has no keys.');
    expect(largestKeysView({ connection: cacheLocal, databases: [], search }).table).toBeUndefined();
  });

  it('the Database menu lists the databases of INFO and starts on the one with the most keys', () => {
    const info = parseInfo([bytes('# Keyspace\r\ndb0:keys=12,expires=0\r\ndb3:keys=1204311,expires=0\r\n')]);
    const databases = info.kind === 'read' ? info.value.databases : [];
    const shown = largestKeysView({ connection: cacheLocal, databases });
    expect(shown.database).toEqual({
      label: 'Database',
      value: 3,
      choices: [
        { database: 0, label: 'db0 (12 keys)' },
        { database: 3, label: 'db3 (1,204,311 keys)' },
      ],
    });
    expect(shown.find).toMatchObject({ args: { connection: cacheLocal.id, database: 3 } });
  });

  it('the recorded replies of Redis 7.4 rank server:large first, with its type', () => {
    const scan = parse([recordedRedis('redis-7.4-server-scan.json')], { step: 'scan' });
    let search = afterScan(
      startSearch(15, 4, 0),
      scan.step === 'scan' ? scan.page : { kind: 'read', value: { cursor: '0', keys: [] } },
      10,
    );
    const measureArgs = { connection: cacheLocal.id, database: 15, step: 'measure', keys: search.pending.map(hexOf) };
    const measured = parse(recordedRedis('redis-7.4-server-memory-usage.json') as unknown[], measureArgs);
    search = afterMeasure(search, measured.step === 'measure' ? measured.measured : { kind: 'read', value: [] }, 20);
    const typeArgs = { ...measureArgs, step: 'type' };
    const typed = parse(recordedRedis('redis-7.4-server-type.json') as unknown[], typeArgs);
    search = afterTypes(search, typed.step === 'type' ? typed.types : []);
    const rows = largestKeysView({ connection: cacheLocal, databases: [], search }).table?.rows ?? [];
    expect(rows.map((row) => [row.key, row.type, row.memory])).toEqual([
      ['server:large', 'string', '5.1 KB'],
      ['server:hash', 'hash', '504 B'],
      ['server:list', 'list', '72 B'],
      ['server:small', 'string', '64 B'],
    ]);
    expect(nextCall(search)).toBeUndefined();
  });

  it('a name that is not valid UTF-8 is written as the console writes a string', () => {
    const name = Uint8Array.from([0x6b, 0xff]);
    const args = { connection: cacheLocal.id, database: 0, step: 'measure', keys: [hexOf(name)] };
    const measured = parse([42], args);
    const search = afterMeasure(
      { ...startSearch(0, 1, 0), ending: 'all', returned: 1 },
      measured.step === 'measure' ? measured.measured : { kind: 'read', value: [] },
      1,
    );
    expect(largestKeysView({ connection: cacheLocal, databases: [], search }).table?.rows[0]?.key).toBe('"k\\xff"');
  });

  it('Go to’s Find largest keys opens the page on its Memory section and asks it to search, sending nothing', () => {
    const outcome = request(context, null);
    expect(commandsOf(outcome)).toEqual([]);
    const shown = planOf(outcome as Outcome);
    expect(shown.steps.map((step) => (step.kind === 'app' ? step.action : step.kind))).toEqual(['tab.open']);
    expect(shown.steps[0]).toMatchObject({ args: { section: 'memory' } });
    expect(shown.after.at(-1)).toEqual({
      kind: 'remember',
      key: largestKeysAsk,
      value: { connection: cacheLocal.id, asked: context.now },
    });
  });
});
