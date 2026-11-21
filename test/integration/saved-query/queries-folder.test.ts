/**
 * The saved-query area of the main process on a real file system and a real MongoDB (M20's exit criteria): a queries
 * folder written by Mongoster 0.8.0 is listed and each of its queries runs; a query saved by Datardo is a file in
 * Mongoster's format; the folder is watched, and a file added, deleted or broken by hand is seen within a second; a
 * file that is not valid is skipped with one warning, given once; the queries for me and the recent queries are kept
 * across a start; the pin of a file that is gone goes with it.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { builtPipeline } from '../../../src/features/aggregate/build';
import { aggregateRequest } from '../../../src/features/aggregate/run';
import type { PipelinePlace } from '../../../src/features/aggregate/types';
import { checkedQuery, findRequest, runWindow } from '../../../src/features/query/run';
import { queryFileText } from '../../../src/features/saved-query/file-format';
import { parse as listParse } from '../../../src/features/saved-query/list';
import { parsedQueryFile } from '../../../src/features/saved-query/parse-file';
import { folderQueriesOf } from '../../../src/features/saved-query/read-folder';
import { pinOfSaved, type FolderSavedQuery } from '../../../src/features/saved-query/types';
import type { AppStateHolder } from '../../../src/main/app-state';
import { SavedQueriesData } from '../../../src/main/saved-queries';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import { testServers } from '../servers';

const recorded = join(__dirname, '..', '..', 'fixtures', 'saved-query', 'mongoster-0.8.0');
const localId = connectionId('c-local');
const database = 'saved_query_it';

interface Harness {
  readonly data: SavedQueriesData;
  readonly state: () => AppState;
  readonly events: AppEvent[];
  readonly dispatch: (event: AppEvent) => void;
  readonly dataFolder: string;
  readonly queriesFolder: string;
  readonly close: () => Promise<void>;
}

function connection(queriesFolder: string): ConnectionView {
  return {
    id: localId,
    name: 'Local',
    engine: 'mongodb',
    hosts: '127.0.0.1',
    readOnly: false,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
    queriesFolder,
  };
}

async function harness(dataFolder?: string, queriesFolder?: string): Promise<Harness> {
  const data = dataFolder ?? (await mkdtemp(join(tmpdir(), 'datardo-saved-data-')));
  const folder = queriesFolder ?? (await mkdtemp(join(tmpdir(), 'datardo-queries-')));
  let state: AppState = {
    ...initialState,
    connections: { ...initialConnectionsState, loaded: true, saved: [connection(folder)] },
  };
  const events: AppEvent[] = [];
  const listeners = new Set<(event: AppEvent, state: AppState) => void>();
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
      events.push(event);
      for (const listener of listeners) {
        listener(event, state);
      }
    },
    listen: (listener: (event: AppEvent, state: AppState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as AppStateHolder;
  const flushes: (() => Promise<void>)[] = [];
  const saved = new SavedQueriesData({ state: holder, dataFolder: data, onQuit: (flush) => flushes.push(flush) });
  return {
    data: saved,
    state: () => state,
    events,
    dispatch: (event) => {
      holder.dispatch(event);
    },
    dataFolder: data,
    queriesFolder: folder,
    close: async () => {
      saved.close();
      for (const flush of flushes) {
        await flush();
      }
    },
  };
}

/** Waits until `seen` holds, for at most a second: what the watcher must do in that time. */
async function within(seen: () => boolean, ms = 1000): Promise<void> {
  const until = Date.now() + ms;
  while (!seen()) {
    if (Date.now() > until) {
      throw new Error(`Not seen within ${String(ms)} ms.`);
    }
    await new Promise((done) => setTimeout(done, 25));
  }
}

function warnings(h: Harness): readonly string[] {
  return h.state().runner.notifications.map((each) => each.text);
}

async function namesIn(h: Harness): Promise<readonly string[]> {
  return folderQueriesOf(await h.data.reading(h.queriesFolder)).queries.map((each) => each.name);
}

