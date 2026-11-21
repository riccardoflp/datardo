/**
 * Watch changes against the throwaway servers (M27): the change streams the main process keeps for the pages
 * (`src/main/watch-streams.ts`) and what follows the tabs (`src/main/watch.ts`), driven through the runner with the
 * features of the registry, as the window starts them. The writes are made through the engine, as another client would.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { followTabs } from '../../../src/main/watch';
import { WatchStreams } from '../../../src/main/watch-streams';
import { watchShows } from '../../../src/features/watch/show';
import { streamArgs } from '../../../src/features/watch/stream';
import type { AppAction, FileWriter } from '../../../src/runner/ports';
import type { Json } from '../../../src/shared/engine-request';
import type { FileStep } from '../../../src/shared/feature';
import { connectionId, tabId } from '../../../src/shared/ids';
import type { AppEvent } from '../../../src/shared/state';
import type { Watched, WatchPage } from '../../../src/shared/state/watch';
import { testServers } from '../servers';
import { ownReplicaSet, type OwnReplicaSet } from './own-replica-set';
import { live, localId, type Live } from '../undo/live';

const database = 'watch_it';
const soloId = connectionId('c-solo');
let runner: Live;
let replicaSet: OwnReplicaSet;
let streams: WatchStreams;
let folder: string;
let chosenFile = '';
const dispatched: { readonly at: number; readonly event: AppEvent }[] = [];

async function send(
  collection: string | undefined,
  method: string,
  args: readonly Json[],
  on: string = database,
): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: {
        engine: 'mongodb',
        database: on,
        ...(collection === undefined ? {} : { collection }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(60_000),
  );
}

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function until<T>(read: () => T | undefined, what: string, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > end) {
      throw new Error(`Waited ${String(ms)} ms for ${what}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function pageOf(tab: string): WatchPage {
  const page = runner.state().watch[tab];
  if (page === undefined) {
    throw new Error(`No page for ${tab}.`);
  }
  return page;
}

/** Opens the tab of a page as `tab.open` does, and waits for its stream to answer. */
async function openPage(watched: Watched): Promise<string> {
  const shows = watchShows(watched, watched.connection === soloId ? 'Solo' : 'Local');
  const before = new Set(runner.state().tabs.tabs.map((tab) => tab.id));
  runner.ports.state.dispatch({
    slice: 'tabs',
    type: 'opened',
    seed: { shows },
    key: JSON.stringify(shows),
    background: false,
    at: Date.now(),
  });
  const tab = runner.state().tabs.tabs.find((each) => !before.has(each.id))?.id ?? '';
  followTabs(streams, runner.state(), false);
  await until(
    () => (pageOf(tab).status === 'watching' || pageOf(tab).message !== undefined ? true : undefined),
    'the stream to answer',
  );
  return tab;
}

function closeTab(tab: string): void {
  runner.ports.state.dispatch({ slice: 'tabs', type: 'closed', tab: tabId(tab), at: Date.now() });
  followTabs(streams, runner.state(), false);
}

async function startOn(tab: string, feature: string, args: Json = null): Promise<unknown> {
  return runner.start(feature, { kind: 'tab', tab: tabId(tab) }, args);
}

/** The change streams of the collection the server lists, idle or waiting for changes. */
async function streamCursors(collection: string): Promise<number> {
  const ops = (await send(
    undefined,
    'aggregate',
    [[{ $currentOp: { idleCursors: true, allUsers: true } }]],
    'admin',
  )) as readonly Record<string, unknown>[] | undefined;
  return (ops ?? []).filter((op) => {
    const text = JSON.stringify(op);
    return op['ns'] === `${database}.${collection}` && text.includes('$changeStream');
  }).length;
}

