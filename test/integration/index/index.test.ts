/**
 * The index area against the throwaway replica set (M22): the list with its uses and sizes, an index created from
 * the dialog's answers, changed in place or rebuilt after a confirmation (the old one put back when the server refuses
 * the new definition), hidden, unhidden and dropped, and every write refused on a read-only connection. The search
 * indexes need a server with search: their tests are skipped unless `DATARDO_TEST_SEARCH_URI` gives one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { IndexList } from '../../../src/features/index/types';
import { dialogOutcome, failuresSince } from '../../../src/features/index/parts/dialog-outcome';
import { text } from '../../../src/features/index/text';
import type { IntentResult } from '../../../src/shared/bridge';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import type { Confirmation } from '../../../src/shared/state/runner';
import type { Target } from '../../../src/shared/target';
import { live, localId, type Live } from '../undo/live';

const database = 'index_it';
const collection = 'orders';
const target: Target = { kind: 'collection', connection: localId, database, collection };
const where = { connection: localId, database, collection };
let runner: Live;
let answers: (question: Question) => Answers | undefined = () => undefined;
let confirm = true;
const confirmations: Confirmation[] = [];
const questions: Question[] = [];

/** What the index dialog answers: the keys and options, read. */
function definition(keys: Json, options: Json = {}): Answers {
  return { keys: { kind: 'value', value: keys }, options: { kind: 'value', value: options } };
}

async function send(method: string, args: readonly Json[], on: string | null = collection): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: {
        engine: 'mongodb',
        database,
        ...(on === null ? {} : { collection: on }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(60_000),
  );
}

type Listed = Readonly<Record<string, Json>> & { readonly name: string };

async function indexes(): Promise<readonly Listed[]> {
  return (await send('listIndexes', [])) as readonly Listed[];
}

async function indexNamed(name: string): Promise<Listed | undefined> {
  return (await indexes()).find((index) => index.name === name);
}

function start(feature: string, args: Readonly<Record<string, Json>> = {}): Promise<IntentResult> {
  return runner.start(feature, target, { ...where, ...args });
}

function lastNotification(): string | undefined {
  return runner.state().runner.notifications.at(-1)?.text;
}

function setReadOnly(readOnly: boolean): void {
  const state = runner.state().connections;
  const saved = state.saved.map((each) => (each.id === localId ? { ...each, readOnly } : each));
  runner.ports.state.dispatch({ slice: 'connections', type: 'loaded', saved, keychain: true, readOnlyFile: false });
}

function int(value: number): Json {
  return { $numberInt: String(value) };
}

beforeAll(async () => {
  runner = await live();
  Object.assign(runner.ports.dialogs, {
    ask: (_feature: unknown, question: Question) => {
      questions.push(question);
      return Promise.resolve(answers(question));
    },
    confirm: (_feature: unknown, confirmation: Confirmation) => {
      confirmations.push(confirmation);
      return Promise.resolve(confirm);
    },
  });
});

afterAll(async () => {
  await send('dropDatabase', [], null).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  answers = () => undefined;
  confirm = true;
  confirmations.length = 0;
  questions.length = 0;
  setReadOnly(false);
  await send('dropDatabase', [], null);
  await send('insertMany', [
    [
      { _id: 1, email: 'a@b.c', status: 'paid', createdAt: { $date: '2026-11-01T00:00:00Z' } },
      { _id: 2, email: 'a@b.c', status: 'new', createdAt: { $date: '2026-11-02T00:00:00Z' } },
      { _id: 3, email: 'd@e.f', status: 'paid', createdAt: { $date: '2026-11-03T00:00:00Z' } },
    ],
  ]);
  await send(
    'runCommand',
    [
      {
        createIndexes: collection,
        indexes: [
          { key: { status: int(1) }, name: 'status_1' },
          { key: { createdAt: int(1) }, name: 'created_1', expireAfterSeconds: int(86_400) },
          { key: { email: int(1) }, name: 'email_1' },
        ],
      },
    ],
    null,
  );
});

