/**
 * The pipeline editor against a real MongoDB (M19's exit criteria): `aggregate.run` reads a page and its count with
 * the BSON types kept, on a collection, on a view and through a read-only connection, and gives an error of the server
 * in its words; `aggregate.write-output` asks the confirmation the target needs (a name to type only when `$out`
 * replaces a collection that exists), writes, and records nothing for undo and publishes nothing for redis-oplog;
 * `aggregate.save-as-view` creates the view; the Operations of the editor set the pipeline the tab keeps.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import type { PipelineOutput } from '../../../src/features/aggregate/run';
import { restoredPipeline, type PipelineEditor, type Stage } from '../../../src/features/aggregate/types';
import { runnableFeatures } from '../../../src/features/registry';
import { setPipeline } from '../../../src/main/aggregate';
import type { AppStateHolder } from '../../../src/main/app-state';
import { testPlans } from '../../../src/main/test-plans';
import { undoActions } from '../../../src/main/undo-actions';
import type { RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { RunnableFeature } from '../../../src/shared/feature';
import { connectionId, featureId, tabId, type ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Confirmation } from '../../../src/shared/state/runner';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';

const localId = connectionId('c-local');
const productionId = connectionId('c-production');
const cacheId = connectionId('c-cache');
const database = 'aggregate_it';
const ordersTab = tabId('t-orders');
const viewTab = tabId('t-paid-view');
const productionTab = tabId('t-production-orders');

/** Six orders of three customers, with the types a pipeline must keep. */
const orders: Json[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  _id: { $numberInt: String(n) },
  customer: `c${String(n % 3)}`,
  status: n % 2 === 0 ? 'paid' : 'open',
  total: { $numberInt: String(n * 10) },
  quantity: { $numberLong: '9007199254740993' },
}));

interface Run {
  readonly engines: EngineService;
  readonly state: () => AppState;
  readonly start: (connection: ConnectionId, tab: string, feature: string, args: Json) => Promise<IntentResult>;
  /** What the confirmations showed, in order; the next answers are taken from `answers`. */
  readonly confirmations: Confirmation[];
  readonly answers: boolean[];
  /** The view names the question of `aggregate.save-as-view` is answered with. */
  readonly names: string[];
  /** The events of redis-oplog the runner sent. */
  readonly published: unknown[];
  readonly close: () => Promise<void>;
}

function saved(id: ConnectionId, name: string, more: Partial<ConnectionView>): ConnectionView {
  return {
    id,
    name,
    engine: 'mongodb',
    hosts: '127.0.0.1',
    readOnly: false,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
    ...more,
  };
}

function collectionTab(id: ReturnType<typeof tabId>, collection: string, view: boolean, connection = localId) {
  return {
    id,
    shows: { kind: 'collection' as const, connection, database, collection, ...(view ? { view } : {}) },
    lastActive: 0,
    loaded: true,
  };
}

function firstState(prefix: string): AppState {
  return {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [
        saved(localId, 'Local', { publishesTo: cacheId, oplog: { prefix } }),
        saved(productionId, 'Production', { readOnly: true }),
        saved(cacheId, 'Cache', { engine: 'redis' }),
      ],
    },
    tabs: {
      ...initialState.tabs,
      tabs: [
        collectionTab(ordersTab, 'orders', false),
        collectionTab(viewTab, 'paid_view', true),
        collectionTab(productionTab, 'orders', false, productionId),
      ],
      active: ordersTab,
    },
  };
}

function features(): ReadonlyMap<ReturnType<typeof featureId>, RunnableFeature> {
  return new Map([
    ...runnableFeatures(),
    ...testPlans.map((plan): [typeof plan.id, RunnableFeature] => [plan.id, plan]),
  ]);
}