beforeAll(async () => {
  runner = await live();
  replicaSet = await ownReplicaSet(runner.engines);
  folder = await mkdtemp(join(tmpdir(), 'datardo-watch-'));
  const holder = runner.ports.state;
  const dispatch = holder.dispatch;
  Object.assign(holder, {
    dispatch: (event: AppEvent) => {
      dispatched.push({ at: Date.now(), event });
      dispatch(event);
    },
  });
  streams = new WatchStreams({ engines: () => runner.engines, state: holder, now: Date.now, platform: 'windows' });
  const actions = runner.ports.appActions as Map<string, AppAction>;
  for (const [name, action] of Object.entries(streams.actions())) {
    actions.set(name, action);
  }
  actions.set('watch.choose-file', () => Promise.resolve(chosenFile));
  const files: FileWriter = async (step: FileStep) => {
    const { writeFile } = await import('node:fs/promises');
    const text = step.content === undefined ? '' : (step.content.args as { text?: string }).text;
    await writeFile(step.path, text ?? '');
  };
  Object.assign(runner.ports, { files });
  Object.assign(runner.ports.dialogs, {
    ask: () => Promise.resolve({ which: 'all' }),
    confirm: () => Promise.resolve(true),
  });
  await runner.engines.connect(
    soloId,
    { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
});

afterAll(async () => {
  await streams.closeAll();
  await send(undefined, 'runCommand', [{ dropDatabase: int(1) }]).catch(() => undefined);
  await runner.close();
  await replicaSet.stop();
  await rm(folder, { recursive: true, force: true });
});

beforeEach(async () => {
  await streams.closeAll();
  for (const tab of runner.state().tabs.tabs) {
    closeTab(tab.id);
  }
  await send(undefined, 'runCommand', [{ dropDatabase: int(1) }]);
  await send(undefined, 'runCommand', [{ create: 'purchases' }]);
});

const purchases: Watched = { connection: localId, database, collection: 'purchases' };

describe('watch.show', () => {
  it('opens a page that says Watching, and an insert arrives with its _id and the document', async () => {
    const tab = await openPage(purchases);
    expect(pageOf(tab).status).toBe('watching');
    await send('purchases', 'insertMany', [[{ _id: int(1), status: 'new' }]]);
    const event = await until(() => pageOf(tab).events[0], 'the insert');
    expect(event).toMatchObject({ number: 1, type: 'insert', namespace: `${database}.purchases`, id: '1' });
    expect(event.changes).toContain('status: "new"');
  });

  it('lists the writes to two collections of a watched database in the same list', async () => {
    const tab = await openPage({ connection: localId, database });
    await send('purchases', 'insertMany', [[{ _id: int(1) }]]);
    await send('items', 'insertMany', [[{ _id: int(2) }]]);
    const events = await until(() => (pageOf(tab).events.length >= 2 ? pageOf(tab).events : undefined), 'two');
    expect(events.map((event) => event.namespace)).toEqual([`${database}.purchases`, `${database}.items`]);
  });

  it('watches all databases of the deployment', async () => {
    const tab = await openPage({ connection: localId });
    await send('purchases', 'insertMany', [[{ _id: int(3) }]]);
    const event = await until(
      () => pageOf(tab).events.find((each) => each.namespace === `${database}.purchases`),
      'the insert',
    );
    expect(event.type).toBe('insert');
  });

  it('says on a standalone server that change streams need a replica set, and lists nothing', async () => {
    const tab = await openPage({ connection: soloId, database, collection: 'purchases' });
    expect(pageOf(tab).message).toEqual({
      kind: 'standalone',
      text: 'Change streams need a replica set or a sharded cluster: this server is a standalone. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)',
    });
    expect(pageOf(tab).events).toEqual([]);
  });

  it('lists drop and invalidate when the watched collection is dropped, and says the stream was invalidated', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'drop', []);
    await until(() => (pageOf(tab).message?.kind === 'invalidated' ? true : undefined), 'the invalidate');
    expect(pageOf(tab).events.map((event) => event.type)).toEqual(['drop', 'invalidate']);
    expect(pageOf(tab).status).toBe('stopped');
    expect(streams.isOpen(tab)).toBe(false);
  });

  it('closes the stream with its tab: the server no longer lists its cursor', async () => {
    const tab = await openPage(purchases);
    expect(await streamCursors('purchases')).toBeGreaterThan(0);
    closeTab(tab);
    await until(() => (runner.state().watch[tab] === undefined ? true : undefined), 'the page to go');
    const end = Date.now() + 5000;
    let open = await streamCursors('purchases');
    while (open > 0 && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      open = await streamCursors('purchases');
    }
    expect(open).toBe(0);
  });
});

