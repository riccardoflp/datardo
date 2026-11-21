/**
 * The Explain section's read against the throwaway replica set (M23): the explain of a find without an index, its
 * COLLSCAN and suggested index; that index created through `index.create`, opened on the suggested keys, and the
 * explain after it; the index of the ESR rule, which takes away the COLLSCAN and the in-memory sort; the explain of a
 * pipeline, and of one that writes, refused; a cancel while the server runs the query. A sharded cluster is not
 * started here: `explain.shards` is tested on replies written by hand (test/unit/explain/shards.test.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { editorJson, type Stage } from '../../../src/features/aggregate/types';
import type { ExplainResult } from '../../../src/features/explain/run';
import { indexKeysDocument } from '../../../src/features/explain/suggest-index';
import { dialogAnswers } from '../../../src/features/index/dialog';
import { dialogAboutOf, dialogOfQuestion } from '../../../src/features/index/parts/dialog-question';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import type { Target } from '../../../src/shared/target';
import { live, localId, type Live } from '../undo/live';

const database = 'explain_it';
const collection = 'orders';
const target: Target = { kind: 'collection', connection: localId, database, collection };
let runner: Live;
const questions: Question[] = [];

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function send(method: string, args: readonly Json[], on: string | null = collection): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: { engine: 'mongodb', database, ...(on === null ? {} : { collection: on }), method, arguments: args },
    },
    AbortSignal.timeout(60_000),
  );
}

function startOn(feature: string, args: Json, signal?: AbortSignal): Promise<IntentResult> {
  return start(runner.ports, { feature: featureId(feature), target, args }, signal === undefined ? {} : { signal });
}

async function explainFind(filter: string, sort = ''): Promise<ExplainResult> {
  const result = await startOn('explain.run', { mode: 'find', query: { filter, sort, projection: '' } });
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result as ExplainResult;
}

/** `index.create` opened on the keys as **Create…** passes them, the dialog answering with what it opened on. */
async function createSuggested(result: ExplainResult): Promise<string | undefined> {
  const keys = indexKeysDocument(result.suggestion ?? []);
  const started = await startOn('index.create', { connection: localId, database, collection, keys });
  expect(started).toEqual({ kind: 'done' });
  const field = questions.at(-1)?.fields[0];
  return field !== undefined && 'default' in field && typeof field.default === 'string' ? field.default : undefined;
}

const stage = (name: string, body: string): Stage => ({ name, body, enabled: true });

beforeAll(async () => {
  runner = await live();
  Object.assign(runner.ports.dialogs, {
    ask: (_feature: unknown, question: Question): Promise<Answers> => {
      questions.push(question);
      // The window opens the dialog of the question and presses its main button, as it opened.
      const about = dialogAboutOf(question);
      return Promise.resolve(about === undefined ? {} : (dialogAnswers(dialogOfQuestion(about)) ?? {}));
    },
  });
});

afterAll(async () => {
  await send('dropDatabase', [], null).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  questions.length = 0;
  await send('dropDatabase', [], null);
  await send('insertMany', [
    Array.from({ length: 1000 }, (_, index) => ({
      _id: int(index),
      status: index % 333 === 1 ? 'paid' : 'new',
      total: int(index),
      createdAt: { $date: { $numberLong: String(Date.UTC(2026, 0, 1) + index * 60_000) } },
    })),
  ]);
}, 60_000);

describe('explain.run', () => {
  it('explains a find without an index: COLLSCAN, 3 returned of 1,000 examined, and the index { status: 1 }', async () => {
    const result = await explainFind('{ status: "paid" }');
    expect(result.kind).toBe('find');
    expect(result.summary.collscan).toBe(true);
    expect(result.summary.indexes).toEqual([]);
    expect(result.summary.numbers).toMatchObject({ returned: 3, docsExamined: 1000 });
    expect(result.suggestion).toEqual([{ field: 'status', direction: 1 }]);
  });

  it('creates the suggested index through index.create, named status_1; the explain then uses it', async () => {
    const before = await explainFind('{ status: "paid" }');
    expect(await createSuggested(before)).toBe('{ status: 1 }');
    const names = ((await send('listIndexes', [])) as readonly { name: string }[]).map((index) => index.name);
    expect(names).toContain('status_1');
    const after = await explainFind('{ status: "paid" }');
    expect(after.summary.collscan).toBe(false);
    expect(after.summary.indexes).toEqual(['status_1']);
    expect(after.summary.numbers).toMatchObject({ returned: 3, docsExamined: 3 });
    expect(after.suggestion).toBeUndefined();
  });

  it('suggests the ESR index for an equality, a range and a sort; with it, no COLLSCAN and no in-memory sort', async () => {
    const filter = '{ status: "paid", total: { $gt: 5 } }';
    const before = await explainFind(filter, '{ createdAt: -1 }');
    expect(before.summary.inMemorySort).toBe(true);
    expect(before.suggestion).toEqual([
      { field: 'status', direction: 1 },
      { field: 'createdAt', direction: -1 },
      { field: 'total', direction: 1 },
    ]);
    expect(await createSuggested(before)).toBe('{ status: 1, createdAt: -1, total: 1 }');
    const after = await explainFind(filter, '{ createdAt: -1 }');
    expect(after.summary.collscan).toBe(false);
    expect(after.summary.inMemorySort).toBe(false);
    expect(after.summary.indexes).toEqual(['status_1_createdAt_-1_total_1']);
  });

  it('explains a pipeline, and refuses one ending with $out without sending it', async () => {
    const match = stage('$match', '{ status: "paid" }');
    const read = await startOn('explain.run', { mode: 'aggregate', pipeline: editorJson({ stages: [match] }) });
    expect(read.kind).toBe('read');
    const result = (read as { readonly result: ExplainResult }).result;
    expect(result.kind).toBe('pipeline');
    expect(result.summary.collscan).toBe(true);
    const writes = { stages: [match, stage('$out', '"archive"')] };
    const refused = await startOn('explain.run', { mode: 'aggregate', pipeline: editorJson(writes) });
    expect(refused).toMatchObject({ kind: 'refused', code: 'explain.run/writes' });
    const collections = (await send('listCollections', [{}], null)) as readonly { name: string }[];
    expect(collections.map((each) => each.name)).not.toContain('archive');
  });

  // Q174: the command is not ended on the server (runner.cancel's killOp is not sent); it ends at its time limit.
  it('is cancelled while the server runs the query', async () => {
    const controller = new AbortController();
    const filter = '{ $where: "sleep(5) || true" }';
    const running = startOn(
      'explain.run',
      { mode: 'find', query: { filter, sort: '', projection: '' } },
      controller.signal,
    );
    const explaining = async (): Promise<number> => {
      const reply = (await runner.engines.send(
        {
          connection: localId,
          request: {
            engine: 'mongodb',
            database: 'admin',
            method: 'aggregate',
            arguments: [[{ $currentOp: {} }, { $match: { 'command.explain.find': collection } }]],
          },
        },
        AbortSignal.timeout(10_000),
      )) as readonly unknown[];
      return reply.length;
    };
    await expect.poll(explaining, { timeout: 10_000 }).toBe(1);
    controller.abort();
    expect((await running).kind).toBe('cancelled');
  });
});
