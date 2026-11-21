/**
 * `search.scan` as the main process carries it out (`src/main/search-run.ts`) against the throwaway MongoDB: the
 * collections of the scope listed, each read with a cursor kept by the engine in batches of 500, three at a time,
 * with **Read** sent as the cursor's limit and no time limit, a read that fails keeping what it found, and **Stop**
 * closing every cursor still open.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { firstInput, type SearchInput, type SearchRun } from '../../../src/features/search/types';
import { runSearch, type SearchRunPorts } from '../../../src/main/search-run';
import type { ConnectionRequest, Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const id = connectionId('search-run');
const database = 'search_run_it';
let engines: EngineService;

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function send(method: string, collection: string | undefined, args: readonly Json[]): Promise<unknown> {
  const request = {
    engine: 'mongodb',
    database,
    ...(collection === undefined ? {} : { collection }),
    method,
    arguments: args,
  };
  return engines.send({ connection: id, request: request as MongoRequest }, AbortSignal.timeout(60_000));
}

function documents(count: number, name: (index: number) => string): readonly Json[] {
  return Array.from({ length: count }, (_, index) => ({ _id: int(index), name: name(index) }));
}

/** What the search sent, the cursors it holds open now and the most it held at once. */
interface Watched {
  readonly sent: MongoRequest[];
  open: number;
  most: number;
}

function portsOf(watched: Watched, change: (request: MongoRequest) => void = () => undefined): SearchRunPorts {
  return {
    send: async (request: ConnectionRequest, signal: AbortSignal) => {
      const mongo = request.request as MongoRequest;
      watched.sent.push(mongo);
      change(mongo);
      const reply = await engines.send(request, signal);
      if (mongo.method === 'openCursor') {
        watched.open += 1;
        watched.most = Math.max(watched.most, watched.open);
      }
      if (mongo.method === 'closeCursor') {
        watched.open -= 1;
      }
      return reply;
    },
    now: () => Date.now(),
    changed: () => undefined,
  };
}

function inputOf(text: string, more: Partial<SearchInput> = {}): SearchInput {
  return { ...firstInput, text, database, collections: [], ...more };
}

async function searched(input: SearchInput, watched: Watched, signal = new AbortController().signal) {
  return runSearch(portsOf(watched), { id: 1, connection: id, input, fallback: database }, signal);
}

function scanOf(run: SearchRun, collection: string) {
  return run.scans.find((scan) => scan.collection.collection === collection);
}

function fresh(): Watched {
  return { sent: [], open: 0, most: 0 };
}

beforeAll(async () => {
  engines = createEngines();
  await engines.connect(
    id,
    { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  await send('runCommand', undefined, [{ dropDatabase: int(1) }]);
  await send('insertMany', 'big', [documents(1500, (index) => (index % 3 === 0 ? `mario ${String(index)}` : 'rossi'))]);
  await send('insertMany', 'small', [documents(800, () => 'mario')]);
  for (const name of ['c1', 'c2', 'c3', 'c4']) {
    await send('insertMany', name, [documents(1200, (index) => (index === 7 ? 'Mario' : 'luigi'))]);
  }
  await send('insertMany', 'numbers', [
    [
      { _id: int(1), qty: int(42) },
      { _id: int(2), qty: int(420) },
    ],
  ]);
}, 120_000);

afterAll(async () => {
  await send('runCommand', undefined, [{ dropDatabase: int(1) }]);
  await engines.disconnectAll();
});

describe('search.scan', () => {
  it('reads every collection with no limit and no time limit, three cursors at most at a time', async () => {
    const watched = fresh();
    const run = await searched(inputOf('mario'), watched);
    expect(run.state).toBe('done');
    expect(watched.most).toBeLessThanOrEqual(3);
    expect(watched.open).toBe(0);
    const opened = watched.sent.filter((each) => each.method === 'openCursor');
    expect(opened).toHaveLength(7);
    for (const request of opened) {
      expect(JSON.stringify(request.arguments)).not.toContain('limit');
      expect(JSON.stringify(request)).not.toContain('maxTimeMS');
      expect(request.timeLimitMs).toBeUndefined();
    }
    expect(scanOf(run, 'big')).toMatchObject({ read: 1500, found: 500 });
    expect(scanOf(run, 'big')?.results).toHaveLength(50);
    expect(scanOf(run, 'small')?.ids).toHaveLength(800);
    expect(scanOf(run, 'c1')).toMatchObject({ found: 1 });
  }, 120_000);

  it('sends Read as the limit of the cursor, and says first 1,000 read only where it stopped there', async () => {
    const run = await searched(inputOf('mario', { read: 1000 }), fresh());
    expect(scanOf(run, 'big')).toMatchObject({ read: 1000, state: { kind: 'first-read', limit: 1000 } });
    expect(scanOf(run, 'small')).toMatchObject({ read: 800, state: { kind: 'read' } });
  }, 120_000);

  it('finds NumberInt(42) as a number, and not 420', async () => {
    const run = await searched(inputOf('42', { collections: ['numbers'] }), fresh());
    expect(scanOf(run, 'numbers')?.results.map((each) => each.idText)).toEqual(['1']);
    expect(scanOf(run, 'numbers')?.results[0]?.matches[0]).toMatchObject({ path: 'qty', kind: 'number' });
  }, 120_000);

  it('keeps what a collection found before its read failed, and reads the others', async () => {
    const watched = fresh();
    let batches = 0;
    const ports = portsOf(watched, (request) => {
      if (request.method === 'cursorNext' && request.collection === 'big' && ++batches === 2) {
        throw new Error('not authorized on search_run_it to execute command { getMore }');
      }
    });
    const input = inputOf('mario', { collections: ['big', 'small'] });
    const run = await runSearch(
      ports,
      { id: 1, connection: id, input, fallback: database },
      new AbortController().signal,
    );
    expect(scanOf(run, 'big')).toMatchObject({ read: 500, state: { kind: 'error' } });
    expect(scanOf(run, 'big')?.found).toBeGreaterThan(0);
    expect(scanOf(run, 'small')).toMatchObject({ read: 800, state: { kind: 'read' } });
    expect(watched.open).toBe(0);
  }, 120_000);

  it('stops: the cursors still open are closed, what was found stays, and nothing more is read', async () => {
    const watched = fresh();
    const stop = new AbortController();
    const ports = portsOf(watched, (request) => {
      if (request.method === 'cursorNext' && watched.sent.filter((each) => each.method === 'cursorNext').length === 3) {
        stop.abort();
      }
    });
    const run = await runSearch(
      ports,
      { id: 1, connection: id, input: inputOf('mario'), fallback: database },
      stop.signal,
    );
    expect(run.state).toBe('stopped');
    expect(watched.open).toBe(0);
    const sentAtStop = watched.sent.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(watched.sent).toHaveLength(sentAtStop);
  }, 120_000);
});