describe('watch.stream', () => {
  it('carries the document as it is now on an update with Current document on update, and only the changes without', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'insertMany', [[{ _id: int(1), a: int(1), b: int(1) }]]);
    await send('purchases', 'updateOne', [{ _id: int(1) }, { $set: { a: int(2) } }]);
    const on = await until(() => pageOf(tab).events.find((event) => event.type === 'update'), 'the update');
    expect(on.after).toEqual({ _id: int(1), a: int(2), b: int(1) });
    await startOn(tab, 'watch.stream', { ...streamArgs(tab, pageOf(tab)), fullDocument: false });
    await send('purchases', 'updateOne', [{ _id: int(1) }, { $set: { a: int(3) } }]);
    const off = await until(() => pageOf(tab).events.filter((event) => event.type === 'update')[1], 'the update');
    expect(off.after).toBeUndefined();
    expect(off.updated).toEqual({ a: int(3) });
    expect(pageOf(tab).fullDocument).toBe(false);
  });

  it('keeps a Long, a Decimal128 and a date of a changed document with their types', async () => {
    const tab = await openPage(purchases);
    const document = {
      _id: int(1),
      long: { $numberLong: '9007199254740993' },
      decimal: { $numberDecimal: '0.10' },
      when: { $date: { $numberLong: '1700000000000' } },
    };
    await send('purchases', 'insertMany', [[document]]);
    const event = await until(() => pageOf(tab).events[0], 'the insert');
    expect(event.after).toEqual(document);
  });

  it('hands 500 inserts of one second to the list, all and in order, a few times a second', async () => {
    const tab = await openPage(purchases);
    const from = dispatched.length;
    const started = Date.now();
    await send('purchases', 'insertMany', [Array.from({ length: 500 }, (_, n) => ({ _id: int(n) }))]);
    await until(() => (pageOf(tab).events.length >= 500 ? true : undefined), 'the 500 inserts');
    const elapsed = Date.now() - started;
    const handed = dispatched
      .slice(from)
      .filter(({ event }) => event.slice === 'watch' && event.kind === 'received' && event.events.length > 0);
    expect(pageOf(tab).events.map((event) => event.id)).toEqual(Array.from({ length: 500 }, (_, n) => String(n)));
    expect(handed.length).toBeLessThanOrEqual(Math.ceil(elapsed / 150) + 1);
    const firstSecond = handed.filter(({ at }) => at - (handed[0]?.at ?? 0) < 1000);
    expect(firstSecond.length).toBeLessThanOrEqual(7);
  });

  it('opens the stream again with a Filter of deletes: from then on only deletes arrive, and the lines stay', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'insertMany', [[{ _id: int(1) }]]);
    await until(() => pageOf(tab).events[0], 'the insert');
    const filter = '{ operationType: "delete" }';
    await startOn(tab, 'watch.stream', { ...streamArgs(tab, pageOf(tab)), filter });
    await send('purchases', 'insertMany', [[{ _id: int(2) }]]);
    await send('purchases', 'deleteOne', [{ _id: int(1) }]);
    await until(() => pageOf(tab).events.find((event) => event.type === 'delete'), 'the delete');
    expect(pageOf(tab).events.map((event) => event.type)).toEqual(['insert', 'delete']);
    expect(pageOf(tab).filter).toBe(filter);
    expect(runner.state().tabs.tabs.find((each) => each.id === tab)?.memory?.watch?.filter).toBe(filter);
  });

  it('refuses a Filter that cannot be read, and the stream stays as it was', async () => {
    const tab = await openPage(purchases);
    const result = await startOn(tab, 'watch.stream', { ...streamArgs(tab, pageOf(tab)), filter: '{ a: ' });
    expect(result).toMatchObject({ kind: 'refused', code: 'watch.stream/invalid-filter' });
    expect(streams.isOpen(tab)).toBe(true);
  });
});

describe('watch.stop', () => {
  it('closes the stream and its cursor on Stop, and Start opens it from now', async () => {
    const tab = await openPage(purchases);
    expect(await startOn(tab, 'watch.stop')).toEqual({ kind: 'done' });
    expect(pageOf(tab).status).toBe('stopped');
    expect(streams.isOpen(tab)).toBe(false);
    await send('purchases', 'insertMany', [[{ _id: int(1) }]]);
    expect(await startOn(tab, 'watch.stop')).toEqual({ kind: 'done' });
    await until(() => (pageOf(tab).status === 'watching' ? true : undefined), 'Watching');
    await send('purchases', 'insertMany', [[{ _id: int(2) }]]);
    await until(() => pageOf(tab).events[0], 'the insert');
    expect(pageOf(tab).events.map((event) => event.id)).toEqual(['2']);
  });
});

