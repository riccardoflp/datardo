/**
 * Runs of scheduled tasks against the test replica set (M26): what a backup and an export write in the task's folder,
 * a name already taken, the time series left out, a filter the server refuses, a read-only connection, retention
 * beside a file of the user, Cancel, and three runs of the scheduler driven by a test clock. The main process's part
 * is that of `src/main/task-*.ts`, with the files of the tasks in memory (`test/unit/task/host-harness.ts`). The
 * databases are `m26*`; the outputs go to a temporary folder.
 */
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import type { ScheduledTask } from '../../../src/features/task/types';
import { runTask } from '../../../src/main/task-runs';
import { Scheduler } from '../../../src/main/task-scheduler';
import { start } from '../../../src/runner/start';
import type { Json } from '../../../src/shared/engine-request';
import { featureId } from '../../../src/shared/ids';
import { appTarget } from '../../../src/shared/target';
import { at, connection, task } from '../../unit/task/harness';
import { taskWorld, type TaskWorld } from '../../unit/task/host-harness';
import { testServers } from '../servers';

const local = connection('c-m26-local', 'Local');
const readOnly = connection('c-m26-read-only', 'Local read-only', { readOnly: true });
const databases = ['m26shop', 'm26big'];
let engines: EngineService;
let root = '';
let folder = '';

