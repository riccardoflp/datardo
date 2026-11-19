import { describe, expect, it } from 'vitest';
import {
  keptAfter,
  needsReading,
  usedReferences,
  type KeptReferences,
} from '../../../src/features/relation/kept/references';
import { describedRelations } from '../../../src/features/relation/model/describe';
import { drawing } from '../../../src/features/relation/model/drawing';
import { candidatesOf, lookupsOf, referenceGraph, sampledCollection } from '../../../src/features/relation/model/graph';
import {
  collectionsAtOnce,
  parse,
  parseCount,
  phaseRequests,
  readTimeLimitMs,
  request,
} from '../../../src/features/relation/read';
import { relationText } from '../../../src/features/relation/detect';
import type { ListedCollection } from '../../../src/features/relation/model/graph';
import { text } from '../../../src/features/relation/text';
import type { FoundValues, ReferenceGraph } from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, local, oid, recorded, relation, sampled, shopGraph } from './context';

const place = { connection: local.id, database: 'shop' };

function ids(prefix: string, count: number): readonly Json[] {
  return Array.from({ length: count }, (_, at) => oid(`${prefix}${String(at).padStart(4, '0')}`));
}

describe('relation.read', () => {
  it('lists the collections of shop first, with listCollections', () => {
    const read = request(contextOn('relation.read'), { ...place, phase: 'collections' });
    expect(read).toEqual({
      kind: 'engine',
      requests: [
        {
          connection: local.id,
          request: {
            engine: 'mongodb',
            database: 'shop',
            method: 'listCollections',
            arguments: [{}, { nameOnly: false, authorizedCollections: true }],
            limit: 10_000,
            timeLimitMs: readTimeLimitMs,
          },
        },
      ],
    });
  });

  it('leaves the system. collections out, sorts the others and keeps what a view reads', () => {
    const listed = parse(
      [
        [
          { name: 'orders', type: 'collection', options: {} },
          { name: 'system.views', type: 'collection', options: {} },
          { name: 'recent', type: 'view', options: { viewOn: 'orders', pipeline: [] } },
          { name: 'customers', type: 'collection', options: {} },
        ],
      ],
      { phase: 'collections' },
    );
    expect(listed).toEqual([
      { name: 'customers', view: false },
      { name: 'orders', view: false },
      { name: 'recent', view: true, viewOn: 'orders' },
    ]);
  });

  it('samples a collection of 5,000 documents with $sample and one of 80 with find and a limit', () => {
    const [large] = phaseRequests({ ...place, phase: 'sample', collection: 'orders', documents: 5000, size: 100 });
    expect(large).toMatchObject({
      collection: 'orders',
      method: 'aggregate',
      arguments: [[{ $sample: { size: { $numberInt: '100' } } }]],
      timeLimitMs: 20_000,
    });
    const [small] = phaseRequests({ ...place, phase: 'sample', collection: 'orders', documents: 80, size: 100 });
    expect(small).toMatchObject({ method: 'find', arguments: [{}], limit: 100, timeLimitMs: 20_000 });
  });

  it('samples with find when the count failed', () => {
    const [sample] = phaseRequests({ ...place, phase: 'sample', collection: 'orders', size: 500 });
    expect(sample).toMatchObject({ method: 'find', limit: 500 });
  });

  it('counts and lists the indexes of a collection with a time limit', () => {
    expect(phaseRequests({ ...place, phase: 'count', collection: 'orders' })[0]).toMatchObject({
      method: 'estimatedDocumentCount',
      timeLimitMs: 20_000,
    });
    expect(phaseRequests({ ...place, phase: 'indexes', collection: 'orders' })[0]).toMatchObject({
      method: 'listIndexes',
    });
    expect(parseCount({ $numberInt: '5000' })).toBe(5000);
    expect(parseCount({ $numberLong: '12' })).toBe(12);
    expect(parseCount('nope')).toBeUndefined();
  });

  it('samples 6 collections at a time', () => {
    expect(collectionsAtOnce).toBe(6);
  });

  it('looks up the 35 distinct values of two fields pointing to customers._id in one find', () => {
    const first = ids('a', 20);
    const second = [...first.slice(0, 5), ...ids('b', 15)];
    const customers = sampled(
      'customers',
      ids('a', 3).map((_id) => ({ _id })),
    );
    const orders = sampled(
      'orders',
      first.map((customerId, at) => ({ _id: oid(`c${String(at)}`), customerId, buyerId: second[at] ?? null })),
    );
    const lookups = lookupsOf(candidatesOf([customers, orders])).filter((each) => each.collection === 'customers');
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.values).toHaveLength(35);
    const requests = phaseRequests({ ...place, phase: 'lookup', ...lookups[0] });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      collection: 'customers',
      method: 'find',
      arguments: [{ _id: { $in: lookups[0]?.values } }, { projection: { _id: { $numberInt: '1' } } }],
      limit: 35,
    });
  });

  it('sends 1,000 values per lookup query', () => {
    const values = Array.from({ length: 2500 }, (_, at) => `v${String(at)}`);
    const requests = phaseRequests({ ...place, phase: 'lookup', collection: 'users', field: 'email', values });
    expect(requests.map((each) => each.limit)).toEqual([1000, 1000, 500]);
  });

  it('gives what a lookup found from the documents of every reply', () => {
    const found = parse([[{ _id: oid('1') }], [{ _id: oid('2') }]], {
      phase: 'lookup',
      collection: 'customers',
      field: '_id',
    });
    expect(found).toEqual({ collection: 'customers', field: '_id', values: [oid('1'), oid('2')] });
  });

  it('shows a collection that cannot be read as empty, or not readable, and the others still get their references', () => {
    const customers = sampledCollection(
      { name: 'customers', view: false },
      { unique: [], sample: { documents: ids('a', 3).map((_id) => ({ _id })) } },
    );
    const secrets = sampledCollection(
      { name: 'secrets', view: false },
      { unique: [], sample: { unreadable: 'not authorized on shop to execute command' } },
    );
    const orders = sampledCollection(
      { name: 'orders', view: false },
      {
        documents: 3,
        unique: [],
        sample: { documents: ids('a', 3).map((customerId, at) => ({ _id: oid(`c${String(at)}`), customerId })) },
      },
    );
    const graph = referenceGraph(
      { name: 'shop', sample: 100 },
      [customers, orders, secrets],
      [{ collection: 'customers', field: '_id', values: ids('a', 3) }],
    );
    expect(graph.relations.map((each) => `${each.from}.${each.field}→${each.to}`)).toEqual([
      'orders.customerId→customers',
    ]);
    const box = drawing(graph, { keysOnly: false, moved: [] }).boxes.find((each) => each.name === 'secrets');
    expect(box?.last).toBe('empty, or not readable');
    const told = describedRelations(graph, { connectionName: 'Local' });
    expect('lines' in told ? told.lines.at(-1) : '').toBe(
      'Not readable: secrets: not authorized on shop to execute command',
    );
  });

  it('finds the references of a database from the replies of MongoDB 8.2', () => {
    const replies = (name: string): readonly unknown[] => recorded(name) as readonly unknown[];
    const listed = parse(replies('collections'), { phase: 'collections' }) as readonly ListedCollection[];
    expect(listed.map((each) => each.name)).toEqual(['customers', 'orders', 'products', 'recent']);
    expect(parse(replies('count'), { phase: 'count' })).toBe(4);
    const unique = parse(replies('indexes'), { phase: 'indexes' }) as readonly string[];
    expect(unique).toEqual(['email']);
    const collections = listed.map((each) =>
      each.view
        ? sampledCollection(each)
        : sampledCollection(each, {
            unique: each.name === 'customers' ? unique : [],
            sample: { documents: parse(replies(`sample-${each.name}`), { phase: 'sample' }) as readonly Json[] },
          }),
    );
    const found = lookupsOf(candidatesOf(collections)).map(
      (lookup) =>
        parse(replies(`lookup-${lookup.collection}-${lookup.field}`), {
          phase: 'lookup',
          collection: lookup.collection,
          field: lookup.field,
        }) as FoundValues,
    );
    const graph = referenceGraph({ name: 'relation-record', sample: 100 }, collections, found);
    expect(graph.relations.map(relationText)).toEqual([
      'orders.customerEmail → customers.email · many-to-one · 3 of 3 sampled values found',
      'orders.customerId → customers._id · many-to-one · 3 of 3 sampled values found',
      'orders.items[].productId → products._id · many-to-many (an array of references) · 4 of 4 sampled values found',
      'recent is a view of orders',
    ]);
  });

  it('says how far it is', () => {
    expect(text.progress.sampling(12)).toBe('Sampling 12 collections…');
    expect(text.progress.sampled(3, 12)).toBe('Sampled 3 of 12 collections…');
    expect(text.progress.checking(9, 4)).toBe('Checking 9 possible references in 4 collections…');
  });

  describe('the references kept', () => {
    const found = (graph: ReferenceGraph = shopGraph): KeptReferences =>
      keptAfter(keptAfter([], { kind: 'reading', ...place }), { kind: 'found', graph, connection: local.id });

    it('reads shop once: a second tab sends nothing, also while the first read is under way', () => {
      expect(needsReading([], place, true)).toBe(true);
      const reading = keptAfter([], { kind: 'reading', ...place });
      expect(needsReading(reading, place, true)).toBe(false);
      expect(needsReading(found(), place, true)).toBe(false);
    });

    it('keeps the links after Refresh and samples again when the next tab opens', () => {
      const refreshed = keptAfter(found(), { kind: 'refreshed', connection: local.id });
      expect(usedReferences(refreshed, local.id, 'shop')).toBe(shopGraph);
      expect(needsReading(refreshed, place, true)).toBe(true);
      const again = keptAfter(keptAfter(refreshed, { kind: 'reading', ...place }), {
        kind: 'found',
        graph: { ...shopGraph, relations: [] },
        connection: local.id,
      });
      expect(usedReferences(again, local.id, 'shop')?.relations).toEqual([]);
    });

    it('keeps as new a read under way when Refresh is pressed', () => {
      const reading = keptAfter(found(), { kind: 'reading', ...place });
      const refreshed = keptAfter(reading, { kind: 'refreshed', connection: local.id, database: 'shop' });
      const done = keptAfter(refreshed, { kind: 'found', graph: shopGraph, connection: local.id });
      expect(needsReading(done, place, true)).toBe(false);
    });

    it('replaces the references of shop with what the diagram found with a sample of 500', () => {
      const larger = {
        ...shopGraph,
        sample: 500,
        relations: [...shopGraph.relations, relation('orders.storeId', 'stores._id')],
      };
      const replaced = keptAfter(found(), { kind: 'found', graph: larger, connection: local.id });
      expect(usedReferences(replaced, local.id, 'shop')).toBe(larger);
      expect(replaced).toHaveLength(1);
    });

    it('reads nothing with datardo.relation.detect off, and uses what a diagram found', () => {
      expect(needsReading([], place, false)).toBe(false);
      expect(usedReferences([], local.id, 'shop')).toBeUndefined();
      const fromDiagram = keptAfter([], { kind: 'found', graph: shopGraph, connection: local.id });
      expect(usedReferences(fromDiagram, local.id, 'shop')).toBe(shopGraph);
    });

    it('forgets them on a disconnect: the first tab samples again', () => {
      const forgotten = keptAfter(found(), { kind: 'forgotten', connection: local.id });
      expect(needsReading(forgotten, place, true)).toBe(true);
    });

    it('keeps the old ones as old when a read fails, and nothing when there were none', () => {
      const failed = keptAfter(keptAfter(found(), { kind: 'reading', ...place }), { kind: 'failed', ...place });
      expect(usedReferences(failed, local.id, 'shop')).toBe(shopGraph);
      expect(needsReading(failed, place, true)).toBe(true);
      expect(keptAfter(keptAfter([], { kind: 'reading', ...place }), { kind: 'failed', ...place })).toEqual([]);
    });
  });

  describe('describe_relations', () => {
    it('answers the references from and to orders in the texts of relation.detect', () => {
      const graph: ReferenceGraph = {
        ...shopGraph,
        collections: [...shopGraph.collections, sampled('reviews', [{ _id: 1 }])],
        relations: [...shopGraph.relations, relation('reviews.orderId', 'orders._id')],
      };
      expect(describedRelations(graph, { collection: 'orders', connectionName: 'Local' })).toEqual({
        lines: [
          'orders.customerId → customers._id · many-to-one · 20 of 20 sampled values found',
          'orders.productId → products._id · many-to-one · 20 of 20 sampled values found',
          'reviews.orderId → orders._id · many-to-one · 20 of 20 sampled values found',
        ],
      });
    });

    it('answers that a collection that does not exist does not exist', () => {
      expect(describedRelations(shopGraph, { collection: 'nope', connectionName: 'Local' })).toEqual({
        error: "shop.nope doesn't exist on Local: use list_collections.",
      });
    });
  });
});