describe('watch.resume', () => {
  it('goes on after Stop from the last change event: what was written meanwhile arrives', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'insertMany', [[{ _id: int(1) }]]);
    await until(() => pageOf(tab).events[0], 'the insert');
    await startOn(tab, 'watch.stop');
    await send('purchases', 'insertMany', [[{ _id: int(2) }]]);
    expect(pageOf(tab).resumeToken).toBeDefined();
    await startOn(tab, 'watch.resume');
    await until(() => pageOf(tab).events[1], 'the insert made while stopped');
    expect(pageOf(tab).events.map((event) => event.id)).toEqual(['1', '2']);
  });

  it('starts after the invalidate of a drop', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'drop', []);
    await until(() => (pageOf(tab).message?.kind === 'invalidated' ? true : undefined), 'the invalidate');
    expect(pageOf(tab).afterInvalidate).toBe(true);
    await startOn(tab, 'watch.resume');
    await until(() => (pageOf(tab).status === 'watching' ? true : undefined), 'Watching');
    await send('purchases', 'insertMany', [[{ _id: int(5) }]]);
    await until(() => pageOf(tab).events.find((event) => event.type === 'insert'), 'the insert after the drop');
  });
});

describe('watch.pause', () => {
  it('holds the change events while paused and adds them on Resume', async () => {
    const tab = await openPage(purchases);
    await startOn(tab, 'watch.pause');
    expect(pageOf(tab).paused).toBe(true);
    await send('purchases', 'insertMany', [[{ _id: int(1) }]]);
    await until(() => pageOf(tab).held[0], 'the held insert');
    expect(pageOf(tab).events).toEqual([]);
    await startOn(tab, 'watch.pause');
    expect(pageOf(tab).events.map((event) => event.id)).toEqual(['1']);
  });
});

describe('watch.clear', () => {
  it('empties the list and keeps the stream open; the numbers go on', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'insertMany', [[{ _id: int(1) }]]);
    await until(() => pageOf(tab).events[0], 'the insert');
    await startOn(tab, 'watch.clear');
    expect(pageOf(tab).events).toEqual([]);
    await send('purchases', 'insertMany', [[{ _id: int(2) }]]);
    const event = await until(() => pageOf(tab).events[0], 'the next insert');
    expect(event.number).toBe(2);
  });
});

describe('watch.enable-pre-images', () => {
  it('records pre-images after its confirmation, and an update then carries the document before', async () => {
    const tab = await openPage(purchases);
    await streams.readPreImages(tab);
    expect(pageOf(tab).preImages).toBe(false);
    const target = { kind: 'collection', connection: localId, database, collection: 'purchases' } as const;
    expect(await runner.start('watch.enable-pre-images', target, null)).toEqual({ kind: 'done' });
    await streams.readPreImages(tab);
    expect(pageOf(tab).preImages).toBe(true);
    await startOn(tab, 'watch.stop');
    await startOn(tab, 'watch.stop');
    await until(() => (pageOf(tab).status === 'watching' ? true : undefined), 'Watching');
    await send('purchases', 'insertMany', [[{ _id: int(1), a: int(1) }]]);
    await send('purchases', 'updateOne', [{ _id: int(1) }, { $set: { a: int(2) } }]);
    const update = await until(() => pageOf(tab).events.find((event) => event.type === 'update'), 'the update');
    expect(update.before).toEqual({ _id: int(1), a: int(1) });
  });
});

describe('watch.export', () => {
  it('writes the change events to the file chosen, one change event as Extended JSON a line', async () => {
    const tab = await openPage(purchases);
    await send('purchases', 'insertMany', [[{ _id: int(1) }, { _id: int(2) }]]);
    await until(() => pageOf(tab).events[1], 'two inserts');
    chosenFile = join(folder, 'changes.jsonl');
    expect(await startOn(tab, 'watch.export', { offsetMinutes: 0 })).toEqual({ kind: 'done' });
    const lines = (await readFile(chosenFile, 'utf8')).trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ operationType: 'insert', documentKey: { _id: int(1) } });
  });
});