describe('saved-query.read-folder', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  afterEach(async () => {
    await h.close();
    await rm(h.dataFolder, { recursive: true, force: true });
    await rm(h.queriesFolder, { recursive: true, force: true });
  });

  it('lists the queries of a folder Mongoster 0.8.0 wrote, as it wrote them', async () => {
    await cp(recorded, h.queriesFolder, { recursive: true });
    expect(await namesIn(h)).toEqual(['Mine', 'All', 'Paid this month', 'Totals by customer']);
    const list = listParse(
      [{ connectionName: 'Production', mine: [], recent: [], folder: await h.data.reading(h.queriesFolder) }],
      { database: 'shop', collection: 'orders' },
    );
    expect(list.saved.map((each) => each.name)).toEqual(['All', 'Mine', 'Paid this month', 'Totals by customer']);
    expect(warnings(h)).toEqual([]);
  });

  it('lists a file saved by a git pull within a second, without anything being pressed, and leaves it when deleted', async () => {
    await mkdir(join(h.queriesFolder, 'shop', 'orders'), { recursive: true });
    expect(await namesIn(h)).toEqual([]);
    const before = h.events.length;
    const file = join(h.queriesFolder, 'shop', 'orders', 'pulled.json');
    await writeFile(file, JSON.stringify({ name: 'Pulled', database: 'shop', collection: 'orders', filter: '{}' }));
    await within(() => h.events.slice(before).some((event) => event.slice === 'saved-query'));
    expect(await namesIn(h)).toEqual(['Pulled']);
    const after = h.events.length;
    await rm(file);
    await within(() => h.events.slice(after).some((event) => event.slice === 'saved-query'));
    expect(await namesIn(h)).toEqual([]);
  });

  it('skips a file holding {, lists the others, and warns once, again only once it was corrected and broken again', async () => {
    await cp(recorded, h.queriesFolder, { recursive: true });
    const broken = join(h.queriesFolder, 'shop', 'orders', 'broken.json');
    await writeFile(broken, '{');
    expect(await namesIn(h)).toHaveLength(4);
    expect(warnings(h)).toHaveLength(1);
    expect(warnings(h)[0]).toMatch(/^Datardo skipped the saved query shop\/orders\/broken\.json: not valid JSON: /u);
    expect(h.state().runner.notifications[0]?.actions?.[0]).toMatchObject({
      label: 'Reveal file',
      feature: 'saved-query.reveal-file',
      args: { file: 'shop/orders/broken.json' },
    });
    await h.data.folderChanged(h.queriesFolder);
    expect(warnings(h)).toHaveLength(1);
    await writeFile(broken, JSON.stringify({ name: 'Fixed', database: 'shop', collection: 'orders' }));
    await h.data.folderChanged(h.queriesFolder);
    await writeFile(broken, '{');
    await h.data.folderChanged(h.queriesFolder);
    expect(h.state().runner.log.filter((line) => line.kind === 'notification')).toHaveLength(2);
  });

  it('gives one warning for three broken files found at once', async () => {
    await mkdir(join(h.queriesFolder, 'a'), { recursive: true });
    for (const name of ['one', 'two', 'three']) {
      await writeFile(join(h.queriesFolder, 'a', `${name}.json`), '{ "name": 1 }');
    }
    await h.data.reading(h.queriesFolder);
    expect(warnings(h)).toEqual([
      'Datardo skipped 3 saved query files that aren\'t valid, such as a/one.json: "name" is missing: it must be a non-empty string.',
    ]);
  });

  it('takes away the pin of a query in the folder whose file is gone, and keeps the others', async () => {
    await cp(recorded, h.queriesFolder, { recursive: true });
    const query = (file: string): FolderSavedQuery => ({
      place: 'folder',
      name: file,
      database: 'shop',
      collection: 'orders',
      query: { kind: 'find', filter: '{}', sort: '', projection: '' },
      file,
    });
    const pins = [pinOfSaved(query('shop/orders/all.json')), pinOfSaved(query('shop/orders/gone.json'))];
    // The pins as `pins.json` gave them at start.
    h.dispatch({ slice: 'nav', type: 'changed', nav: { pins: { [localId]: pins } } });
    await h.data.folderChanged(h.queriesFolder);
    expect(h.state().nav.pins[localId]).toEqual([pins[0]]);
  });
});

describe('saved-query.save in the folder', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  afterEach(async () => {
    await h.close();
    await rm(h.dataFolder, { recursive: true, force: true });
    await rm(h.queriesFolder, { recursive: true, force: true });
  });

  it('writes a file Mongoster reads: the same text as Mongoster 0.8.0 wrote for the same query', async () => {
    const text = queryFileText({
      name: 'Paid this month',
      description: 'Orders paid since the first of the month',
      database: 'shop',
      collection: 'orders',
      query: {
        kind: 'find',
        filter: '{\n  status: "paid",\n  createdAt: { $gte: ISODate("2024-03-01") }\n}',
        sort: '{ createdAt: -1 }',
        projection: '',
      },
    });
    await h.data.changeFile(
      'write',
      { queriesFolder: h.queriesFolder, file: 'shop/orders/paid-this-month.json', text },
      'Could not save the query in the folder:',
    );
    const written = await readFile(join(h.queriesFolder, 'shop', 'orders', 'paid-this-month.json'), 'utf8');
    const mongoster = await readFile(join(recorded, 'shop', 'orders', 'paid-this-month.json'), 'utf8');
    expect(JSON.parse(written)).toEqual(JSON.parse(mongoster));
    expect(parsedQueryFile(written)).toMatchObject({ ok: true, query: { name: 'Paid this month' } });
    expect(await namesIn(h)).toEqual(['Paid this month']);
  });

  it('renames never over another file, deletes with the folders it leaves empty, and says what failed', async () => {
    const write = (file: string) =>
      h.data.changeFile('write', { queriesFolder: h.queriesFolder, file, text: '{}' }, 'Could not save:');
    await write('shop/orders/a.json');
    await write('shop/orders/b.json');
    await expect(
      h.data.changeFile(
        'rename',
        { queriesFolder: h.queriesFolder, file: 'shop/orders/a.json', to: 'shop/orders/b.json' },
        'Could not rename the query:',
      ),
    ).rejects.toThrow(/^Could not rename the query: shop\/orders\/b\.json already exists\.$/u);
    await h.data.changeFile('delete', { queriesFolder: h.queriesFolder, file: 'shop/orders/a.json' }, '');
    await h.data.changeFile('delete', { queriesFolder: h.queriesFolder, file: 'shop/orders/b.json' }, '');
    await expect(readFile(join(h.queriesFolder, 'shop', 'orders', 'b.json'))).rejects.toThrow();
    await expect(
      h.data.changeFile(
        'write',
        { queriesFolder: h.queriesFolder, file: '../outside.json', text: '{}' },
        'Could not save:',
      ),
    ).rejects.toThrow(/^Could not save: \.\.\/outside\.json is not a path inside the queries folder\.$/u);
  });
});

