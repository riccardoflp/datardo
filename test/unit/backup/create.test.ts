import { describe, expect, it } from 'vitest';
import { detailsRead, listRead, plan, proposedName, type BackupList } from '../../../src/features/backup/create';
import type { FileStep, ReadRequest } from '../../../src/shared/feature';
import type { Target } from '../../../src/shared/target';
import { contextOn, local, next, planOf, production } from '../transfer/harness';

const shopOrders: Target = { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' };
const shop: Target = { kind: 'database', connection: local.id, database: 'shop' };
const onLocal: Target = { kind: 'connection', connection: local.id };

const listed: BackupList = {
  serverVersion: '8.2.0',
  databases: [
    {
      database: 'shop',
      collections: [
        { name: 'events', type: 'timeseries' },
        { name: 'orders', type: 'collection', options: { capped: true, size: { $numberInt: '4096' } } },
        { name: 'recent', type: 'view', options: { viewOn: 'orders', pipeline: [] } },
      ],
    },
  ],
};

const details = {
  indexes: { 'shop.orders': [{ v: { $numberInt: '2' }, key: { _id: { $numberInt: '1' } }, name: '_id_' }] },
  counts: { 'shop.orders': 3 },
};

describe('backup.create', () => {
  it('offers the databases of a connection but admin, local and config, all checked', () => {
    const outcome = plan(contextOn(onLocal, 'backup.create'), {
      'listed-databases': [{ name: 'admin' }, { name: 'shop' }, { name: 'logs' }],
    });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({
      kind: 'pick-many',
      key: 'databases',
      choices: [
        { value: 'shop', label: 'shop' },
        { value: 'logs', label: 'logs' },
      ],
      default: ['shop', 'logs'],
    });
  });

  it('does not ask which of one database, nor of a database with one collection', () => {
    const one = plan(contextOn(onLocal, 'backup.create'), {
      'listed-databases': [{ name: 'admin' }, { name: 'shop' }],
    });
    expect(one).toEqual({
      kind: 'read',
      need: { key: 'listed', read: 'backup.create:read', args: { connection: local.id, databases: ['shop'] } },
    });
    const single = {
      serverVersion: '8.2.0',
      databases: [{ database: 'shop', collections: [{ name: 'orders', type: 'collection' }] }],
    };
    expect(next(plan(contextOn(shop, 'backup.create'), { listed: single }))).toBe('format');
  });

  it('asks which collections of a database with several, views and time series said', () => {
    const outcome = plan(contextOn(shop, 'backup.create'), { listed });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({
      key: 'collections',
      choices: [
        { value: 'events', label: 'events', description: 'time series' },
        { value: 'orders', label: 'orders' },
        { value: 'recent', label: 'recent', description: 'view' },
      ],
    });
  });

  it('proposes <what>_<date>_<time>.agz in local time', () => {
    const when = new Date(2026, 9, 8, 16, 45, 12).getTime();
    expect(`${proposedName('Local shop', when)}.agz`).toBe('Local_shop_2026-10-08_16-45-12.agz');
    const outcome = plan(contextOn(shopOrders, 'backup.create'), { listed, format: 'archive' });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({ key: 'file' });
  });

  it('writes an archive with one step and the writer backup.create, the metadata of each collection given', () => {
    const outcome = plan(contextOn(shop, 'backup.create'), {
      listed,
      collections: ['orders', 'recent'],
      format: 'archive',
      file: 'D:\\b\\shop.agz',
      details,
    });
    const steps = planOf(outcome).steps as FileStep[];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'file', action: 'write', path: 'D:\\b\\shop.agz' });
    expect(steps[0]?.content).toMatchObject({
      writer: 'backup.create',
      args: {
        connection: local.id,
        database: 'shop',
        collection: null,
        format: 'archive',
        plan: {
          serverVersion: '8.2.0',
          collections: [
            { database: 'shop', collection: 'orders', type: 'collection', total: 3 },
            { database: 'shop', collection: 'recent', type: 'view', total: 0 },
          ],
        },
      },
    });
    expect(planOf(outcome)).toMatchObject({ danger: { kind: 'none' }, publishes: false });
  });

  it('writes a compressed folder <what>_<date>_<time>/shop/orders.bson.gz, an uncompressed one orders.bson', () => {
    const answers = { listed, format: 'gzip', folder: 'D:\\b', details, taken: [] };
    const steps = planOf(plan(contextOn(shopOrders, 'backup.create'), answers)).steps.map((step) => step.text);
    const root = `D:\\b\\${proposedName('shop.orders', contextOn(shopOrders, 'x').now)}`;
    expect(steps).toEqual([
      `create folder ${root}`,
      `create folder ${root}\\shop`,
      `write ${root}\\shop\\orders.metadata.json.gz`,
      `write ${root}\\shop\\orders.bson.gz`,
    ]);
    const plain = planOf(plan(contextOn(shopOrders, 'backup.create'), { ...answers, format: 'plain' })).steps;
    expect(plain.map((step) => step.text.split('\\').pop())).toContain('orders.bson');
  });

  it('never replaces a folder: _2 when the name is taken', () => {
    const name = proposedName('shop.orders', contextOn(shopOrders, 'x').now);
    const answers = { listed, format: 'plain', folder: 'D:\\b', details, taken: [name] };
    const [first] = planOf(plan(contextOn(shopOrders, 'backup.create'), answers)).steps;
    expect(first?.text).toBe(`create folder D:\\b\\${name}_2`);
  });

  it('gives a view only its metadata file in a folder', () => {
    const answers = { listed, collections: ['recent'], format: 'plain', folder: 'D:\\b', details, taken: [] };
    const texts = planOf(plan(contextOn(shop, 'backup.create'), answers)).steps.map((step) => step.text);
    expect(texts.filter((text) => text.startsWith('write'))).toHaveLength(1);
    expect(texts.at(-1)).toMatch(/recent\.metadata\.json$/u);
  });

  it('leaves out a time series collection, with a warning naming it', () => {
    const answers = { listed, collections: ['events', 'orders'], format: 'archive', file: 'D:\\b\\s.agz', details };
    expect(planOf(plan(contextOn(shop, 'backup.create'), answers)).after).toEqual([
      {
        kind: 'notify',
        level: 'warning',
        text: "Time series collections aren't supported and were left out (use mongodump): shop.events.",
      },
    ]);
    const only = plan(contextOn(shop, 'backup.create'), { listed, collections: ['events'] });
    expect(next(only)).toBe('refuse:backup.create/unsupported');
  });

  it('works on a read-only connection: it writes files only', () => {
    const target: Target = { kind: 'collection', connection: production.id, database: 'shop', collection: 'orders' };
    const outcome = plan(contextOn(target, 'backup.create'), {
      listed,
      format: 'archive',
      file: 'D:\\b\\o.agz',
      details,
    });
    expect(planOf(outcome).steps.every((step) => step.kind === 'file')).toBe(true);
  });

  it('reads buildInfo and the collections of each database, then the indexes and counts', () => {
    const request = listRead.request(contextOn(shop, 'x'), {
      connection: local.id,
      databases: ['shop'],
    }) as ReadRequest;
    expect(request.kind === 'engine' && request.requests.map((each) => each.request)).toMatchObject([
      { database: 'admin', method: 'runCommand' },
      { database: 'shop', method: 'listCollections' },
    ]);
    const parsed = listRead.parse(
      [
        { version: '8.2.0' },
        [
          {
            name: 'orders',
            type: 'collection',
            info: { uuid: { $binary: { base64: 'AAECAwQFBgcICQoLDA0ODw==', subType: '04' } } },
          },
          { name: 'system.views' },
        ],
      ],
      { connection: local.id, databases: ['shop'] },
    );
    expect(parsed).toEqual({
      serverVersion: '8.2.0',
      databases: [
        {
          database: 'shop',
          collections: [{ name: 'orders', type: 'collection', uuid: '000102030405060708090a0b0c0d0e0f' }],
        },
      ],
    });
    const args = {
      connection: local.id,
      collections: [{ database: 'shop', collection: 'orders', type: 'collection' }],
    };
    expect(detailsRead.parse([[{ name: '_id_' }], { $numberLong: '3' }], args)).toEqual({
      indexes: { 'shop.orders': [{ name: '_id_' }] },
      counts: { 'shop.orders': 3 },
    });
  });

  it('says why a backup fails before writing', () => {
    expect(() =>
      listRead.parse([{ version: '8.2.0' }, { kind: 'error', message: 'not authorized' }], {
        connection: local.id,
        databases: ['shop'],
      }),
    ).toThrow(/^Backup failed: /u);
  });
});
