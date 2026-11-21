/**
 * The writes of the document area against the throwaway replica set (M12's exit criteria): a document of every BSON
 * type saved from its document tab and edited in a cell keeps every other type, and a value the driver would change
 * is not written at all (QA2); a read-only connection and a
 * view send nothing (QA1); an Update many of 50,000 documents says it cannot be undone before it runs (QA4); each
 * write is in the undo history and undoing it puts the documents back.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { documentText } from '../../../src/features/document/write/values';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import type { Confirmation } from '../../../src/shared/state/runner';
import type { Target } from '../../../src/shared/target';
import { live, localId, type Live } from '../undo/live';

const database = 'document_it';
const collection = 'orders';
const target: Target = { kind: 'collection', connection: localId, database, collection };
const where = { connection: localId, database, collection };
let runner: Live;
let answers: (question: Question) => Answers | undefined = () => ({});
const confirmations: Confirmation[] = [];

/** A document of every type the promises keep (R5.5). */
const typed = {
  _id: { $numberInt: '7' },
  int: { $numberInt: '3' },
  long: { $numberLong: '9007199254740993' },
  double: { $numberDouble: '1.5' },
  decimal: { $numberDecimal: '0.10' },
  bytes: { $binary: { base64: '/wBB', subType: '00' } },
  uuid: { $binary: { base64: 'q83vEjRWeJCrze8SNFZ4kA==', subType: '04' } },
  when: { $date: { $numberLong: '1700000000000' } },
  stamp: { $timestamp: { t: 1700000000, i: 1 } },
  pattern: { $regularExpression: { pattern: '^a', options: 'i' } },
  id: { $oid: '65f1c0de9a7b4e00012f3a2c' },
  low: { $minKey: 1 },
  high: { $maxKey: 1 },
  nothing: null,
  yes: true,
  nested: { list: [{ $numberInt: '1' }, 'two', { $numberLong: '3' }] },
  status: 'new',
} as const;

async function send(method: string, args: readonly Json[], more: Record<string, Json> = {}): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args, ...more } },
    AbortSignal.timeout(60_000),
  );
}

async function found(id: Json): Promise<unknown> {
  return ((await send('find', [{ _id: id }])) as readonly unknown[])[0];
}

async function count(filter: Json): Promise<number> {
  const reply = (await send('countDocuments', [filter])) as { readonly $numberInt?: string } | number;
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
});

afterAll(async () => {
  await send('drop', []).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  answers = () => ({});
  confirmations.length = 0;
  setReadOnly(false);
  await send('deleteMany', [{}]);
  await send('insertMany', [[typed]]);
});

describe('document.save', () => {
  it('saves a change of status from the tab and keeps every other type, then undoing puts the document back', async () => {
    const text = documentText(typed).replace('status: "new"', 'status: "paid"');
    const result = await runner.start('document.save', target, { ...where, id: typed._id, text, original: typed });
    expect(result).toEqual({ kind: 'done' });
    expect(await found(typed._id)).toEqual({ ...typed, status: 'paid' });
    expect(runner.state().undo.entries[0]?.title).toBe('Edit document 7');
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await found(typed._id)).toEqual(typed);
  });

  it('asks Overwrite when another client changed the document after the tab loaded it', async () => {
    await send('updateOne', [{ _id: typed._id }, { $set: { status: 'other' } }]);
    const text = documentText(typed).replace('status: "new"', 'status: "paid"');
    await runner.start('document.save', target, { ...where, id: typed._id, text, original: typed });
    expect(confirmations.map((each) => each.danger.button)).toEqual(['Overwrite']);
  });

  it('is refused on a read-only connection, and nothing is sent', async () => {
    setReadOnly(true);
    const text = documentText(typed).replace('status: "new"', 'status: "paid"');
    const result = await runner.start('document.save', target, { ...where, id: typed._id, text, original: typed });
    expect(result).toMatchObject({ kind: 'refused', code: 'document.save/read-only' });
    expect(await found(typed._id)).toEqual(typed);
  });

  it('sends nothing for a date beyond the range of JavaScript, which the driver cannot hold', async () => {
    const far = { $toDate: { $numberLong: '253402300800000000' } };
    await send('updateOne', [{ _id: typed._id }, [{ $set: { far } }]]);
    const stored = await found(typed._id);
    expect(stored).toMatchObject({ far: { $date: { $numberLong: '253402300800000000' } } });
    const text = documentText(stored as Json).replace('status: "new"', 'status: "paid"');
    const result = await runner.start('document.save', target, {
      ...where,
      id: typed._id,
      text,
      original: stored as Json,
    });
    expect(result).toMatchObject({ kind: 'failed' });
    expect(result.kind === 'failed' ? result.message : '').toContain('a date beyond the range of JavaScript at far');
    expect(await found(typed._id)).toEqual(stored);
  });
});

