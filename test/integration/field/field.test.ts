/**
 * The column actions against the throwaway replica set (M21's exit criteria): renaming a field of 3 documents is
 * recorded and undone, renaming it in 50,000 says it cannot be undone before it runs; a removal and a conversion keep
 * what they do not change; each changed document is published for redis-oplog. The app step of the columns' layout is
 * a stand-in that records what it was given: the main process's is tested on its own.
 */
import { createClient } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppAction } from '../../../src/runner/ports';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import type { Confirmation } from '../../../src/shared/state/runner';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';
import { live, localId, type Live } from '../undo/live';

const database = 'field_it';
const collection = 'people';
const target: Target = { kind: 'collection', connection: localId, database, collection };
const where = { connection: localId, database, collection };
let runner: Live;
let answers: (question: Question) => Answers | undefined = () => ({});
let confirming = true;
const confirmations: Confirmation[] = [];
const layouts: Json[] = [];
let subscriber: ReturnType<typeof createClient> | undefined;
const received: { channel: string; message: unknown }[] = [];

async function send(method: string, args: readonly Json[], more: Record<string, Json> = {}): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args, ...more } },
    AbortSignal.timeout(120_000),
  );
}

async function all(): Promise<readonly Json[]> {
  return (await send('find', [{}], { sort: { _id: 1 }, limit: 100 })) as readonly Json[];
}

async function count(filter: Json): Promise<number> {
  const reply = (await send('countDocuments', [filter])) as { readonly $numberInt?: string } | number;
  return typeof reply === 'number' ? reply : Number(reply.$numberInt);
}

function setUndo(enabled: boolean): void {
  runner.ports.state.dispatch({ slice: 'settings', type: 'changed', name: 'datardo.undo.enabled', value: enabled });
}

