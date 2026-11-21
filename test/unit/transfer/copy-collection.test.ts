import { describe, expect, it } from 'vitest';
import { countRead, plan, sourceRead, type SourceInfo } from '../../../src/features/transfer/copy-collection';
import type { FedStep } from '../../../src/features/backup/types';
import type { Answers } from '../../../src/shared/feature';
import { contextOn, local, mongoOf, next, ordersOn, planOf, production, staging, stateWith } from './harness';

const source: SourceInfo = {
  type: 'collection',
  options: {
    capped: true,
    size: { $numberInt: '4096' },
    validator: { qty: { $gt: { $numberInt: '0' } } },
    comment: 'x',
  },
  indexes: [
    { v: { $numberInt: '2' }, key: { _id: { $numberInt: '1' } }, name: '_id_' },
    { v: { $numberInt: '2' }, key: { at: { $numberInt: '1' } }, name: 'at_1', ns: 'shop.orders' },
  ],
};

const toStaging: Answers = {
  'destination-connection': staging.id,
  'destination-databases': [{ name: 'admin' }, { name: 'shop' }, { name: 'crm' }],
  database: 'shop',
  'destination-collections': { buckets: [], entries: [{ name: 'recent', kind: 'view', system: false }] },
  collection: 'orders',
  source,
};

function copying(answers: Answers) {
  return plan(contextOn(ordersOn(), 'transfer.copy-collection'), answers);
}