describe('saved-query for me and recent queries', () => {
  it('keeps the queries saved for me and the recent queries across a start, and forgets them with the connection', async () => {
    const first = await harness();
    const where = { connection: localId, database: 'shop', collection: 'orders' };
    const query = { kind: 'find', filter: '{ status: "paid" }', sort: '', projection: '' };
    await first.data.setMine(where, [{ name: 'Paid', database: 'shop', collection: 'orders', query, at: 1 }]);
    await first.data.setRecent(where, [{ query, at: 2 }]);
    await first.close();
    const second = await harness(first.dataFolder, first.queriesFolder);
    expect((await second.data.mineOf(localId)).map((each) => each.name)).toEqual(['Paid']);
    expect(await second.data.recentOf(where)).toEqual([{ query, at: 2 }]);
    expect(await second.data.removalCounts(localId)).toEqual({ savedQueries: 1, remembers: true });
    await second.data.forgetConnection(localId);
    expect(await second.data.mineOf(localId)).toEqual([]);
    await second.close();
    await rm(first.dataFolder, { recursive: true, force: true });
    await rm(first.queriesFolder, { recursive: true, force: true });
  });
});

describe('saved-query.run on a folder of Mongoster 0.8.0', () => {
  const engines = createEngines();
  const id = connectionId('saved-query-run');
  const send = (request: MongoRequest) => engines.send({ connection: id, request }, AbortSignal.timeout(20_000));

  beforeAll(async () => {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    const orders = { engine: 'mongodb' as const, database, collection: 'orders', timeLimitMs: 10_000 };
    await send({ ...orders, method: 'deleteMany', arguments: [{}] });
    const documents: Json[] = [1, 2, 3].map((n) => ({
      // The first is the order of misc/mine.json, which Mongoster wrote with its `ObjectId`.
      _id: { $oid: `65f1c0de9a1b2c3d4e5f6a7${['b', 'c', 'd'][n - 1] ?? 'e'}` },
      status: n === 3 ? 'open' : 'paid',
      customer: `c${String(n % 2)}`,
      total: { $numberInt: String(n * 10) },
      createdAt: { $date: '2024-03-0' + String(n + 1) + 'T00:00:00Z' },
    }));
    await send({ ...orders, method: 'insertMany', arguments: [documents] });
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('runs each query of the folder as its run button would, the find and the pipeline', async () => {
    const h = await harness();
    await cp(recorded, h.queriesFolder, { recursive: true });
    const queries = folderQueriesOf(await h.data.reading(h.queriesFolder)).queries;
    const counts: Record<string, number> = {};
    for (const each of queries) {
      const where = { database, collection: each.collection };
      if (each.query.kind === 'find') {
        const checked = checkedQuery(
          { filter: each.query.filter, sort: each.query.sort, project: each.query.projection, skip: '', limit: '' },
          Date.now(),
        );
        expect(checked.ok, each.name).toBe(true);
        if (checked.ok) {
          const reply = await send(findRequest(where, checked.query, runWindow(checked.query, 1, 50), 10_000));
          counts[each.name] = (reply as unknown[]).length;
        }
      } else {
        const built = builtPipeline(each.query.stages, each.query.stages.length - 1);
        expect(built.ok, each.name).toBe(true);
        if (built.ok) {
          const place = { ...where, connection: id } as unknown as PipelinePlace;
          const reply = await send(aggregateRequest(place, built.pipeline, 10_000));
          counts[each.name] = (reply as unknown[]).length;
        }
      }
    }
    expect(counts).toEqual({ Mine: 1, All: 3, 'Paid this month': 2, 'Totals by customer': 2 });
    await h.close();
    await rm(h.dataFolder, { recursive: true, force: true });
    await rm(h.queriesFolder, { recursive: true, force: true });
  });
});