function send(database: string, collection: string | undefined, method: string, args: readonly Json[]) {
  return engines.send(
    {
      connection: local.id,
      request: {
        engine: 'mongodb',
        database,
        ...(collection === undefined ? {} : { collection }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(60_000),
  );
}

const orders: Json[] = [1, 2, 3, 4, 5].map((n) => ({
  _id: { $numberInt: String(n) },
  status: n % 2 === 0 ? 'closed' : 'open',
  total: { $numberInt: String(n * 10) },
  customer: `c${String(n)}`,
}));

beforeAll(async () => {
  engines = createEngines();
  for (const id of [local.id, readOnly.id]) {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoReplicaSet, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  for (const database of databases) {
    await send(database, undefined, 'dropDatabase', []).catch(() => undefined);
  }
  await send('m26shop', 'orders', 'insertMany', [orders, {}]);
  await send('m26shop', 'customers', 'insertMany', [[{ name: 'Ada' }, { name: 'Bob' }, { name: 'Cy' }], {}]);
  await send('m26shop', undefined, 'runCommand', [{ create: 'metrics', timeseries: { timeField: 'at' } }]);
  for (let batch = 0; batch < 6; batch += 1) {
    const documents = Array.from({ length: 10_000 }, (_, index) => ({
      n: batch * 10_000 + index,
      text: 'x'.repeat(200),
    }));
    await send('m26big', 'items', 'insertMany', [documents, { ordered: false }]);
  }
  root = await mkdtemp(join(tmpdir(), 'datardo-m26-'));
}, 120_000);

afterAll(async () => {
  for (const database of databases) {
    await send(database, undefined, 'dropDatabase', []).catch(() => undefined);
  }
  await engines.disconnectAll();
  await rm(root, { recursive: true, force: true });
});

let count = 0;
beforeEach(async () => {
  count += 1;
  folder = join(root, `run-${String(count)}`);
  await mkdir(folder);
});

function worldOf(tasks: readonly ScheduledTask[], now: number): TaskWorld {
  return taskWorld({ connections: [local, readOnly], tasks, engines, now, readOnly: [readOnly.id] });
}

function shopTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return task({ connection: local.id, database: 'm26shop', folder, pattern: '{database}_{date}_{time}', ...overrides });
}

function runsOf(world: TaskWorld, id = 't-1') {
  return world.state().tasks.states[id]?.runs ?? [];
}

describe('task.run', () => {
  it('writes a backup named by its pattern, then the same name with _2, and leaves time series out', async () => {
    const world = worldOf([shopTask({ notifySuccess: true })], at(2026, 11, 1, 2, 0, 0));
    expect((await runTask(world.host, 't-1', 'schedule')).kind).toBe('done');
    expect((await runTask(world.host, 't-1', 'manual')).kind).toBe('done');
    expect((await readdir(folder)).sort()).toEqual([
      'm26shop_2026-11-01_02-00-00.agz',
      'm26shop_2026-11-01_02-00-00_2.agz',
    ]);
    const [manual, scheduled] = runsOf(world);
    expect(scheduled).toMatchObject({ status: 'done', trigger: 'schedule', documents: 8, collections: 2 });
    expect(manual).toMatchObject({ status: 'done', trigger: 'manual' });
    expect(scheduled?.note).toBe('Time series collections left out (use mongodump): m26shop.metrics');
    expect(world.state().tasks.states['t-1']?.outputs).toHaveLength(2);
    expect(world.notices()[0]).toMatch(
      /^Scheduled task "Back up shop" done \(2 collections, 8 documents, [\d.]+ [KM]?B\) in [\d.]+ s: m26shop_2026-11-01_02-00-00\.agz$/u,
    );
    expect(world.state().tasks.running).toEqual({});
  });

  it('writes only the documents and the fields of an export’s filter and projection', async () => {
    const exportTask = shopTask({
      kind: 'export',
      collection: 'orders',
      format: 'jsonl',
      filter: '{ status: "open" }',
      projection: '{ total: 1 }',
    });
    const world = worldOf([exportTask], at(2026, 11, 2, 9, 30));
    await runTask(world.host, 't-1', 'manual');
    const [file] = await readdir(folder);
    const lines = (await readFile(join(folder, file ?? ''), 'utf8')).trim().split('\n');
    expect(lines.map((line) => Object.keys(JSON.parse(line) as object).sort())).toEqual([
      ['_id', 'total'],
      ['_id', 'total'],
      ['_id', 'total'],
    ]);
    expect(runsOf(world)[0]).toMatchObject({ status: 'done', documents: 3 });
  });

  it('fails an export whose filter the server refuses, and leaves no file', async () => {
    const world = worldOf(
      [shopTask({ kind: 'export', collection: 'orders', format: 'json', filter: '{ $bad: 1 }' })],
      at(2026, 11, 2, 9, 30),
    );
    await runTask(world.host, 't-1', 'manual');
    expect(runsOf(world)[0]?.status).toBe('failed');
    expect(runsOf(world)[0]?.error).toMatch(/\$bad/u);
    expect(await readdir(folder)).toEqual([]);
    expect(world.notices()[0]).toMatch(/^Scheduled task "Back up shop" failed: /u);
  });

  it('runs a task of a read-only connection and writes its output', async () => {
    const world = worldOf([shopTask({ connection: readOnly.id, format: 'gzip' })], at(2026, 11, 2, 9, 30));
    await runTask(world.host, 't-1', 'manual');
    expect(runsOf(world)[0]).toMatchObject({ status: 'done', documents: 8 });
    expect(await readdir(join(folder, 'm26shop_2026-11-02_09-30-00', 'm26shop'))).toContain('orders.bson.gz');
  });

  it('fails a backup of a collection that does not exist', async () => {
    const world = worldOf([shopTask({ collection: 'nothing' })], at(2026, 11, 2, 9, 30));
    await runTask(world.host, 't-1', 'manual');
    expect(runsOf(world)[0]).toMatchObject({
      status: 'failed',
      error: "The collection m26shop.nothing doesn't exist.",
    });
    expect(await readdir(folder)).toEqual([]);
  });
});

describe('task.retention', () => {
  it('keeps the last 2 outputs of the task and never a file of the user in the same folder', async () => {
    await writeFile(join(folder, 'notes.txt'), 'mine');
    const world = worldOf([shopTask({ keep: 2 })], at(2026, 11, 3, 8, 0));
    for (const minute of [0, 1, 2]) {
      world.now = at(2026, 11, 3, 8, minute);
      await runTask(world.host, 't-1', 'manual');
    }
    expect((await readdir(folder)).sort()).toEqual([
      'm26shop_2026-11-03_08-01-00.agz',
      'm26shop_2026-11-03_08-02-00.agz',
      'notes.txt',
    ]);
    expect(runsOf(world)[0]).toMatchObject({ status: 'done', deleted: 1 });
    expect(world.state().tasks.states['t-1']?.outputs.map((output) => output.path.split(/[\\/]/u).at(-1))).toEqual([
      'm26shop_2026-11-03_08-01-00.agz',
      'm26shop_2026-11-03_08-02-00.agz',
    ]);
  });

  it('keeps 2 after three runs of the scheduler of an hourly task', async () => {
    const hourly = shopTask({
      keep: 2,
      schedule: { kind: 'hours', every: 1, time: '00:00' },
      since: at(2026, 11, 4, 9, 30),
    });
    const world = worldOf([hourly], at(2026, 11, 4, 10, 0, 1));
    const scheduler = new Scheduler(
      {
        state: world.state,
        isStarting: (id) => world.host.book.isStarting(id),
        run: (id, trigger) => runTask(world.host, id, trigger),
      },
      { now: () => world.now, setTimer: () => 0, clearTimer: () => undefined },
    );
    for (const hour of [10, 11, 12]) {
      world.now = at(2026, 11, 4, hour, 0, 1);
      await scheduler.check();
    }
    expect(runsOf(world).map((run) => `${run.trigger} ${run.status}`)).toEqual([
      'schedule done',
      'schedule done',
      'schedule done',
    ]);
    expect((await readdir(folder)).sort()).toEqual([
      'm26shop_2026-11-04_11-00-01.agz',
      'm26shop_2026-11-04_12-00-01.agz',
    ]);
  });
});

describe('task.cancel', () => {
  it('stops a backup, deletes what it wrote, and logs the run as cancelled with no notification', async () => {
    const big = shopTask({ database: 'm26big', notifySuccess: true });
    const world = worldOf([big], at(2026, 11, 5, 7, 0));
    const running = runTask(world.host, 't-1', 'manual');
    while (world.state().tasks.running['t-1']?.progress === undefined) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const cancelled = await start(world.ports, {
      feature: featureId('task.cancel'),
      target: appTarget,
      args: { task: 't-1' },
    });
    expect(cancelled.kind).toBe('done');
    await running;
    expect(runsOf(world)[0]).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled: the incomplete output was deleted',
    });
    expect(await readdir(folder)).toEqual([]);
    expect(world.notices()).toEqual([]);
    expect(world.state().tasks.states['t-1']?.outputs).toEqual([]);
  }, 60_000);
});

describe('task.notify', () => {
  it('says nothing of a successful run unless the task asks for it', async () => {
    const world = worldOf([shopTask()], at(2026, 11, 6, 7, 0));
    await runTask(world.host, 't-1', 'manual');
    expect(runsOf(world)[0]?.status).toBe('done');
    expect(world.notices()).toEqual([]);
  });
});
