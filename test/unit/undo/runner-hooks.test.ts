/**
 * The runner around a plan that names what the undo history keeps (`runner.run`, steps 3 and 5): the record before and
 * after the steps (`undo.record`), the line of the confirmation (`undo.note`), **Undo** in the notification
 * (`undo.notification`), an undo and its own record (`undo.revert`, `undo.last`), the limits after each save
 * (`undo.limits`), and a connection that does not keep its history (`undo.per-connection`). The server is a fake one
 * that keeps its documents and keys in memory.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readOperationFile } from '../../../src/storage/undo';
import { entryTarget } from '../../../src/features/undo/types';
import type { UndoEntry } from '../../../src/shared/state/undo';
import { appStateWith, cacheConnection, connection, localConnection, settingsWith, undoWith } from './harness';
import { onOrders, ordersTarget, world, type World } from './world';

let opened: World | undefined;

afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

async function open(options: Parameters<typeof world>[0] = {}): Promise<World> {
  opened = await world(options);
  return opened;
}

function newest(tested: World): UndoEntry {
  const [first] = tested.state().undo.entries;
  if (first === undefined) {
    throw new Error('Nothing was recorded.');
  }
  return first;
}

function lastNotification(tested: World) {
  return tested.state().runner.notifications.at(-1);
}

const paid = onOrders({ ids: ['o1', 'o2', 'o3'], set: { status: 'paid' } });

describe('undo.record', () => {
  it('records a plan that updates three documents before it runs: its file, then its entry with its size', async () => {
    const tested = await open();
    const result = await tested.start('test.update-documents', ordersTarget, paid);
    expect(result).toEqual({ kind: 'done' });
    const entry = newest(tested);
    expect(entry).toMatchObject({
      title: 'Update 3 documents',
      engine: 'mongodb',
      database: 'shop',
      collection: 'orders',
      inserted: 0,
      updated: 3,
      deleted: 0,
    });
    expect(entry.size).toBeGreaterThan(0);
    const file = await readOperationFile(tested.folder, entry.id);
    expect(
      file.kind === 'read' ? (file.content['docs'] as readonly { before: unknown }[]).map((d) => d.before) : [],
    ).toEqual([
      { _id: 'o1', status: 'new', n: { $numberInt: '1' } },
      { _id: 'o2', status: 'new', n: { $numberInt: '2' } },
      { _id: 'o3', status: 'new', n: { $numberInt: '3' } },
    ]);
  });

  it('asks before a write by filter found too large to keep; answered, it runs without undo, closed, it writes nothing', async () => {
    const small = appStateWith();
    const state = { ...small, settings: settingsWith({ 'datardo.undo.maxDocumentsPerOperation': 2 }, small.settings) };
    const byStatus = onOrders({ filter: { status: 'new' } });
    const answered = await open({ state, answers: {} });
    expect(await answered.start('test.delete-documents', ordersTarget, byStatus)).toEqual({ kind: 'done' });
    expect(answered.questions).toMatchObject([
      { title: 'Continue without the possibility to undo?', button: 'Continue without undo', fields: [] },
    ]);
    expect(answered.state().undo.entries).toEqual([]);
    expect(answered.data.orders.size).toBe(0);
    await answered.close();
    const closed = await open({ state, answers: undefined });
    expect(await closed.start('test.delete-documents', ordersTarget, byStatus)).toEqual({ kind: 'cancelled' });
    expect(closed.data.orders.size).toBe(3);
  });

  it('says in the confirmation of a write announced too large that it is not recorded, and asks nothing', async () => {
    const small = appStateWith();
    const state = { ...small, settings: settingsWith({ 'datardo.undo.maxDocumentsPerOperation': 2 }, small.settings) };
    const tested = await open({ state });
    expect(await tested.start('test.update-documents', ordersTarget, paid)).toEqual({ kind: 'done' });
    expect(tested.questions).toEqual([]);
    expect(tested.state().undo.entries).toEqual([]);
    expect(tested.confirmations[0]?.undoLine).toBe(
      "This can't be undone: the undo history keeps operations of up to 2 documents.",
    );
  });

  it('warns when the operation cannot be saved, and the write stays done', async () => {
    const tested = await open({ indexFails: true });
    expect(await tested.start('test.update-documents', ordersTarget, paid)).toEqual({ kind: 'done' });
    expect(tested.data.orders.get('"o2"')?.['status']).toBe('paid');
    expect(tested.state().runner.notifications.map((each) => each.text)).toContain(
      "The change was made, but couldn't be saved in the undo history: EACCES: permission denied",
    );
  });

  it('records keys deleted with their dump and expiry, and the undo restores them', async () => {
    const tested = await open();
    const args = { connection: cacheConnection.id, database: 0, keys: ['orders:2'] };
    await tested.start(
      'test.write-keys',
      { kind: 'redis-database', connection: cacheConnection.id, database: 0 },
      args,
    );
    const entry = newest(tested);
    expect(entry).toMatchObject({ engine: 'redis', database: 0, deleted: 1 });
    expect(tested.data.keys.has('orders:2')).toBe(false);
    await tested.start('undo.revert', entryTarget(entry), { operation: entry.id });
    expect(tested.data.keys.get('orders:2')).toEqual({ value: 'b', pttl: 90_000 });
  });
});

describe('undo.note', () => {
  it('says in the confirmation that the write can be undone', async () => {
    const tested = await open();
    await tested.start('test.update-documents', ordersTarget, paid);
    expect(tested.confirmations[0]?.undoLine).toBe('It can be undone from the Undo history.');
  });
});

describe('undo.notification', () => {
  it('puts Undo first in the notification of a recorded write', async () => {
    const tested = await open();
    await tested.start('test.update-documents', ordersTarget, paid);
    const entry = newest(tested);
    expect(lastNotification(tested)?.actions?.[0]).toMatchObject({
      label: 'Undo',
      element: 'undo.revert@notification',
      feature: 'undo.revert',
      args: { operation: entry.id },
    });
    expect(lastNotification(tested)?.element).toBe('undo.notification@notification');
  });
});

describe('undo.revert', () => {
  it('puts the documents back type by type, marks the operation undone and records the undo', async () => {
    const tested = await open();
    await tested.start('test.update-documents', ordersTarget, paid);
    const entry = newest(tested);
    expect(await tested.start('undo.revert', entryTarget(entry), { operation: entry.id })).toEqual({ kind: 'done' });
    expect([...tested.data.orders.values()]).toEqual([
      { _id: 'o1', status: 'new', n: { $numberInt: '1' } },
      { _id: 'o2', status: 'new', n: { $numberInt: '2' } },
      { _id: 'o3', status: 'new', n: { $numberInt: '3' } },
    ]);
    const [undo, done] = tested.state().undo.entries;
    expect(done).toMatchObject({ id: entry.id, size: 0 });
    expect(done?.undone).toBeDefined();
    expect(undo).toMatchObject({ title: 'Undo: Update 3 documents', undoOf: entry.id, updated: 3 });
    expect((await readOperationFile(tested.folder, entry.id)).kind).toBe('missing');
  });

  it('shows its result in the page’s message line when started from the page', async () => {
    const tested = await open();
    await tested.start('test.update-documents', ordersTarget, paid);
    const entry = newest(tested);
    await tested.start('undo.revert', entryTarget(entry), { operation: entry.id }, 'table');
    expect(tested.state().undo.message).toEqual({
      text: 'Undid "Update 3 documents": 3 documents in Local › shop.orders.',
      failed: false,
    });
    expect(tested.state().undo.undoing).toEqual([]);
  });
});

describe('undo.last', () => {
  it('undoes the newest operation, then the undo itself (the redo)', async () => {
    const tested = await open();
    await tested.start('test.update-documents', ordersTarget, paid);
    await tested.start('undo.last', { kind: 'app' }, null);
    expect(tested.data.orders.get('"o1"')?.['status']).toBe('new');
    await tested.start('undo.last', { kind: 'app' }, null);
    expect(tested.data.orders.get('"o1"')?.['status']).toBe('paid');
    expect(newest(tested).title).toBe('Redo: Update 3 documents');
  });
});

describe('undo.limits', () => {
  it('runs after each save: with datardo.undo.maxOperations at 1 the older operation is dropped', async () => {
    const base = appStateWith();
    const state = { ...base, settings: settingsWith({ 'datardo.undo.maxOperations': 1 }, base.settings) };
    const tested = await open({ state });
    await tested.start('test.update-documents', ordersTarget, paid);
    const first = newest(tested);
    await tested.start('test.update-documents', ordersTarget, onOrders({ ids: ['o1'], set: { status: 'sent' } }));
    expect(tested.state().undo.entries.map((each) => each.title)).toEqual(['Update 1 documents']);
    expect((await readOperationFile(tested.folder, first.id)).kind).toBe('missing');
  });
});

describe('undo.per-connection', () => {
  it('records nothing through a connection that does not keep its undo history, and its confirmation says so', async () => {
    const off = connection(localConnection.id, 'Local', { keepsUndo: false });
    const tested = await open({ state: appStateWith(undoWith([]), [off, cacheConnection]) });
    await tested.start('test.update-documents', ordersTarget, paid);
    expect(tested.state().undo.entries).toEqual([]);
    expect(tested.confirmations[0]?.undoLine).toBe(
      "The undo history is off for this connection: this can't be undone.",
    );
    expect(lastNotification(tested)?.actions ?? []).toEqual([]);
  });
});