async function live(): Promise<Run> {
  const servers = testServers();
  const folder = await mkdtemp(join(tmpdir(), 'datardo-aggregate-'));
  const engines = createEngines();
  for (const id of [localId, productionId]) {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: servers.mongoReplicaSet, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  let state = firstState('aggregate-it.');
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const confirmations: Confirmation[] = [];
  const answers: boolean[] = [];
  const names: string[] = [];
  const published: unknown[] = [];
  const actions = undoActions({
    state: holder,
    dataFolder: folder,
    engines: () => engines,
    writeEntries: () => undefined,
    indexFound: () => ({ kind: 'current' }),
    connectFirst: () => Promise.resolve(),
    findConnection: () => undefined,
    writeConnection: () => undefined,
  });
  const ports: RunnerPorts = {
    features: features(),
    engines,
    appActions: new Map([
      ...Object.entries(actions),
      ['aggregate.set-pipeline', (args: Json) => setPipeline(holder as unknown as AppStateHolder, args)],
    ]),
    files: () => Promise.resolve(),
    dialogs: {
      ask: () => Promise.resolve({ name: names.shift() ?? '' }),
      confirm: (_feature, confirmation) => {
        confirmations.push(confirmation);
        return Promise.resolve(answers.shift() ?? true);
      },
    },
    state: holder,
    platform: 'windows',
    isReadOnly: (id) => id === productionId,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => (id === localId ? 'Local' : id === productionId ? 'Production' : id),
    now: () => Date.now(),
    oplog: {
      send: (_mongo, _linked, requests) => {
        published.push(...requests);
        return Promise.resolve();
      },
      secrets: () => [],
    },
  };
  return {
    engines,
    state: () => state,
    start: (connection, tab, feature, args) => {
      const shown = state.tabs.tabs.find((each) => each.id === tab)?.shows;
      const collection = shown?.kind === 'collection' ? shown.collection : 'orders';
      const target: Target = { kind: 'collection', connection, database, collection };
      return start(ports, { feature: featureId(feature), target, args });
    },
    confirmations,
    answers,
    names,
    published,
    close: async () => {
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
}

let run: Run;

async function send(method: string, args: readonly Json[], collection = 'orders', on = database): Promise<unknown> {
  return run.engines.send(
    { connection: localId, request: { engine: 'mongodb', database: on, collection, method, arguments: args } },
    AbortSignal.timeout(30_000),
  );
}

async function onDatabase(method: string, args: readonly Json[], on = database): Promise<unknown> {
  return run.engines.send(
    { connection: localId, request: { engine: 'mongodb', database: on, method, arguments: args } },
    AbortSignal.timeout(30_000),
  );
}

async function names(on = database): Promise<readonly string[]> {
  const listed = (await onDatabase('listCollections', [{}], on)) as readonly { name: string }[];
  return listed.map((each) => each.name).sort();
}

function stage(name: string, body: string, enabled = true): Stage {
  return { name, body, enabled };
}

function editor(...stages: Stage[]): Json {
  return { stages: stages.map((each) => ({ ...each })) };
}

/** The editor with a stage shown, from 0. */
function shownAt(shown: number, ...stages: Stage[]): Json {
  return { stages: stages.map((each) => ({ ...each })), shown };
}

async function runPipeline(stages: Stage[], more: Record<string, Json> = {}, tab = ordersTab, connection = localId) {
  return run.start(connection, tab, 'aggregate.run', { tab, pipeline: editor(...stages), ...more });
}

/** `aggregate.write-output`, as the window starts it for a pipeline that writes, to learn how it ended. */
async function writeOutput(stages: Stage[], tab = ordersTab, connection = localId) {
  return run.start(connection, tab, 'aggregate.write-output', { tab, pipeline: editor(...stages) });
}

function output(result: IntentResult): PipelineOutput {
  expect(result.kind).toBe('read');
  return (result as { result: PipelineOutput }).result;
}

const paid = stage('$match', '{ status: "paid" }');

beforeAll(async () => {
  run = await live();
});

afterAll(async () => {
  for (const each of [database, 'aggregate_it_reports']) {
    await onDatabase('dropDatabase', [], each).catch(() => undefined);
  }
  await run.close();
});

beforeEach(async () => {
  await onDatabase('dropDatabase', []);
  await onDatabase('dropDatabase', [], 'aggregate_it_reports');
  await send('insertMany', [orders]);
  await onDatabase('createView', ['paid_view', 'orders', [{ $match: { status: 'paid' } }]]);
  run.confirmations.length = 0;
  run.published.length = 0;
});

describe('aggregate.run', () => {
  it('reads a page of the output and its count, with the types kept', async () => {
    const group = stage('$group', '{ _id: "$status", n: { $sum: 1 }, quantity: { $sum: "$quantity" } }');
    const read = output(await runPipeline([group, stage('$sort', '{ _id: 1 }')]));
    expect(read.count).toBe(2);
    expect(read.documents).toEqual([
      { _id: 'open', n: { $numberInt: '3' }, quantity: { $numberLong: '27021597764222979' } },
      { _id: 'paid', n: { $numberInt: '3' }, quantity: { $numberLong: '27021597764222979' } },
    ]);
  });

  it('sends the $skip and $limit of the page, and an empty pipeline reads the documents unchanged', async () => {
    const third = output(await runPipeline([], { page: 3, pageSize: 10 }));
    expect([third.documents.length, third.count]).toEqual([0, 6]);
    const second = output(await runPipeline([stage('$sort', '{ _id: 1 }')], { page: 2, pageSize: 10 }));
    expect(second.documents).toEqual([]);
    const all = output(await runPipeline([]));
    expect(all.documents).toEqual(orders);
  });

  it('runs up to the stage shown: a $out after it writes nothing', async () => {
    const pipeline = shownAt(0, paid, stage('$out', '"paid_orders"'));
    const read = output(await run.start(localId, ordersTab, 'aggregate.run', { tab: ordersTab, pipeline }));
    expect(read.count).toBe(3);
    expect(await names()).not.toContain('paid_orders');
  });

  it('gives an error of the server as the server words it', async () => {
    const read = output(await runPipeline([stage('$nope', '{}')]));
    expect(read.documents).toEqual([]);
    expect(read.failure).toMatch(/Unrecognized pipeline stage name: '\$nope'/u);
  });

  it('runs on a view, and through a read-only connection', async () => {
    const onView = output(await runPipeline([stage('$sort', '{ _id: 1 }')], {}, viewTab));
    expect(onView.documents.map((each) => (each as { status: string }).status)).toEqual(['paid', 'paid', 'paid']);
    const readOnly = output(await runPipeline([paid], {}, productionTab, productionId));
    expect(readOnly.count).toBe(3);
  });

  it('keeps no pipeline that does not build: the stage is named and nothing is sent', async () => {
    const result = await runPipeline([paid, stage('$group', '{ _id: ')]);
    expect(result).toMatchObject({ kind: 'refused', code: 'aggregate.run/invalid-stage' });
    expect((result as { message: string }).message).toBe('Stage 2 ($group): JSON5: invalid end of input at 1:8');
  });
});

describe('aggregate.write-output', () => {
  it('is started by aggregate.run, writes a $out to a new collection after one button, and records nor publishes nothing', async () => {
    const result = await runPipeline([paid, stage('$out', '"paid_orders"')]);
    expect(result).toEqual({ kind: 'done' });
    const [confirmation] = run.confirmations;
    expect(confirmation?.danger).toMatchObject({ kind: 'confirm' });
    expect(confirmation?.danger.text).toContain('Run this pipeline? Its $out stage writes to "paid_orders".');
    expect(confirmation?.steps.map((each) => each.text)).toEqual([
      'db.orders.aggregate([{ $match: { status: "paid" } }, { $out: "paid_orders" }], { allowDiskUse: true, maxTimeMS: 600000 })',
    ]);
    const written = (await send('find', [{}], 'paid_orders')) as readonly { status: string }[];
    expect(written.map((each) => each.status)).toEqual(['paid', 'paid', 'paid']);
    expect(run.state().undo.entries).toEqual([]);
    expect(run.published).toEqual([]);
    expect(run.state().runner.notifications.at(-1)?.text).toBe('Pipeline output written by $out to "paid_orders".');
  });

  it('asks to type the name of a collection that $out replaces, and a cancel sends nothing', async () => {
    await send('insertMany', [[{ _id: 'kept' }]], 'archive');
    run.answers.push(false);
    const result = await writeOutput([paid, stage('$out', '"archive"')]);
    expect(result).toEqual({ kind: 'cancelled' });
    const [confirmation] = run.confirmations;
    expect(confirmation?.danger).toMatchObject({ kind: 'destructive', name: 'archive' });
    expect(confirmation?.danger.text).toContain(
      'It replaces the collection archive: the documents it holds now are lost.',
    );
    expect(await send('find', [{}], 'archive')).toEqual([{ _id: 'kept' }]);
  });

  it('names the database of a collection replaced in another database, and reads again each time', async () => {
    const elsewhere = stage('$out', '{ db: "aggregate_it_reports", coll: "archive" }');
    await send('insertMany', [[{ _id: 1 }]], 'archive', 'aggregate_it_reports');
    run.answers.push(false, false);
    await writeOutput([paid, elsewhere]);
    expect(run.confirmations[0]?.danger).toMatchObject({ kind: 'destructive', name: 'aggregate_it_reports.archive' });
    await send('drop', [], 'archive', 'aggregate_it_reports');
    await writeOutput([paid, elsewhere]);
    expect(run.confirmations[1]?.danger.kind).toBe('confirm');
  });

  it('confirms a $merge into a collection that exists with one button', async () => {
    await send('insertMany', [[{ _id: { $numberInt: '2' }, old: true }]], 'archive');
    const result = await writeOutput([paid, stage('$merge', '{ into: "archive", whenMatched: "replace" }')]);
    expect(result).toEqual({ kind: 'done' });
    expect(run.confirmations[0]?.danger.kind).toBe('confirm');
    expect(run.confirmations[0]?.danger.text).toContain(
      'Its $merge stage writes to { into: "archive", whenMatched: "replace" }.',
    );
    expect(((await send('find', [{}], 'archive')) as unknown[]).length).toBe(3);
  });

  it('refuses on a read-only connection without reading whether the collection exists', async () => {
    const result = await writeOutput([paid, stage('$out', '"paid_orders"')], productionTab, productionId);
    expect(result).toEqual({
      kind: 'refused',
      code: 'aggregate.write-output/read-only',
      message: 'The connection Production is read-only. Pipelines ending with $out write to the database.',
    });
    expect(run.confirmations).toEqual([]);
    expect(await names()).not.toContain('paid_orders');
  });

  it('runs from the tab of a view: the output goes to another collection', async () => {
    const result = await writeOutput([stage('$out', '"snapshot"')], viewTab);
    expect(result).toEqual({ kind: 'done' });
    expect(((await send('find', [{}], 'snapshot')) as unknown[]).length).toBe(3);
  });
});

describe('aggregate.save-as-view', () => {
  it('creates the view of the pipeline up to the stage shown', async () => {
    run.names.push('paid_sorted');
    const pipeline = shownAt(1, paid, stage('$sort', '{ total: -1 }'), stage('$limit', '1'));
    const result = await run.start(localId, ordersTab, 'aggregate.save-as-view', { tab: ordersTab, pipeline });
    expect(result).toEqual({ kind: 'done' });
    const read = (await send('find', [{}], 'paid_sorted')) as readonly { total: Json }[];
    expect(read.map((each) => each.total)).toEqual(['60', '40', '20'].map((n) => ({ $numberInt: n })));
    expect(run.state().runner.notifications.at(-1)?.text).toBe(`Created view ${database}.paid_sorted.`);
  });
});

describe('aggregate.add-stage', () => {
  it('sets the pipeline the tab keeps, for tab.restore', async () => {
    const result = await run.start(localId, ordersTab, 'aggregate.add-stage', {
      tab: ordersTab,
      pipeline: editor(paid),
    });
    expect(result).toEqual({ kind: 'done' });
    const kept = run.state().tabs.tabs.find((each) => each.id === ordersTab)?.memory?.pipeline;
    const restored: PipelineEditor | undefined = restoredPipeline(kept);
    expect(restored?.stages.map((each) => each.name)).toEqual(['$match', '$match']);
  });
});
