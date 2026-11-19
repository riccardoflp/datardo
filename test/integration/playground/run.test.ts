/**
 * Playgrounds against a real MongoDB replica set (M28's exit criteria): the script runs as the process of a run runs
 * it, here in this process, and the host of the main process answers its calls with the engines. A run and its
 * result with the types kept, a write refused on a read-only connection with nothing sent, a drop confirmed and one
 * cancelled, Stop, sessions and transactions and what the end of the run closes, and the publishing for redis-oplog of
 * a script's write.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from 'redis';
import type { Json } from '../../../src/shared/engine-request';
import { tabId } from '../../../src/shared/ids';
import type { RunResult } from '../../../src/shared/state/playgrounds';
import { rewritten } from '../../../src/features/playground/rewrite';
import type { FromRun, ToRun } from '../../../src/features/playground/runtime';
import { PlaygroundHost, type Launcher, type RunProcess } from '../../../src/main/playground/host';
import { runScript } from '../../../src/main/playground/script';
import type { RunnerPorts } from '../../../src/runner/ports';
import { testServers } from '../servers';
import { live, localId, type Live } from '../undo/live';

const servers = testServers();
const database = 'playground_it';
const tab = tabId('tab-1');
let runner: Live;
let readOnly = false;
let answer = true;
let asked = 0;
let dismissed = 0;

/** The process of a run, here: the messages cross as they would between processes, copied. */
function inProcess(): Launcher {
  return (): RunProcess => {
    let listener: (message: FromRun) => void = () => undefined;
    let killed = false;
    let receive: ((message: ToRun) => void) | undefined;
    return {
      post: (message) => {
        if (killed) {
          return;
        }
        const copy = structuredClone(message);
        if (copy.kind === 'start') {
          receive = runScript({ code: copy.code, database: copy.database, firstLine: copy.firstLine }, (out) => {
            queueMicrotask(() => {
              if (!killed) {
                listener(structuredClone(out));
              }
            });
          });
          return;
        }
        queueMicrotask(() => receive?.(copy));
      },
      onMessage: (each) => {
        listener = each;
      },
      onExit: () => undefined,
      kill: () => {
        killed = true;
      },
    };
  };
}

function ports(): RunnerPorts {
  return {
    ...runner.ports,
    isReadOnly: () => readOnly,
    dialogs: {
      ask: () => Promise.resolve({}),
      confirm: () => {
        asked += 1;
        return Promise.resolve(answer);
      },
      dismiss: () => {
        dismissed += 1;
      },
    },
  };
}

const host = new PlaygroundHost(inProcess());

/** Runs a script in the playground of `tab` on `playground_it`, and gives its result once shown. */
async function run(source: string, more: { readonly signal?: (stop: () => void) => void } = {}): Promise<RunResult> {
  const script = rewritten(source);
  if (script.kind !== 'rewritten') {
    throw new Error(script.message);
  }
  const running = host.start(ports(), {
    tab,
    title: 'Playground 1',
    connection: localId,
    database,
    firstLine: 1,
    code: script.code,
    writes: true,
  });
  more.signal?.(() => void host.stop());
  await running.ended;
  const result = runner.state().playgrounds[tab]?.result;
  if (result === undefined) {
    throw new Error('The run left no result.');
  }
  return result;
}

async function send(collection: string, method: string, args: readonly Json[]): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args } },
    AbortSignal.timeout(30_000),
  );
}

async function collections(): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, method: 'getCollectionNames', arguments: [] } },
    AbortSignal.timeout(30_000),
  );
}

function logText(): string {
  return runner
    .state()
    .runner.log.map((line) => line.text)
    .join('\n');
}

beforeAll(async () => {
  runner = await live();
  runner.ports.state.dispatch({
    slice: 'playgrounds',
    type: 'opened',
    playground: { tab, defaultDatabase: database, text: '', savedText: '', layout: 'table' },
  });
  await runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, method: 'dropDatabase', arguments: [] } },
    AbortSignal.timeout(30_000),
  );
});

