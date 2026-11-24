import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/backup/restore';
import { hasSameTtl, indexesRead, refusedDatabase } from '../../../src/features/backup/restoring/guards';
import type { Answers } from '../../../src/shared/feature';
import type { Target } from '../../../src/shared/target';
import { contextOn, local, next, planOf, stateWith } from '../transfer/harness';

const shop: Target = { kind: 'database', connection: local.id, database: 'shop' };
const scratch: Target = { kind: 'database', connection: local.id, database: 'scratch' };
const onLocal: Target = { kind: 'connection', connection: local.id };

function database(name: string, collections: readonly string[] = ['things']) {
  return { name, collections: collections.map((each) => ({ name: each, meta: { type: 'collection' }, size: 0 })) };
}

function fromArchive(...databases: ReturnType<typeof database>[]): Answers {
  return { kind: 'archive', path: 'D:\\b\\dump.agz', listing: { databases } };
}

function restore(target: Target, answers: Answers) {
  return plan(contextOn(target, 'backup.restore', stateWith()), answers);
}

const ttlMeta = {
  indexes: [
    { v: { $numberInt: '2' }, key: { _id: { $numberInt: '1' } }, name: '_id_' },
    {
      v: { $numberInt: '2' },
      key: { at: { $numberInt: '1' } },
      name: 'at_ttl',
      expireAfterSeconds: { $numberInt: '60' },
    },
    { v: { $numberInt: '2' }, key: { sku: { $numberInt: '1' } }, name: 'sku_1' },
  ],
  collectionName: 'orders',
  type: 'collection',
};

const withTtl: Answers = {
  kind: 'archive',
  path: 'D:\\b\\shop.agz',
  listing: { databases: [{ name: 'shop', collections: [{ name: 'orders', meta: ttlMeta, size: 0 }] }] },
};

