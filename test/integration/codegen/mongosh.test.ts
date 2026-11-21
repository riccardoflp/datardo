/**
 * The code for mongosh against the throwaway replica set (M24): the text written for a find with a value of several
 * BSON types, and for a pipeline, pasted in a playground of the same connection, returns the documents the tab shows.
 * The script runs here, in this process, as the process of a run runs it (test/integration/playground/run.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generatedCode } from '../../../src/features/codegen/types';
import type { CodeQuery } from '../../../src/features/codegen/source';
import { rewritten } from '../../../src/features/playground/rewrite';
import type { FromRun, ToRun } from '../../../src/features/playground/runtime';
import { PlaygroundHost, type Launcher, type RunProcess } from '../../../src/main/playground/host';
import { runScript } from '../../../src/main/playground/script';
import type { Json } from '../../../src/shared/engine-request';
import { tabId } from '../../../src/shared/ids';
import type { RunResult } from '../../../src/shared/state/playgrounds';
import { live, localId, type Live } from '../undo/live';

const database = 'codegen_it';
const collection = 'my-coll.2024';
const tab = tabId('tab-code');
let runner: Live;

function inProcess(): Launcher {
  return (): RunProcess => {
    let listener: (message: FromRun) => void = () => undefined;
    let receive: ((message: ToRun) => void) | undefined;
    return {
      post: (message) => {
        const copy = structuredClone(message);
        if (copy.kind === 'start') {
          receive = runScript({ code: copy.code, database: copy.database, firstLine: copy.firstLine }, (out) => {
            queueMicrotask(() => {
              listener(structuredClone(out));
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
      kill: () => undefined,
    };
  };
}

const host = new PlaygroundHost(inProcess());

async function run(source: string): Promise<RunResult> {
  const script = rewritten(source);
  if (script.kind !== 'rewritten') {
    throw new Error(script.message);
  }
  const running = host.start(runner.ports, {
    tab,
    title: 'Playground 1',
    connection: localId,
    database,
    firstLine: 1,
    code: script.code,
    writes: false,
  });
  await running.ended;
  const result = runner.state().playgrounds[tab]?.result;
  if (result === undefined) {
    throw new Error('The run left no result.');
  }
  return result;
}

async function send(method: string, args: readonly Json[], on: string | null = collection): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: { engine: 'mongodb', database, ...(on === null ? {} : { collection: on }), method, arguments: args },
    },
    AbortSignal.timeout(30_000),
  );
}

function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

beforeAll(async () => {
  runner = await live();
  runner.ports.state.dispatch({
    slice: 'playgrounds',
    type: 'opened',
    playground: { tab, defaultDatabase: database, text: '', savedText: '', layout: 'table' },
  });
  await send('dropDatabase', [], null);
  await send('insertMany', [
    Array.from({ length: 12 }, (_, index) => ({
      _id: { $oid: `65f1c0de9a1b2c3d4e5f6a${index.toString(16).padStart(2, '0')}` },
      status: index % 2 === 0 ? 'paid' : 'new',
      total: { $numberLong: String(index * 10) },
      price: { $numberDecimal: `${String(index)}.50` },
      createdAt: date(`2024-0${String((index % 3) + 1)}-01T10:00:00.000Z`),
    })),
  ]);
});

afterAll(async () => {
  await send('dropDatabase', [], null).catch(() => undefined);
  await runner.close();
});

describe('codegen.mongosh', () => {
  it('writes a find that, pasted in a playground of the same connection, returns the documents the tab shows', async () => {
    const query: CodeQuery = {
      kind: 'find',
      filter: {
        status: 'paid',
        total: { $gte: { $numberLong: '20' } },
        createdAt: { $lt: date('2024-03-01T00:00:00.000Z') },
        _id: { $ne: { $oid: '65f1c0de9a1b2c3d4e5f6a00' } },
      },
      projection: { status: { $numberInt: '1' }, total: { $numberInt: '1' }, price: { $numberInt: '1' } },
      sort: { total: { $numberInt: '-1' } },
    };
    const code = generatedCode('mongosh', query, { database, collection, program: false });
    expect(code).toContain(`db.getCollection("${collection}")`);
    const shown = await send('find', [query.filter, { projection: query.projection ?? {}, sort: query.sort ?? {} }]);
    const result = await run(code);
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ kind: 'documents', documents: shown });
  });

  it('writes a pipeline that, pasted in a playground, returns the documents of the pipeline', async () => {
    const pipeline: readonly Json[] = [
      { $match: { status: 'new' } },
      { $group: { _id: '$status', total: { $sum: '$total' }, count: { $sum: { $numberInt: '1' } } } },
    ];
    const code = generatedCode('mongosh', { kind: 'aggregate', pipeline }, { database, collection, program: false });
    const shown = await send('aggregate', [pipeline]);
    const result = await run(code);
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ kind: 'documents', documents: shown });
  });
});