describe('document.inline-edit', () => {
  it('sets one value and keeps the Int32 an Int32, and the other fields as they were', async () => {
    const args = { ...where, id: typed._id, path: 'int', value: typed.int, text: '5' };
    expect(await runner.start('document.inline-edit', target, args, 'table')).toEqual({ kind: 'done' });
    expect(await found(typed._id)).toEqual({ ...typed, int: { $numberInt: '5' } });
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await found(typed._id)).toEqual(typed);
  });

  it('is refused on a view, and nothing is sent', async () => {
    const args = { ...where, id: typed._id, path: 'int', value: typed.int, text: '5', view: true };
    expect(await runner.start('document.inline-edit', target, args, 'table')).toMatchObject({
      kind: 'refused',
      code: 'document.inline-edit/view',
    });
    expect(await found(typed._id)).toEqual(typed);
  });
});

describe('document.insert', () => {
  it('inserts the documents of the dialog with their types, and undoing deletes them', async () => {
    answers = () => ({ documents: '[ { _id: 1, l: NumberLong("9007199254740993") }, { _id: 2, d: Double(5) } ]' });
    expect(await runner.start('document.insert', target, where)).toEqual({ kind: 'done' });
    expect(await found({ $numberInt: '1' })).toEqual({
      _id: { $numberInt: '1' },
      l: { $numberLong: '9007199254740993' },
    });
    expect(await found({ $numberInt: '2' })).toEqual({ _id: { $numberInt: '2' }, d: { $numberDouble: '5.0' } });
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await count({})).toBe(1);
  });

  it('keeps the _id the server gave to a document without one, so that undoing deletes it', async () => {
    answers = () => ({ documents: '{ name: "Ada" }' });
    expect(await runner.start('document.insert', target, where)).toEqual({ kind: 'done' });
    expect(await count({ name: 'Ada' })).toBe(1);
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await count({ name: 'Ada' })).toBe(0);
  });
});

describe('document.duplicate', () => {
  it('inserts a copy with a new _id and every type of the original, and undoing deletes the copy', async () => {
    answers = (question) => {
      const [field] = question.fields;
      return { documents: field?.kind === 'text' ? (field.default ?? '') : '' };
    };
    expect(await runner.start('document.duplicate', target, { ...where, id: typed._id })).toEqual({ kind: 'done' });
    const all = (await send('find', [{}], { sort: { _id: 1 } })) as readonly Record<string, Json>[];
    const copy = all.find((each) => JSON.stringify(each['_id']) !== JSON.stringify(typed._id));
    const { _id: _copyId, ...copied } = copy ?? {};
    const { _id: _typedId, ...original } = typed;
    expect(copied).toEqual(original);
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await count({})).toBe(1);
  });
});

describe('document.delete', () => {
  it('deletes the document after its confirmation, and undoing inserts it again with every type', async () => {
    expect(await runner.start('document.delete', target, { ...where, id: typed._id })).toEqual({ kind: 'done' });
    expect(confirmations.map((each) => each.danger.button)).toEqual(['Delete']);
    expect(await found(typed._id)).toBeUndefined();
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await found(typed._id)).toEqual(typed);
  });

  it('is refused on a read-only connection before anything is asked or sent', async () => {
    setReadOnly(true);
    expect(await runner.start('document.delete', target, { ...where, id: typed._id })).toMatchObject({
      kind: 'refused',
      code: 'document.delete/read-only',
    });
    expect(confirmations).toEqual([]);
    expect(await found(typed._id)).toEqual(typed);
  });
});

describe('document.update-many', () => {
  it('says before updating 50,000 documents that the update cannot be undone, and records nothing', async () => {
    const many = Array.from({ length: 50_000 }, (_, index) => ({ _id: { $numberInt: String(index + 100) }, n: 1 }));
    await send('insertMany', [many]);
    const before = runner.state().undo.entries.length;
    answers = () => ({ update: '{ $set: { n: 2 } }' });
    const result = await runner.start('document.update-many', target, { ...where, filter: '{ n: 1 }' });
    expect(result).toEqual({ kind: 'done' });
    expect(confirmations[0]?.undoLine).toBe(
      "This can't be undone: the undo history keeps operations of up to 10,000 documents.",
    );
    expect(await count({ n: 2 })).toBe(50_000);
    expect(runner.state().undo.entries).toHaveLength(before);
  }, 120_000);
});

describe('document.delete-many', () => {
  it('deletes the documents of the filter after its confirmation, and undoing puts them back', async () => {
    await send('insertMany', [
      [
        { _id: { $numberInt: '20' }, status: 'draft' },
        { _id: { $numberInt: '21' }, status: 'draft' },
      ],
    ]);
    expect(await runner.start('document.delete-many', target, { ...where, filter: '{ status: "draft" }' })).toEqual({
      kind: 'done',
    });
    expect(await count({ status: 'draft' })).toBe(0);
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await count({ status: 'draft' })).toBe(2);
  });
});