afterAll(async () => {
  await runner.engines
    .send(
      { connection: localId, request: { engine: 'mongodb', database, method: 'dropDatabase', arguments: [] } },
      AbortSignal.timeout(30_000),
    )
    .catch(() => undefined);
  await runner.close();
});

beforeEach(() => {
  readOnly = false;
  answer = true;
  asked = 0;
  dismissed = 0;
});

describe('playground.run', () => {
  it('runs a script that writes and reads, and shows the documents of its last expression', async () => {
    const result = await run(
      [
        'db.orders.insertMany([{ _id: 1, status: "paid", total: 30 }, { _id: 2, status: "new", total: 10 },',
        '  { _id: 3, status: "paid", total: 20 }]);',
        'print("inserted");',
        'db.orders.find({ status: "paid" }).sort({ total: -1 })',
      ].join('\n'),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual(['inserted']);
    expect(result.value).toEqual({
      kind: 'documents',
      documents: [
        { _id: { $numberInt: '1' }, status: 'paid', total: { $numberInt: '30' } },
        { _id: { $numberInt: '3' }, status: 'paid', total: { $numberInt: '20' } },
      ],
      more: false,
    });
    expect(runner.state().runner.refreshed.connection).toBe(localId);
  });

  it('reports the error of the server on the line of its call', async () => {
    const result = await run('db.orders.countDocuments();\ndb.orders.insertOne({ _id: 1 })');
    expect(result.error?.line).toBe(2);
    expect(result.error?.message).toMatch(/duplicate key/u);
  });
});

describe('playground.results', () => {
  it('keeps the types of the values a script writes and reads back', async () => {
    const result = await run(
      [
        'db.kinds.insertOne({ _id: ObjectId("65f1c0ffee0000000000a2c1"), long: NumberLong("9007199254740993"),',
        '  price: NumberDecimal("19.90"), at: ISODate("2026-01-02T03:04:05.006Z"), double: Double(3), int: NumberInt(7) });',
        'db.copies.insertOne(db.kinds.findOne());',
        'db.copies.findOne()',
      ].join('\n'),
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      kind: 'value',
      value: {
        _id: { $oid: '65f1c0ffee0000000000a2c1' },
        long: { $numberLong: '9007199254740993' },
        price: { $numberDecimal: '19.90' },
        at: { $date: { $numberLong: String(Date.parse('2026-01-02T03:04:05.006Z')) } },
        double: { $numberDouble: '3.0' },
        int: { $numberInt: '7' },
      },
    });
  });
});

describe('playground.writes', () => {
  it('refuses a write on a read-only connection and sends nothing', async () => {
    readOnly = true;
    const result = await run('db.untouched.insertOne({ _id: 1 })');
    expect(result.error?.message).toMatch(/read-only/u);
    expect(await send('untouched', 'countDocuments', [{}])).toEqual({ $numberInt: '0' });
  });

  it('drops a collection once the user confirms, and writes the answer in the Log', async () => {
    await send('dropped', 'insertOne', [{ _id: 1 }]);
    const result = await run('db.dropped.drop()');
    expect(asked).toBe(1);
    expect(result.error).toBeUndefined();
    expect(await collections()).not.toContain('dropped');
    expect(logText()).toMatch(/\[Playground\] db\.dropped\.drop\(\): confirmed/u);
  });

  it('throws in the script when the user cancels a drop, and drops nothing', async () => {
    answer = false;
    await send('kept', 'insertOne', [{ _id: 1 }]);
    const result = await run('db.kept.drop();\nprint("after")');
    expect(asked).toBe(1);
    expect(result.error?.line).toBe(1);
    expect(result.output).toEqual([]);
    expect(await collections()).toContain('kept');
  });

  it('sends the drop of a collection that does not exist without asking', async () => {
    const result = await run('db.neverThere.drop()');
    expect(asked).toBe(0);
    expect(result.error).toBeUndefined();
  });
});