describe('backup.restore', () => {
  it('says why a database of a backup is not restored under its name', () => {
    expect(['admin', 'Config', 'LOCAL', 'a.b', 'shop'].map(refusedDatabase)).toEqual([
      'a system database',
      'a system database',
      'a system database',
      'not a valid database name',
      undefined,
    ]);
  });

  it('on a connection offers logs and shop of admin, logs and shop, and says admin is not restored', () => {
    const answers = fromArchive(database('admin'), database('logs'), database('shop'));
    const asked = restore(onLocal, answers);
    expect(asked.kind === 'ask' && asked.question).toMatchObject({
      text: 'Not offered: admin (a system database)',
      fields: [{ key: 'databases', choices: [{ value: 'logs' }, { value: 'shop' }], default: ['logs', 'shop'] }],
    });
    const chosen = { ...answers, databases: ['logs', 'shop'], existing: { logs: [], shop: [] } };
    const planned = planOf(restore(onLocal, chosen));
    expect(planned.danger.kind !== 'none' && planned.danger.text).toContain(
      '\nNot restored: admin (a system database).\n',
    );
    expect(planned.after).toContainEqual({
      kind: 'notify',
      level: 'warning',
      text: 'Not restored: admin (a system database)',
    });
  });

  it('with admin and shop does not ask which: it asks the database name with shop', () => {
    const answers = fromArchive(database('admin'), database('shop'));
    const asked = restore(onLocal, answers);
    expect(asked.kind === 'ask' && asked.question).toMatchObject({
      text: 'Database on Local to restore shop into',
      fields: [{ key: 'database-name', default: 'shop' }],
    });
    const planned = planOf(restore(onLocal, { ...answers, 'database-name': 'shop', existing: { shop: [] } }));
    expect(planned.after).toContainEqual(expect.objectContaining({ text: 'Not restored: admin (a system database)' }));
  });

  it('refuses a backup of Config and local only, and asks nothing more', () => {
    expect(restore(onLocal, fromArchive(database('Config'), database('local')))).toEqual({
      kind: 'refuse',
      code: 'backup.restore/system-databases',
      message:
        'Nothing of dump.agz is restored under the names it gives: Config (a system database), local (a system database). ' +
        'To restore one of them, use Restore from backup… on the database to restore it into.',
    });
  });

  it('with the only database admin, asks the name with an empty field and restores nothing until one is typed', () => {
    const answers = fromArchive(database('admin'));
    const asked = restore(onLocal, answers);
    expect(asked.kind === 'ask' && asked.question).toMatchObject({
      text: "Database on Local to restore admin into (its own name isn't proposed: a system database)",
      fields: [{ key: 'database-name', default: '', rules: [{ kind: 'not-empty' }] }],
    });
    expect(next(restore(onLocal, { ...answers, 'database-name': '  ' }))).toBe('database-name');
    expect(restore(onLocal, { ...answers, 'database-name': 'restored' })).toMatchObject({
      need: { key: 'existing', args: { databases: ['restored'] } },
    });
  });

  it('on the database scratch restores the admin database of a backup into scratch', () => {
    const answers = { ...fromArchive(database('admin')), existing: { scratch: [] } };
    const planned = planOf(restore(scratch, answers));
    expect(planned.steps[0]?.text).toBe('db.createCollection("things", {})');
    expect(planned.after).toEqual([{ kind: 'refresh', connection: local.id }]);
  });

  it('with Add documents keeps a TTL index of the backup off an existing collection, and says so', () => {
    const answers = { ...withTtl, existing: { shop: [{ name: 'orders', kind: 'collection' }] }, mode: 'add' };
    expect(restore(shop, answers)).toEqual({
      kind: 'read',
      need: {
        key: 'own-indexes',
        read: 'backup.restore:indexes',
        args: { connection: local.id, namespaces: [{ database: 'shop', collection: 'orders' }] },
      },
    });
    const planned = planOf(restore(shop, { ...answers, 'own-indexes': { 'shop.orders': [] } }));
    expect(planned.steps.map((step) => step.text)).toEqual([
      'db.orders.insertMany([<documents of orders>], { ordered: false, bypassDocumentValidation: true })',
      'db.orders.createIndexes([{ key: { sku: 1 }, name: "sku_1" }])',
    ]);
    expect(planned.after).toContainEqual({
      kind: 'notify',
      level: 'warning',
      text:
        'Index not created — orders.at_ttl: a TTL index (expireAfterSeconds) would make the server delete documents ' +
        "that were already in the collection; create it from the Indexes section if it's wanted",
    });
  });

  it('creates the TTL index on a collection it creates, after a drop, or that has the same TTL index', () => {
    const ttlStep = 'db.orders.createIndexes([{ key: { at: 1 }, name: "at_ttl", expireAfterSeconds: 60 }])';
    const created = planOf(restore(shop, { ...withTtl, existing: { shop: [] } }));
    expect(created.steps.map((step) => step.text)).toContain(ttlStep);
    const existing = { shop: [{ name: 'orders', kind: 'collection' }] };
    const dropped = planOf(restore(shop, { ...withTtl, existing, mode: 'drop' }));
    expect(dropped.steps.map((step) => step.text)).toContain(ttlStep);
    const same = { key: { at: 1 }, name: 'expires', expireAfterSeconds: 60 };
    const kept = planOf(restore(shop, { ...withTtl, existing, mode: 'add', 'own-indexes': { 'shop.orders': [same] } }));
    expect(kept.steps.map((step) => step.text)).toContain(ttlStep);
    expect(kept.after).toEqual([{ kind: 'refresh', connection: local.id }]);
  });

  it('tells the same TTL index by its key and delay, whatever the type of the numbers', () => {
    const index = { key: { at: { $numberInt: '1' } }, expireAfterSeconds: { $numberInt: '60' } };
    expect(hasSameTtl(index, [{ key: { at: { $numberDouble: '1.0' } }, expireAfterSeconds: 60 }])).toBe(true);
    expect(hasSameTtl(index, [{ key: { at: 1 }, expireAfterSeconds: 61 }])).toBe(false);
    expect(hasSameTtl(index, [{ key: { other: 1 }, expireAfterSeconds: 60 }])).toBe(false);
    expect(hasSameTtl(index, [{ key: { at: 1 } }])).toBe(false);
  });

  it('reads the indexes of the existing collections with listIndexes', () => {
    const args = { connection: local.id, namespaces: [{ database: 'shop', collection: 'orders' }] };
    const read = indexesRead.request(contextOn(shop, 'backup.restore', stateWith()), args);
    expect(read).toMatchObject({
      kind: 'engine',
      requests: [{ request: { database: 'shop', collection: 'orders', method: 'listIndexes' } }],
    });
    expect(indexesRead.parse([[{ name: '_id_' }]], args)).toEqual({ 'shop.orders': [{ name: '_id_' }] });
  });

  it('names in the confirmation of Drop and restore the collection a view of the backup replaces', () => {
    const view = { name: 'orders', meta: { options: { viewOn: 'raw', pipeline: [] }, type: 'view' }, size: 0 };
    const answers = {
      kind: 'archive',
      path: 'D:\\b\\shop.agz',
      listing: { databases: [{ name: 'shop', collections: [view] }] },
      existing: { shop: [{ name: 'orders', kind: 'collection' }] },
      mode: 'drop',
    };
    const planned = planOf(restore(shop, answers));
    expect(planned.danger).toMatchObject({ kind: 'destructive', name: 'shop' });
    expect(planned.danger.kind !== 'none' && planned.danger.text).toContain(
      'The backup has a view in place of this collection, which is dropped with its documents: shop.orders.',
    );
  });
});