async function receivedAtLeast(wanted: number): Promise<void> {
  const until = Date.now() + 5000;
  while (received.length < wanted && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(async () => {
  runner = await live();
  Object.assign(runner.ports.dialogs, {
    ask: (_feature: unknown, question: Question) => Promise.resolve(answers(question)),
    confirm: (_feature: unknown, confirmation: Confirmation) => {
      confirmations.push(confirmation);
      return Promise.resolve(confirming);
    },
  });
  const actions = runner.ports.appActions as Map<string, AppAction>;
  actions.set('table.rename-in-layout', (args) => {
    layouts.push(args);
    return Promise.resolve();
  });
  const redis = testServers().redis;
  if (redis !== undefined) {
    subscriber = createClient({ url: redis });
    await subscriber.connect();
    await subscriber.pSubscribe(`${runner.prefix}*`, (message, channel) => {
      received.push({ channel: channel.slice(runner.prefix.length), message: JSON.parse(message) as unknown });
    });
  }
});

afterAll(async () => {
  if (subscriber !== undefined) {
    await subscriber.pUnsubscribe();
    subscriber.destroy();
  }
  await send('drop', []).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  answers = () => ({});
  confirming = true;
  confirmations.length = 0;
  layouts.length = 0;
  setUndo(true);
  await send('drop', []).catch(() => undefined);
  await send('insertMany', [
    [
      { _id: 1, kind: 'x', name: 'Ada', tmp: null },
      { _id: 2, kind: 'x', name: 'Bob', tmp: 1 },
      { _id: 3, kind: 'x', name: 'Cy', fullName: 'Cy Old' },
      { _id: 4, kind: 'y', name: 'Di' },
    ],
  ]);
  await runner.published();
  received.length = 0;
});

describe('field.rename', () => {
  const byKind = { ...where, field: 'name', filter: '{ kind: "x" }' };

  it('renames name in the 3 documents matching the filter, recorded, and undoing it gives back name', async () => {
    answers = () => ({ name: 'fullName' });
    expect(await runner.start('field.rename', target, byKind, 'table')).toEqual({ kind: 'done' });
    expect(confirmations[0]?.danger.text).toBe(
      'Rename name to fullName in 3 documents matching the filter?\n1 document already has fullName: its value is replaced by that of name.',
    );
    expect(confirmations[0]?.undoLine).toBe('It can be undone from the Undo history.');
    expect(await count({ fullName: { $exists: true } })).toBe(3);
    expect(await count({ name: 'Di' })).toBe(1);
    expect(layouts).toEqual([{ ...where, from: 'name', to: 'fullName' }]);
    expect(runner.state().undo.entries[0]?.title).toBe('Rename field name to fullName where { kind: "x" }');
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await all()).toEqual([
      { _id: { $numberInt: '1' }, kind: 'x', name: 'Ada', tmp: null },
      { _id: { $numberInt: '2' }, kind: 'x', name: 'Bob', tmp: { $numberInt: '1' } },
      { _id: { $numberInt: '3' }, kind: 'x', name: 'Cy', fullName: 'Cy Old' },
      { _id: { $numberInt: '4' }, kind: 'y', name: 'Di' },
    ]);
  });

  it('publishes an update of each renamed document with the two fields', async () => {
    if (subscriber === undefined) {
      return;
    }
    answers = () => ({ name: 'fullName' });
    await runner.start('field.rename', target, byKind, 'table');
    await runner.published();
    await receivedAtLeast(6);
    expect(received.filter((each) => each.channel === collection).map((each) => each.message)).toEqual(
      [1, 2, 3].map((id) => ({ e: 'u', d: { _id: id }, f: ['name', 'fullName'] })),
    );
  });

  it('writes nothing when the confirmation is closed', async () => {
    answers = () => ({ name: 'fullName' });
    confirming = false;
    await runner.start('field.rename', target, byKind, 'table');
    expect(await count({ fullName: { $exists: true } })).toBe(1);
  });

  it('says that 50,000 documents cannot be undone and asks the name of the collection, before it runs', async () => {
    await send('drop', []);
    const many = Array.from({ length: 50_000 }, (_, index) => ({ _id: index, name: `n${String(index)}` }));
    await send('insertMany', [many], { timeLimitMs: 120_000 });
    answers = () => ({ name: 'fullName' });
    const entries = runner.state().undo.entries.length;
    expect(await runner.start('field.rename', target, { ...where, field: 'name', filter: '' }, 'table')).toEqual({
      kind: 'done',
    });
    expect(confirmations[0]?.danger).toMatchObject({ kind: 'destructive', name: 'people', button: 'Rename in all' });
    expect(confirmations[0]?.undoLine).toBe(
      "This can't be undone: the undo history keeps operations of up to 10,000 documents.",
    );
    expect(await count({ fullName: { $exists: true } })).toBe(50_000);
    expect(runner.state().undo.entries.length).toBe(entries);
  }, 120_000);

  it('with the undo history off and a filter, confirms with Rename and says it cannot be undone', async () => {
    setUndo(false);
    answers = () => ({ name: 'fullName' });
    await runner.start('field.rename', target, byKind, 'table');
    expect(confirmations[0]?.danger).toMatchObject({ kind: 'confirm', button: 'Rename' });
    expect(confirmations[0]?.undoLine).toBe("The undo history is off for this connection: this can't be undone.");
  });
});

describe('field.remove', () => {
  it('removes tmp from every matching document, also where it is null, and undoing puts the values back', async () => {
    expect(await runner.start('field.remove', target, { ...where, field: 'tmp', filter: '' }, 'table')).toEqual({
      kind: 'done',
    });
    expect(await count({ tmp: { $exists: true } })).toBe(0);
    expect(layouts).toEqual([{ ...where, from: 'tmp' }]);
    expect(runner.state().undo.entries[0]?.title).toBe('Remove field tmp');
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await count({ tmp: { $exists: true } })).toBe(2);
  });

  it('removes sku from every element of items, and leaves out a document where items is not an array', async () => {
    await send('insertMany', [
      [
        { _id: 10, items: [{ sku: 'a', q: 1 }, { sku: 'b' }] },
        { _id: 11, items: { sku: 'c' } },
      ],
    ]);
    const args = { ...where, field: 'items.sku', array: 'items', filter: '' };
    expect(await runner.start('field.remove', target, args, 'table')).toEqual({ kind: 'done' });
    expect(confirmations[0]?.steps[0]?.text).toContain('{ $unset: { "items.$[].sku": "" } }');
    expect(await send('find', [{ _id: { $in: [10, 11] } }], { sort: { _id: 1 } })).toEqual([
      { _id: { $numberInt: '10' }, items: [{ q: { $numberInt: '1' } }, {}] },
      { _id: { $numberInt: '11' }, items: { sku: 'c' } },
    ]);
  });
});