describe('transfer.copy-collection', () => {
  it('offers the source connection first, marked, and read-only ones marked', () => {
    const outcome = copying({});
    expect(outcome.kind === 'ask' && outcome.question).toMatchObject({
      title: 'Copy shop.orders: destination connection',
      text: 'Where the copy goes',
      fields: [
        {
          key: 'destination-connection',
          choices: [
            { value: local.id, label: 'Local', description: 'same connection' },
            { value: production.id, label: 'Production', description: 'read-only' },
            { value: staging.id, label: 'Staging' },
          ],
        },
      ],
    });
  });

  it('refuses a destination that is not connected, with its error', () => {
    const offline = contextOn(ordersOn(), 'transfer.copy-collection', stateWith(undefined, undefined, [staging]));
    expect(plan(offline, { 'destination-connection': staging.id })).toEqual({
      kind: 'refuse',
      code: 'transfer.copy-collection/not-connected',
      message: 'Could not connect to Staging: not connected',
    });
  });

  it('refuses a read-only destination and asks nothing more', () => {
    expect(copying({ 'destination-connection': production.id })).toEqual({
      kind: 'refuse',
      code: 'transfer.copy-collection/read-only',
      message: "The connection Production is read-only: it can't receive a copy.",
    });
  });

  it('offers the source database first, not admin, local and config, and New database…', () => {
    const outcome = copying({ ...toStaging, database: undefined });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({
      key: 'database',
      choices: [{ value: 'shop' }, { value: 'crm' }, { value: '$new', label: 'New database…' }],
    });
    const named = copying({ ...toStaging, database: '$new' });
    expect(named.kind === 'ask' && named.question.fields[0]).toMatchObject({
      key: 'new-database',
      rules: [
        { kind: 'not-empty', message: 'Enter a database name' },
        { kind: 'not-one-of', values: ['shop', 'crm'], message: 'This database already exists' },
      ],
    });
  });

  it('proposes <collection>_copy in the same database, and refuses the source and a view', () => {
    const same = copying({ ...toStaging, 'destination-connection': local.id, collection: undefined });
    expect(same.kind === 'ask' && same.question.fields[0]).toMatchObject({
      key: 'collection',
      default: 'orders_copy',
      rules: [
        { kind: 'not-empty' },
        { kind: 'not-one-of', values: ['orders'], message: 'That is the collection being copied' },
        { kind: 'not-one-of', values: ['recent'], message: 'A view has this name' },
      ],
    });
    const elsewhere = copying({ ...toStaging, collection: undefined });
    expect(elsewhere.kind === 'ask' && elsewhere.question.fields[0]).toMatchObject({ default: 'orders' });
  });

  it('asks how to write into an existing collection, with its count', () => {
    const existing = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
    const answers = {
      ...toStaging,
      'destination-collections': existing,
      source: { ...source, destinationCount: 1200 },
    };
    const outcome = copying(answers);
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({
      key: 'mode',
      choices: [
        { value: 'append', label: 'Append' },
        { value: 'replace', label: 'Replace matching' },
        { value: 'drop', description: 'the 1,200 documents and indexes of orders are deleted first' },
      ],
    });
  });

  it('copies into a new collection: create with the options, the documents fed by the query, then the indexes', () => {
    const copy = planOf(copying({ ...toStaging, filter: '', also: ['indexes', 'options'], count: 2500 }));
    expect(copy.steps.map((step) => step.text)).toEqual(
      [
        'db.getSiblingDB("shop").createCollection("orders", { capped: true, size: 4096, validator: { qty: { $gt: 0 } } })',
        'db.getSiblingDB("shop").orders.insertMany([<documents of orders>], { ordered: false })',
        'db.getSiblingDB("shop").orders.createIndexes([{ key: { at: 1 }, name: "at_1" }])',
      ].map((text) => text.replaceAll('db.getSiblingDB("shop")', 'db')),
    );
    const fed = copy.steps[1] as FedStep;
    expect(fed.connection).toBe(staging.id);
    expect(fed.feed).toEqual({
      kind: 'query',
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      filter: {},
    });
    expect(fed.batches).toEqual({ documents: 1000 });
    expect(copy.danger).toEqual({
      kind: 'confirm',
      text: [
        'Copy 2,500 documents of Local › shop.orders to Staging › shop.orders?',
        'Destination: into the new collection Staging › shop.orders.',
        'All documents.',
        'Indexes are created after the documents.',
        'The collection is created with the options of the source.',
      ].join('\n'),
      button: 'Copy',
    });
    expect(copy.publishes).toBe(false);
    expect(copy.after).toEqual([{ kind: 'refresh', connection: staging.id }]);
  });

  it('drops and recreates: destructive, the destination collection typed, not undone', () => {
    const existing = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
    const answers = {
      ...toStaging,
      'destination-collections': existing,
      mode: 'drop',
      filter: '',
      also: ['options'],
      count: 3,
    };
    const copy = planOf(copying(answers));
    expect(copy.steps[0]?.text).toBe('db.orders.drop()');
    expect(copy.danger).toMatchObject({ kind: 'destructive', name: 'orders', button: 'Copy' });
    expect(copy.undo).toEqual({ cannot: "Dropping the destination can't be undone." });
  });

  it('replaces matching documents with bulkWrite, and keeps the replaced ones for the undo', () => {
    const existing = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
    const answers = {
      ...toStaging,
      'destination-collections': existing,
      mode: 'replace',
      filter: '',
      also: [],
      count: 3,
    };
    const copy = planOf(copying(answers));
    expect(mongoOf(copy.steps[0]).method).toBe('bulkWrite');
    expect(copy.undo).toEqual({
      keeps: {
        kind: 'replaced',
        connection: staging.id,
        database: 'shop',
        collection: 'orders',
        title: 'Copy Local › shop.orders',
      },
    });
  });

  it('copies only the documents matching the filter, and says it', () => {
    const copy = planOf(copying({ ...toStaging, filter: '{ status: "active" }', also: [], count: 2 }));
    expect((copy.steps[1] as FedStep).feed).toMatchObject({ filter: { status: 'active' } });
    expect(copy.danger.kind !== 'none' && copy.danger.text).toContain('Filter: { status: "active" }');
    expect(copy.title).toBe('Copy filtered Local › shop.orders');
  });

  it('asks the filter again with the error while it does not parse', () => {
    const outcome = copying({ ...toStaging, filter: '{ status: ' });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]?.key).toBe('filter');
    expect(outcome.kind === 'ask' && outcome.question.text).not.toBe(
      'Only the documents matching this filter are copied; leave empty for all',
    );
  });

  it('copies a view as a collection, offering neither indexes nor options', () => {
    const answers = {
      ...toStaging,
      source: { type: 'view', options: { viewOn: 'x', pipeline: [] }, indexes: [] },
      filter: '',
    };
    expect(copying(answers)).toEqual({
      kind: 'read',
      need: {
        key: 'count',
        read: 'transfer.copy-collection:count',
        args: { connection: local.id, database: 'shop', collection: 'orders', filter: {}, view: true },
      },
    });
    expect(copying({ ...answers, count: 5 }).kind).toBe('run');
  });

  it('counts with countDocuments with a filter or on a view, the estimate otherwise', () => {
    const counted = (args: Record<string, unknown>) => {
      const request = countRead.request(contextOn(ordersOn(), 'x'), {
        connection: local.id,
        database: 'shop',
        collection: 'orders',
        ...args,
      });
      return request.kind === 'engine' ? request.requests[0]?.request : undefined;
    };
    expect(counted({ filter: {}, view: false })).toMatchObject({ method: 'estimatedDocumentCount' });
    expect(counted({ filter: { a: 1 }, view: false })).toMatchObject({
      method: 'countDocuments',
      arguments: [{ a: 1 }, { maxTimeMS: { $numberInt: '60000' } }],
    });
    expect(counted({ filter: {}, view: true })).toMatchObject({ method: 'countDocuments' });
    expect(countRead.parse([{ $numberLong: '2500' }], null)).toBe(2500);
  });

  it('reads the source options and indexes, and the destination count', () => {
    const parsed = sourceRead.parse(
      [[{ name: 'orders', type: 'collection', options: { capped: true } }], [{ name: '_id_' }], 7],
      null,
    );
    expect(parsed).toEqual({
      type: 'collection',
      options: { capped: true },
      indexes: [{ name: '_id_' }],
      destinationCount: 7,
    });
  });

  it('reads the destination before asking it, step by step', () => {
    expect(next(copying({ 'destination-connection': staging.id }))).toBe('read:destination-databases');
    expect(next(copying({ ...toStaging, 'destination-collections': undefined }))).toBe('read:destination-collections');
    expect(next(copying({ ...toStaging, source: undefined }))).toBe('read:source');
    expect(next(copying(toStaging))).toBe('filter');
    expect(next(copying({ ...toStaging, filter: '' }))).toBe('also');
  });
});