describe('index.list', () => {
  it('lists the indexes with their uses, their sizes and the documents of the collection', async () => {
    await send('find', [{ status: 'paid' }, { hint: 'status_1' }]);
    const result = await start('index.list');
    expect(result.kind).toBe('read');
    const list = (result as { readonly result: IndexList }).result;
    expect(list.indexes.map((index) => index.name)).toEqual(['_id_', 'status_1', 'created_1', 'email_1']);
    const status = list.indexes.find((index) => index.name === 'status_1');
    expect(status?.uses).toBeGreaterThanOrEqual(1);
    expect(status?.size).toBeGreaterThan(0);
    expect(status?.building).toBe(false);
    expect(list.totals.documents).toBe(3);
  });
});

describe('index.create', () => {
  it('creates the index the dialog answers, after reading the indexes for its note', async () => {
    answers = () => definition({ status: 1, createdAt: -1 }, { unique: true });
    expect(await start('index.create')).toEqual({ kind: 'done' });
    expect(questions[0]?.element).toBe('index.dialog@dialog');
    expect(await indexNamed('status_1_createdAt_-1')).toMatchObject({ unique: true });
    expect(lastNotification()).toBe(text.create.created('status_1_createdAt_-1'));
  });

  it('moves commitQuorum out of the index to the command', async () => {
    answers = () => definition({ total: 1 }, { commitQuorum: 'majority' });
    expect(await start('index.create')).toEqual({ kind: 'done' });
    const created = await indexNamed('total_1');
    expect(created).toBeDefined();
    expect(created).not.toHaveProperty('commitQuorum');
  });

  it('says when an identical index already exists', async () => {
    answers = () => definition({ status: 1 });
    expect(await start('index.create')).toEqual({ kind: 'done' });
    expect(lastNotification()).toBe(text.create.identical);
  });

  it("keeps the dialog open with the server's error for an option it does not know, or duplicate values", async () => {
    for (const [keys, options] of [
      [{ status: 1, total: 1 }, { notAnOption: true }],
      [{ email: -1 }, { unique: true }],
    ] as const) {
      const since = runner.state().runner.logged;
      answers = () => definition(keys, options);
      const result = await start('index.create');
      expect(result.kind).toBe('failed');
      const failures = failuresSince(runner.state().runner.log, 'index.create', since);
      const outcome = dialogOutcome({ feature: 'index.create', end: result, failures });
      expect(outcome.kind).toBe('again');
    }
    const lines = runner
      .state()
      .runner.log.map((line) => line.text)
      .join('\n');
    expect(lines).toContain('E11000');
    expect((await indexes()).map((index) => index.name)).toEqual(['_id_', 'status_1', 'created_1', 'email_1']);
  });

  it('is refused on a read-only connection, and nothing is sent', async () => {
    setReadOnly(true);
    answers = () => definition({ total: 1 });
    expect(await start('index.create')).toMatchObject({ kind: 'refused', code: 'index.create/read-only' });
    expect(await indexNamed('total_1')).toBeUndefined();
  });
});