describe('playground.stop', () => {
  it('stops a run waiting on the server or in the script, and shows that it was stopped', async () => {
    const started = Date.now();
    const result = await run('print("before");\nsleep(60000);\nprint("after")', {
      signal: (stop) => {
        setTimeout(stop, 200);
      },
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.stopped).toBe(true);
    expect(result.output[0]).toBe('before');
    expect(result.output).not.toContain('after');
  });

  it('closes a drop confirmation that is open when the run is stopped, and sends nothing', async () => {
    await send('waiting', 'insertOne', [{ _id: 1 }]);
    const stopping = host;
    const script = rewritten('db.waiting.drop()');
    if (script.kind !== 'rewritten') {
      throw new Error(script.message);
    }
    const hanging: RunnerPorts = {
      ...ports(),
      dialogs: {
        ask: () => Promise.resolve({}),
        confirm: () => new Promise<boolean>(() => undefined),
        dismiss: () => {
          dismissed += 1;
        },
      },
    };
    const running = stopping.start(hanging, {
      tab,
      title: 'Playground 1',
      connection: localId,
      database,
      firstLine: 1,
      code: script.code,
      writes: true,
    });
    const until = Date.now() + 5000;
    while (runner.state().playgrounds[tab]?.run?.waitingForDrop !== true && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await stopping.stop();
    await running.ended;
    expect(dismissed).toBe(1);
    expect(runner.state().playgrounds[tab]?.result?.stopped).toBe(true);
    expect(await collections()).toContain('waiting');
  });
});

describe('playground.sessions', () => {
  it('commits a transaction of a session: its writes are seen after the commit', async () => {
    const result = await run(
      [
        'const session = db.getMongo().startSession();',
        'const orders = session.getDatabase("playground_it").tx;',
        'session.startTransaction();',
        'orders.insertOne({ _id: 1 });',
        'const outside = db.tx.countDocuments();',
        'session.commitTransaction();',
        'session.endSession();',
        '[outside, db.tx.countDocuments()]',
      ].join('\n'),
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ kind: 'value', value: [{ $numberInt: '0' }, { $numberInt: '1' }] });
  });

  it('retries the callback of withTransaction and gives its value', async () => {
    const result = await run(
      [
        'const session = db.getMongo().startSession();',
        'const value = session.withTransaction(async (s) => {',
        '  s.getDatabase("playground_it").withCallback.insertOne({ _id: 1 });',
        '  return "done";',
        '});',
        'session.endSession();',
        'value',
      ].join('\n'),
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ kind: 'text', text: 'done' });
    expect(await send('withCallback', 'countDocuments', [{}])).toEqual({ $numberInt: '1' });
  });

  it('aborts a transaction the script left open, ends its session, and says so in the output', async () => {
    const result = await run(
      [
        'const session = db.getMongo().startSession();',
        'session.startTransaction();',
        'session.getDatabase("playground_it").leftOpen.insertOne({ _id: 1 });',
        '"left"',
      ].join('\n'),
    );
    expect(result.error).toBeUndefined();
    expect(result.output.length).toBeGreaterThan(0);
    expect(await send('leftOpen', 'countDocuments', [{}])).toEqual({ $numberInt: '0' });
  });
});

describe('oplog.playground-writes', () => {
  it('publishes the write of a script for redis-oplog on the collection’s channel', async () => {
    const received: { channel: string; message: unknown }[] = [];
    const subscriber = createClient({ url: servers.redis ?? '' });
    await subscriber.connect();
    await subscriber.pSubscribe(`${runner.prefix}*`, (message, channel) => {
      received.push({ channel: channel.slice(runner.prefix.length), message: JSON.parse(message) as unknown });
    });
    try {
      const result = await run('db.published.insertOne({ _id: "a", status: "new" })');
      expect(result.error).toBeUndefined();
      await runner.published();
      const until = Date.now() + 5000;
      while (received.length < 1 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(received[0]).toMatchObject({ channel: 'published', message: { e: 'i', d: { _id: 'a' } } });
    } finally {
      await subscriber.pUnsubscribe();
      subscriber.destroy();
    }
  });
});