describe('field.convert-type', () => {
  beforeEach(async () => {
    await send('drop', []);
    await send('insertMany', [
      [
        { _id: 1, v: '42' },
        { _id: 2, v: 7.9 },
        { _id: 3, v: 'not a number' },
        { _id: 4, v: null },
        { _id: 5, v: [1, 2] },
        { _id: 6, v: { $numberInt: '5' } },
      ],
    ]);
  });

  it('lists the current types, converts 3 values to int, keeps the others, and says 1 could not be converted', async () => {
    let listed = '';
    answers = (question) => {
      listed = question.fields[0]?.label ?? '';
      return { type: 'int' };
    };
    expect(await runner.start('field.convert-type', target, { ...where, field: 'v', filter: '' }, 'table')).toEqual({
      kind: 'done',
    });
    // The types counted alike come in no given order.
    expect(listed).toMatch(/^Type to convert the values to · now: string 2 · /u);
    expect(listed.split(' · ').slice(2).sort()).toEqual(['array 1', 'double 1', 'int 1', 'null 1']);
    expect(confirmations[0]?.danger.text).toContain('Convert v to int in 3 documents of people?');
    expect(await all()).toEqual([
      { _id: { $numberInt: '1' }, v: { $numberInt: '42' } },
      { _id: { $numberInt: '2' }, v: { $numberInt: '7' } },
      { _id: { $numberInt: '3' }, v: 'not a number' },
      { _id: { $numberInt: '4' }, v: null },
      { _id: { $numberInt: '5' }, v: [{ $numberInt: '1' }, { $numberInt: '2' }] },
      { _id: { $numberInt: '6' }, v: { $numberInt: '5' } },
    ]);
    const texts = runner.state().runner.notifications.map((each) => each.text);
    expect(texts).toContain("1 value couldn't be converted and kept its type.");
    expect(runner.state().undo.entries[0]?.title).toBe('Convert field v to int');
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await send('find', [{ _id: 2 }])).toEqual([{ _id: { $numberInt: '2' }, v: { $numberDouble: '7.9' } }]);
  });

  it('writes nothing when every value already has the type', async () => {
    await send('deleteMany', [{ _id: { $in: [1, 2, 3] } }]);
    answers = () => ({ type: 'int' });
    expect(await runner.start('field.convert-type', target, { ...where, field: 'v', filter: '' }, 'table')).toEqual({
      kind: 'refused',
      code: 'field.convert-type/nothing-to-convert',
      message: 'No value of v of people needs converting to int: null, missing values and arrays are left as they are.',
    });
  });

  it('converts to long, decimal, string, date and objectId with their types', async () => {
    await send('drop', []);
    await send('insertMany', [
      [
        { _id: 'l', v: '9007199254740993' },
        { _id: 'd', v: '0.10' },
        { _id: 's', v: { $numberInt: '5' } },
        { _id: 't', v: '2024-03-15' },
        { _id: 'o', v: '65f1c0de9a7b4e00012f3a2c' },
      ],
    ]);
    const convert = async (id: string, type: string): Promise<Json> => {
      answers = () => ({ type });
      await runner.start('field.convert-type', target, { ...where, field: 'v', filter: `{ _id: "${id}" }` }, 'table');
      return ((await send('find', [{ _id: id }])) as readonly { readonly v: Json }[])[0]?.v ?? null;
    };
    expect(await convert('l', 'long')).toEqual({ $numberLong: '9007199254740993' });
    expect(await convert('d', 'decimal')).toEqual({ $numberDecimal: '0.10' });
    expect(await convert('s', 'string')).toBe('5');
    expect(await convert('t', 'date')).toEqual({ $date: { $numberLong: '1710460800000' } });
    expect(await convert('o', 'objectId')).toEqual({ $oid: '65f1c0de9a7b4e00012f3a2c' });
  });
});