describe('index.edit', () => {
  function editTo(name: string, keys: Json, options: Json): Promise<IntentResult> {
    answers = () => definition(keys, options);
    return start('index.edit', { index: name });
  }

  it('hides an index with one collMod, with no confirmation', async () => {
    expect(await editTo('status_1', { status: 1 }, { hidden: true })).toEqual({ kind: 'done' });
    expect(confirmations).toEqual([]);
    expect(await indexNamed('status_1')).toMatchObject({ hidden: true });
    expect(lastNotification()).toBe('Index status_1: hidden.');
  });

  it('changes a TTL in place', async () => {
    expect(await editTo('created_1', { createdAt: 1 }, { name: 'created_1', expireAfterSeconds: 7200 })).toEqual({
      kind: 'done',
    });
    expect(await indexNamed('created_1')).toMatchObject({ expireAfterSeconds: int(7200) });
    expect(lastNotification()).toBe('Index created_1: documents expire after 2 hours.');
  });

  it('rebuilds an index made unique under the same name, after a confirmation', async () => {
    const options = { name: 'created_1', expireAfterSeconds: 86_400, unique: true };
    expect(await editTo('created_1', { createdAt: 1 }, options)).toEqual({ kind: 'done' });
    expect(confirmations[0]?.title).toBe(text.edit.recreateTitle('created_1', collection));
    expect(await indexNamed('created_1')).toMatchObject({ unique: true });
    expect(lastNotification()).toBe(text.edit.recreated('created_1'));
  });

  it('builds the new index first and drops the old one when the keys and the name change', async () => {
    expect(await editTo('status_1', { status: -1 }, { name: 'byStatus' })).toEqual({ kind: 'done' });
    expect(await indexNamed('status_1')).toBeUndefined();
    expect(await indexNamed('byStatus')).toMatchObject({ key: { status: int(-1) } });
    expect(lastNotification()).toBe(text.edit.createdAndDropped('byStatus', 'status_1'));
  });

  it('drops the old index first when the server refuses the two side by side', async () => {
    expect(await editTo('status_1', { status: 1 }, { name: 'byStatus' })).toEqual({ kind: 'done' });
    expect((await indexes()).map((index) => index.name)).toEqual(['_id_', 'created_1', 'email_1', 'byStatus']);
  });

  it('puts the index back as it was when the server refuses the new definition', async () => {
    const since = runner.state().runner.logged;
    const result = await editTo('email_1', { email: 1 }, { name: 'email_1', unique: true });
    expect(result).toEqual({ kind: 'done' });
    const restored = await indexNamed('email_1');
    expect(restored).toBeDefined();
    expect(restored).not.toHaveProperty('unique');
    const failures = failuresSince(runner.state().runner.log, 'index.edit', since);
    expect(failures[0]).toContain('E11000');
    const current = { keys: { email: 1 }, options: { name: 'email_1' } };
    const next = { keys: { email: 1 }, options: { name: 'email_1', unique: true } };
    const outcome = dialogOutcome({
      feature: 'index.edit',
      end: result,
      failures,
      edited: { collection, name: 'email_1', current, next },
    });
    expect(outcome).toEqual({ kind: 'again', error: `${failures[0] ?? ''}\n${text.edit.restored('email_1')}` });
    const notifications = runner.state().runner.notifications.map((each) => each.text);
    expect(notifications.some((each) => each.includes('this step failed'))).toBe(true);
  });

  it('leaves the index as it is when the confirmation is cancelled', async () => {
    confirm = false;
    expect(await editTo('status_1', { status: 1 }, { name: 'status_1', unique: true })).toEqual({ kind: 'cancelled' });
    expect(await indexNamed('status_1')).not.toHaveProperty('unique');
  });

  it('refuses the _id index and a read-only connection', async () => {
    expect(await start('index.edit', { index: '_id_' })).toMatchObject({ code: 'index.edit/id-index' });
    setReadOnly(true);
    expect(await start('index.edit', { index: 'status_1' })).toMatchObject({ code: 'index.edit/read-only' });
  });
});

describe('index.hide', () => {
  it('hides, then unhides an index', async () => {
    expect(await start('index.hide', { index: 'status_1', hidden: true })).toEqual({ kind: 'done' });
    expect(await indexNamed('status_1')).toMatchObject({ hidden: true });
    expect(await start('index.hide', { index: 'status_1', hidden: false })).toEqual({ kind: 'done' });
    expect(await indexNamed('status_1')).not.toHaveProperty('hidden');
  });

  it('is refused on a read-only connection', async () => {
    setReadOnly(true);
    expect(await start('index.hide', { index: 'status_1', hidden: true })).toMatchObject({
      code: 'index.hide/read-only',
    });
  });
});

describe('index.drop', () => {
  it('asks to type the name of the index, then drops it', async () => {
    expect(await start('index.drop', { index: 'status_1' })).toEqual({ kind: 'done' });
    expect(confirmations[0]?.danger).toMatchObject({ kind: 'destructive', name: 'status_1' });
    expect(await indexNamed('status_1')).toBeUndefined();
  });

  it('is refused on a read-only connection, and the index stays', async () => {
    setReadOnly(true);
    expect(await start('index.drop', { index: 'status_1' })).toMatchObject({ code: 'index.drop/read-only' });
    expect(await indexNamed('status_1')).toBeDefined();
  });
});

describe('index.list-search', () => {
  it('says that the throwaway server has no search', async () => {
    const result = await start('index.list-search');
    expect(result).toMatchObject({ kind: 'read', result: { kind: 'unsupported' } });
  });
});
