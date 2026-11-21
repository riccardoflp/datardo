/**
 * The manage area against the throwaway replica set (M21): databases and collections created, renamed and dropped,
 * a view's definition and a collection's validation rules saved, and the sample of a collection without rules. The
 * app actions the plans name are stand-ins that record what they were given: those of the main process are tested on
 * their own.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generatedText } from '../../../src/features/manage/validation';
import type { SampleSummary } from '../../../src/features/manage/generate-json-schema';
import type { AppAction } from '../../../src/runner/ports';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import type { Confirmation } from '../../../src/shared/state/runner';
import type { Target } from '../../../src/shared/target';
import { live, localId, type Live } from '../undo/live';

const database = 'manage_it';
const created = 'manage_it_created';
let runner: Live;
let answers: (question: Question) => Answers | undefined = () => ({});
const confirmations: Confirmation[] = [];
const moved: Json[] = [];

function on(collection: string): Target {
  return { kind: 'collection', connection: localId, database, collection };
}

function where(collection: string): Record<string, Json> {
  return { connection: localId, database, collection };
}

async function send(method: string, args: readonly Json[], collection?: string, db = database): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: {
        engine: 'mongodb',
        database: db,
        ...(collection === undefined ? {} : { collection }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(60_000),
  );
}

async function names(db = database): Promise<readonly string[]> {
  const listed = (await send('listCollections', [{}, { nameOnly: true }], undefined, db)) as readonly {
    readonly name: string;
  }[];
  return listed
    .map((each) => each.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
}

async function infoOf(collection: string): Promise<Record<string, Json> | undefined> {
  const listed = (await send('listCollections', [{ name: collection }])) as readonly Record<string, Json>[];
  return listed[0];
}

async function count(collection: string, filter: Json = {}): Promise<number> {
  const reply = (await send('countDocuments', [filter], collection)) as { readonly $numberInt?: string } | number;
  return typeof reply === 'number' ? reply : Number(reply.$numberInt);
}

function setReadOnly(readOnly: boolean): void {
  const state = runner.state().connections;
  const saved = state.saved.map((each) => (each.id === localId ? { ...each, readOnly } : each));
  runner.ports.state.dispatch({ slice: 'connections', type: 'loaded', saved, keychain: true, readOnlyFile: false });
}

beforeAll(async () => {
  runner = await live();
  Object.assign(runner.ports.dialogs, {
    ask: (_feature: unknown, question: Question) => Promise.resolve(answers(question)),
    confirm: (_feature: unknown, confirmation: Confirmation) => {
      confirmations.push(confirmation);
      return Promise.resolve(true);
    },
  });
  const actions = runner.ports.appActions as Map<string, AppAction>;
  actions.set('manage.rename-collection', (args) => {
    moved.push(args);
    return Promise.resolve();
  });
});

afterAll(async () => {
  await send('dropDatabase', []).catch(() => undefined);
  await send('dropDatabase', [], undefined, created).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  answers = () => ({});
  confirmations.length = 0;
  moved.length = 0;
  setReadOnly(false);
  await send('dropDatabase', []);
  await send(
    'insertMany',
    [
      [
        { _id: 1, status: 'paid' },
        { _id: 2, status: 'new' },
      ],
    ],
    'orders',
  );
  await send('runCommand', [{ create: 'recent', viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] }]);
});

describe('manage.create-database', () => {
  it('creates the database with its first collection, the names trimmed', async () => {
    answers = () => ({ name: ` ${created} `, first: ' orders ' });
    const result = await runner.start('manage.create-database', { kind: 'connection', connection: localId }, null);
    expect(result).toEqual({ kind: 'done' });
    expect(await names(created)).toEqual(['orders']);
  });

  it('creates nothing when the form is cancelled', async () => {
    answers = () => undefined;
    await send('dropDatabase', [], undefined, created);
    await runner.start('manage.create-database', { kind: 'connection', connection: localId }, null);
    expect(await names(created)).toEqual([]);
  });
});

describe('manage.create-collection', () => {
  it('creates a capped collection from options typed in mongosh syntax, with their types', async () => {
    answers = () => ({ name: 'logs', options: '{ capped: true, size: NumberLong(65536), max: 10 }' });
    const result = await runner.start('manage.create-collection', on('orders'), { connection: localId, database });
    expect(result).toEqual({ kind: 'done' });
    expect(await infoOf('logs')).toMatchObject({ options: { capped: true, max: { $numberInt: '10' } } });
  });

  it('is refused on a read-only connection, and nothing is sent', async () => {
    setReadOnly(true);
    answers = () => ({ name: 'logs', options: '' });
    const result = await runner.start('manage.create-collection', on('orders'), { connection: localId, database });
    expect(result).toMatchObject({ kind: 'refused', code: 'manage.create-collection/read-only' });
    expect(await names()).not.toContain('logs');
  });
});

describe('manage.rename-collection', () => {
  it('renames the collection, then moves what Datardo keeps for it', async () => {
    answers = () => ({ name: 'orders_2024' });
    const result = await runner.start('manage.rename-collection', on('orders'), where('orders'));
    expect(result).toEqual({ kind: 'done' });
    expect(await names()).toEqual(['orders_2024', 'recent']);
    expect(moved).toEqual([{ connection: localId, database, from: 'orders', to: 'orders_2024' }]);
  });

  it('renames nothing and sends nothing for the same name', async () => {
    answers = () => ({ name: ' orders ' });
    expect(await runner.start('manage.rename-collection', on('orders'), where('orders'))).toEqual({ kind: 'done' });
    expect(await names()).toEqual(['orders', 'recent']);
    expect(moved).toEqual([]);
  });

  it('moves nothing Datardo keeps when MongoDB refuses the rename', async () => {
    answers = () => {
      // The collection goes while the name is asked: MongoDB then refuses the rename.
      void send('drop', [], 'orders');
      return { name: 'orders_2024' };
    };
    const result = await runner.start('manage.rename-collection', on('orders'), where('orders'));
    expect(result).toMatchObject({ kind: 'failed' });
    expect(moved).toEqual([]);
  });

  it('refuses a view with Views cannot be renamed.', async () => {
    const result = await runner.start('manage.rename-collection', on('recent'), { ...where('recent'), view: true });
    expect(result).toEqual({
      kind: 'refused',
      code: 'manage.rename-collection/view',
      message: 'Views cannot be renamed.',
    });
  });
});

describe('manage.drop-collection', () => {
  it('asks to type orders, saying how many documents and indexes go, then drops it', async () => {
    const result = await runner.start('manage.drop-collection', on('orders'), { ...where('orders'), view: false });
    expect(result).toEqual({ kind: 'done' });
    expect(confirmations[0]?.danger).toEqual({
      kind: 'destructive',
      text: 'Deletes 2 documents and 1 index. This cannot be undone.',
      button: 'Drop',
      name: 'orders',
    });
    expect(confirmations[0]?.undoLine).toBe(
      'Nothing is kept: a collection can be larger than the undo history may hold.',
    );
    expect(await names()).toEqual(['recent']);
  });

  it('drops a view after one confirmation, without typing', async () => {
    const result = await runner.start('manage.drop-collection', on('recent'), { ...where('recent'), view: true });
    expect(result).toEqual({ kind: 'done' });
    expect(confirmations[0]?.danger).toMatchObject({ kind: 'confirm', button: 'Drop' });
    expect(await names()).toEqual(['orders']);
  });
});

describe('manage.drop-database', () => {
  it('asks to type the database name, then drops it', async () => {
    const result = await runner.start(
      'manage.drop-database',
      { kind: 'database', connection: localId, database },
      { connection: localId, database },
    );
    expect(result).toEqual({ kind: 'done' });
    expect(confirmations[0]?.danger).toMatchObject({ kind: 'destructive', name: database });
    expect(await names()).toEqual([]);
  });
});

describe('manage.read-options', () => {
  it('reads the definition of a view, and says when the name does not exist', async () => {
    const read = await runner.start('manage.read-options', on('recent'), where('recent'));
    expect(read).toMatchObject({
      kind: 'read',
      result: {
        kind: 'found',
        type: 'view',
        options: { viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] },
      },
    });
    expect(await runner.start('manage.read-options', on('gone'), where('gone'))).toEqual({
      kind: 'read',
      result: { kind: 'not-found' },
    });
  });
});

describe('manage.edit-view', () => {
  it('saves a new pipeline, after which the view returns the documents with status new', async () => {
    const definition = '{ viewOn: "orders", pipeline: [{ $match: { status: "new" } }] }';
    const result = await runner.start('manage.edit-view', on('recent'), { ...where('recent'), definition });
    expect(result).toEqual({ kind: 'done' });
    expect((await send('find', [{}], 'recent')) as readonly Json[]).toEqual([
      { _id: { $numberInt: '2' }, status: 'new' },
    ]);
  });

  it('applies values written in mongosh syntax with their types', async () => {
    const definition =
      '{ viewOn: "orders", pipeline: [{ $match: { at: { $gte: ISODate("2024-01-01T00:00:00Z") }, ' +
      'by: ObjectId("65f1c0de9a7b4e00012f3a2c") } }] }';
    expect(await runner.start('manage.edit-view', on('recent'), { ...where('recent'), definition })).toEqual({
      kind: 'done',
    });
    expect(await infoOf('recent')).toMatchObject({
      options: {
        pipeline: [
          {
            $match: {
              at: { $gte: { $date: { $numberLong: '1704067200000' } } },
              by: { $oid: '65f1c0de9a7b4e00012f3a2c' },
            },
          },
        ],
      },
    });
  });

  it('shows the error of MongoDB for a pipeline it refuses, and leaves the view unchanged', async () => {
    const definition = '{ viewOn: "orders", pipeline: [{ $out: "x" }] }';
    const result = await runner.start('manage.edit-view', on('recent'), { ...where('recent'), definition });
    expect(result).toMatchObject({ kind: 'failed' });
    expect(await infoOf('recent')).toMatchObject({ options: { pipeline: [{ $match: { status: 'paid' } }] } });
  });

  it('is refused through a connection made read-only after the tab was opened, and nothing is sent', async () => {
    setReadOnly(true);
    const definition = '{ viewOn: "orders", pipeline: [] }';
    const result = await runner.start('manage.edit-view', on('recent'), { ...where('recent'), definition });
    expect(result).toEqual({
      kind: 'refused',
      code: 'manage.edit-view/read-only',
      message: 'The connection Local is read-only.',
    });
    expect(await infoOf('recent')).toMatchObject({ options: { pipeline: [{ $match: { status: 'paid' } }] } });
  });
});

describe('manage.edit-validation', () => {
  const rules = (action: string): string =>
    `{ validator: { $jsonSchema: { bsonType: "object", required: ["status"] } }, validationAction: "${action}" }`;

  it('refuses an insert that breaks the rules with error, and accepts it with warn', async () => {
    expect(
      await runner.start('manage.edit-validation', on('orders'), { ...where('orders'), rules: rules('error') }),
    ).toEqual({ kind: 'done' });
    await expect(send('insertOne', [{ _id: 3 }], 'orders')).rejects.toThrow();
    expect(
      await runner.start('manage.edit-validation', on('orders'), { ...where('orders'), rules: rules('warn') }),
    ).toEqual({ kind: 'done' });
    await send('insertOne', [{ _id: 3 }], 'orders');
    expect(await count('orders')).toBe(3);
  });

  it('removes the rules with { validator: {} }, sending no level and no action', async () => {
    await runner.start('manage.edit-validation', on('orders'), { ...where('orders'), rules: rules('error') });
    expect(
      await runner.start('manage.edit-validation', on('orders'), { ...where('orders'), rules: '{ validator: {} }' }),
    ).toEqual({ kind: 'done' });
    expect((await infoOf('orders'))?.['options']).not.toHaveProperty('validator.$jsonSchema');
  });

  it('shows the error of MongoDB for a validator it refuses, and leaves the rules as they were', async () => {
    const wrong = '{ validator: { $jsonSchema: { bsonType: "strin" } } }';
    const result = await runner.start('manage.edit-validation', on('orders'), { ...where('orders'), rules: wrong });
    expect(result).toMatchObject({ kind: 'failed' });
    expect((await infoOf('orders'))?.['options']).toEqual({});
  });
});

describe('manage.validation', () => {
  it('proposes rules generated from 37 documents for a collection of 37 without rules', async () => {
    const people = Array.from({ length: 37 }, (_, index) => ({ _id: index, name: `n${String(index)}`, age: index }));
    await send('insertMany', [people], 'people');
    const read = await runner.start('manage.validation:sample', on('people'), where('people'));
    expect(read.kind).toBe('read');
    const summary = (read.kind === 'read' ? read.result : undefined) as SampleSummary;
    expect(summary.analyzed).toBe(37);
    const generated = generatedText(summary);
    expect(generated).toContain('required: ["_id", "name", "age"]');
    expect(generated).toContain('validationLevel: "strict"');
    const result = await runner.start('manage.edit-validation', on('people'), { ...where('people'), rules: generated });
    expect(result).toEqual({ kind: 'done' });
    await expect(send('insertOne', [{ _id: 99 }], 'people')).rejects.toThrow();
  });
});
