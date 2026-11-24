/**
 * `search.collections` with what the connection excludes from searches (M39), as the main process carries out a
 * search (`src/main/search-run.ts`) against the throwaway MongoDB: of 40 databases, 3 excluded, **Every database**
 * reads the other 37, sends nothing to the 3, and says *3 excluded*; a database chosen in **In** is read even when it
 * is excluded. The databases are `m39search_00` to `m39search_39`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { summaryText } from '../../../src/features/search/model/summary';
import { firstInput, type SearchInput } from '../../../src/features/search/types';
import { runSearch, type SearchRunPorts } from '../../../src/main/search-run';
import type { ConnectionRequest, Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const id = connectionId('search-exclusions');
const databases = Array.from({ length: 40 }, (_, index) => `m39search_${String(index).padStart(2, '0')}`);
const excluded = ['m39search_03', 'm39search_17', 'm39search_31'];
let engines: EngineService;

async function send(database: string, method: string, collection: string | undefined, args: Json[]): Promise<unknown> {
  const request = {
    engine: 'mongodb',
    database,
    ...(collection === undefined ? {} : { collection }),
    method,
    arguments: args,
  };
  return engines.send({ connection: id, request: request as MongoRequest }, AbortSignal.timeout(60_000));
}

function portsOf(sent: MongoRequest[]): SearchRunPorts {
  return {
    send: (request: ConnectionRequest, signal: AbortSignal) => {
      sent.push(request.request as MongoRequest);
      return engines.send(request, signal);
    },
    now: () => Date.now(),
    changed: () => undefined,
  };
}

function inputOf(more: Partial<SearchInput> = {}): SearchInput {
  return { ...firstInput, text: 'mario', ...more };
}

beforeAll(async () => {
  engines = createEngines();
  await engines.connect(
    id,
    { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  for (const database of databases) {
    await send(database, 'runCommand', undefined, [{ dropDatabase: { $numberInt: '1' } }]);
    await send(database, 'insertOne', 'people', [{ _id: 1, name: `mario of ${database}` }]);
  }
}, 120_000);

afterAll(async () => {
  for (const database of databases) {
    await send(database, 'runCommand', undefined, [{ dropDatabase: { $numberInt: '1' } }]);
  }
  await engines.disconnectAll();
}, 120_000);

describe('search.collections', () => {
  it('of 40 databases, 3 excluded, reads the other 37, sends nothing to the 3, and says 3 excluded', async () => {
    const sent: MongoRequest[] = [];
    const run = await runSearch(
      portsOf(sent),
      { id: 1, connection: id, input: inputOf(), fallback: 'test', exclusions: excluded },
      new AbortController().signal,
    );
    const ours = run.scans.filter((scan) => scan.collection.database.startsWith('m39search_'));
    expect(ours.map((scan) => scan.collection.database)).toEqual(databases.filter((name) => !excluded.includes(name)));
    expect(ours.every((scan) => scan.found === 1)).toBe(true);
    expect(sent.filter((request) => excluded.includes(request.database))).toEqual([]);
    expect(run.excluded).toBe(3);
    expect(summaryText(run)).toContain('3 excluded');
  });

  it('reads an excluded database chosen in In, and leaves nothing out', async () => {
    const sent: MongoRequest[] = [];
    const input = inputOf({ database: 'm39search_17', collections: [] });
    const run = await runSearch(
      portsOf(sent),
      { id: 2, connection: id, input, fallback: 'test', exclusions: excluded },
      new AbortController().signal,
    );
    expect(run.scans.map((scan) => [scan.collection.database, scan.found])).toEqual([['m39search_17', 1]]);
    expect(run.excluded).toBeUndefined();
  });
});
