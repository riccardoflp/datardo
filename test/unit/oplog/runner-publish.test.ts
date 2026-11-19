/**
 * The runner after the steps of a plan that publishes (`runner.run`, step 5): the matched `_id`s read before a write by
 * filter, the events of each write sent to the linked Redis connection in the background (`oplog.publish`), and the
 * warning when they cannot be sent, at most once every 30 seconds and without secrets (`oplog.publish-error`). The
 * server is the fake one of the undo history's tests.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { runtimeOf } from '../../../src/runner/runtime';
import type { OplogClients } from '../../../src/runner/ports';
import { appStateWith, cacheConnection, connection, localConnection, undoWith } from '../undo/harness';
import { onOrders, ordersTarget, world, type World } from '../undo/world';

let opened: World | undefined;

afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

const linked = connection(localConnection.id, 'Local', { publishesTo: cacheConnection.id });

async function open(publish?: OplogClients['send'], local = linked): Promise<World> {
  opened = await world({
    state: appStateWith(undoWith([]), [local, cacheConnection]),
    ...(publish === undefined ? {} : { publish }),
  });
  return opened;
}

async function sent(tested: World): Promise<void> {
  await runtimeOf(tested.ports).publishing.idle();
}

describe('oplog.publish', () => {
  it('publishes an update of three documents to the collection’s and to each document’s channel', async () => {
    const tested = await open();
    await tested.start(
      'test.update-documents',
      ordersTarget,
      onOrders({ ids: ['o1', 'o2', 'o3'], set: { status: 'paid' } }),
    );
    await sent(tested);
    expect(tested.published).toEqual(
      ['o1', 'o2', 'o3'].flatMap((id) => {
        const message = JSON.stringify({ e: 'u', d: { _id: id }, f: ['status'] });
        return [
          { channel: 'orders', message },
          { channel: `orders::${id}`, message },
        ];
      }),
    );
  });

  it('publishes a delete by filter for the documents it matched before', async () => {
    const tested = await open();
    await tested.start('test.delete-documents', ordersTarget, onOrders({ filter: { _id: 'o2' } }));
    await sent(tested);
    const message = JSON.stringify({ e: 'r', d: { _id: 'o2' } });
    expect(tested.published).toEqual([
      { channel: 'orders', message },
      { channel: 'orders::o2', message },
    ]);
  });

  it('publishes the undo of a write like any other write', async () => {
    const tested = await open();
    await tested.start('test.insert-documents', ordersTarget, onOrders({ documents: [{ _id: 'o9', status: 'new' }] }));
    await sent(tested);
    tested.published.splice(0);
    const [entry] = tested.state().undo.entries;
    await tested.start('undo.last', { kind: 'app' }, null);
    await sent(tested);
    expect(entry).toBeDefined();
    expect(tested.published.map((each) => each.channel)).toEqual(['orders', 'orders::o9']);
    expect(tested.published[0]?.message).toBe(JSON.stringify({ e: 'r', d: { _id: 'o9' } }));
  });

  it('publishes nothing for a connection linked to no Redis connection', async () => {
    const tested = await open(undefined, connection(localConnection.id, 'Local'));
    await tested.start('test.update-documents', ordersTarget, onOrders({ ids: ['o1'], set: { status: 'paid' } }));
    await sent(tested);
    expect(tested.published).toEqual([]);
  });
});

describe('oplog.publish-error', () => {
  it('warns once in 30 seconds, without the secrets of the linked connection, and the write stays done', async () => {
    const failing: OplogClients['send'] = () => Promise.reject(new Error('NOAUTH for redis://u:s3cret@cache:6379'));
    const tested = await open(failing);
    const update = onOrders({ ids: ['o1'], set: { status: 'paid' } });
    await tested.start('test.update-documents', ordersTarget, update);
    await sent(tested);
    await tested.start('test.update-documents', ordersTarget, update);
    await sent(tested);
    const warnings = tested.state().runner.notifications.filter((each) => each.level === 'warning');
    expect(warnings.map((each) => each.text)).toEqual([
      "The change was saved, but couldn't be published to Redis for redis-oplog (Local): NOAUTH for redis://cache:6379",
    ]);
    expect(tested.state().oplog.lastErrors[localConnection.id]?.message).toBe('NOAUTH for redis://cache:6379');
    expect(tested.data.orders.get('"o1"')?.['status']).toBe('paid');
  });

  it('warns when the linked connection is missing', async () => {
    const tested = await open(undefined, connection(localConnection.id, 'Local', { publishesTo: 'c-gone' as never }));
    await tested.start('test.update-documents', ordersTarget, onOrders({ ids: ['o1'], set: { status: 'paid' } }));
    await sent(tested);
    expect(tested.state().runner.notifications.map((each) => each.text)).toContain(
      "The change was saved, but couldn't be published to Redis for redis-oplog (Local): The linked connection is missing: choose it again in the connection.",
    );
  });
});
