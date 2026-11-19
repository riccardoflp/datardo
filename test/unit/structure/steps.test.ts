import { describe, expect, it } from 'vitest';
import { commandText } from '../../../src/features/structure/model/commands';
import { diffStructure } from '../../../src/features/structure/steps';
import type { StructureDifference } from '../../../src/features/structure/types';
import { collection, database, differenceOf, index, int, view } from './build';

/** The commands of a difference's steps, as the script writes them, and whether each is destructive. */
function commandsOf(difference: StructureDifference): readonly (readonly [string, boolean])[] {
  return difference.steps.map((step) => [
    step.operation === undefined ? `// ${step.note ?? ''}` : commandText(step.operation, 'shop'),
    step.destructive,
  ]);
}

describe('structure.steps', () => {
  it('gives a collection missing on the right its options and indexes, nothing destructive', () => {
    const left = database([
      collection('orders', {
        options: { validator: { a: { $exists: true } } },
        indexes: [
          index('status_1', { status: int(1) }),
          index('byDate', { date: int(-1) }, { expireAfterSeconds: int(3600) }),
        ],
      }),
    ]);
    const { differences } = diffStructure(left, database([]));
    const orders = differenceOf(differences, 'orders', 'collection');
    expect(orders.kind).toBe('only-left');
    expect(orders.summary).toBe('Collection missing on the right, with 2 indexes');
    expect(commandsOf(orders)).toEqual([
      ['db.createCollection("orders", { validator: { a: { $exists: true } } })', false],
      // A generated name is left out of the command (structure.script, rule 7).
      ['db.getCollection("orders").createIndex({ status: 1 })', false],
      ['db.getCollection("orders").createIndex({ date: -1 }, { expireAfterSeconds: 3600, name: "byDate" })', false],
    ]);
    expect(differences).toHaveLength(1);
  });

  it('pairs indexes with the same keys and another name, and recreates the right one', () => {
    const left = database([collection('orders', { indexes: [index('byStatus', { status: int(1) })] })]);
    const right = database([collection('orders', { indexes: [index('status_1', { status: int(1) })] })]);
    const { differences } = diffStructure(left, right);
    const indexes = differences.filter((difference) => difference.object === 'index');
    expect(indexes).toHaveLength(1);
    const pair = indexes[0] as StructureDifference;
    expect(pair.kind).toBe('different');
    expect(pair.summary).toBe('Same keys { status: 1 }, named status_1 on the right');
    expect(commandsOf(pair)).toEqual([
      ['db.getCollection("orders").dropIndex("status_1")', true],
      ['db.getCollection("orders").createIndex({ status: 1 }, { name: "byStatus" })', true],
    ]);
  });

  it('tells keys in another order apart', () => {
    const left = database([collection('orders', { indexes: [index('main', { a: int(1), b: int(1) })] })]);
    const right = database([collection('orders', { indexes: [index('main', { b: int(1), a: int(1) })] })]);
    const main = differenceOf(diffStructure(left, right).differences, 'orders', 'index', 'main');
    expect(main.summary).toBe('Same name, different keys: { a: 1, b: 1 } on the left, { b: 1, a: 1 } on the right');
    expect(main.steps.map((step) => step.operation?.type)).toEqual(['dropIndex', 'createIndex']);
  });

  it('changes hidden and the TTL in place with collMod', () => {
    const left = database([
      collection('orders', { indexes: [index('a_1', { a: int(1) }, { hidden: true, expireAfterSeconds: int(60) })] }),
    ]);
    const right = database([
      collection('orders', { indexes: [index('a_1', { a: int(1) }, { expireAfterSeconds: int(30) })] }),
    ]);
    const a1 = differenceOf(diffStructure(left, right).differences, 'orders', 'index', 'a_1');
    expect(a1.summary).toBe('Different hidden, expireAfterSeconds');
    expect(commandsOf(a1)).toEqual([
      [
        'db.runCommand({\n  collMod: "orders",\n  index: { name: "a_1", hidden: true, expireAfterSeconds: 60 }\n})',
        false,
      ],
    ]);
  });

  it('drops and builds again an index that becomes unique', () => {
    const left = database([collection('orders', { indexes: [index('a_1', { a: int(1) }, { unique: true })] })]);
    const right = database([collection('orders', { indexes: [index('a_1', { a: int(1) })] })]);
    const a1 = differenceOf(diffStructure(left, right).differences, 'orders', 'index', 'a_1');
    expect(a1.summary).toBe('Different unique');
    expect(a1.steps.map((step) => [step.operation?.type, step.destructive])).toEqual([
      ['dropIndex', true],
      ['createIndex', true],
    ]);
    expect(a1.steps[0]?.note).toContain("MongoDB can't change");
    expect(a1.steps[0]?.note).toContain("Queries can't use it in the meantime.");
  });

  it('pairs by identity: another collation or partial filter is another index', () => {
    const left = database([
      collection('orders', {
        indexes: [index('a_1', { a: int(1) }), index('a_fr', { a: int(1) }, { collation: { locale: 'fr' } })],
      }),
    ]);
    const right = database([
      collection('orders', {
        indexes: [
          index('a_1', { a: int(1) }),
          index('a_part', { a: int(1) }, { partialFilterExpression: { a: { $gt: int(0) } } }),
        ],
      }),
    ]);
    const { differences } = diffStructure(left, right);
    expect(differenceOf(differences, 'orders', 'index', 'a_1').kind).toBe('same');
    expect(differenceOf(differences, 'orders', 'index', 'a_fr').kind).toBe('only-left');
    expect(differenceOf(differences, 'orders', 'index', 'a_part').kind).toBe('only-right');
  });

  it('changes the size of two capped collections with collMod', () => {
    const left = database([collection('log', { options: { capped: true, size: int(8192), max: int(10) } })]);
    const right = database([collection('log', { options: { capped: true, size: int(4096) } })]);
    const options = differenceOf(diffStructure(left, right).differences, 'log', 'options');
    expect(commandsOf(options)).toEqual([
      ['db.runCommand({ collMod: "log", cappedSize: 8192, cappedMax: 10 })', false],
    ]);
  });

  it('converts to capped, destructive, a collection capped on the left only', () => {
    const left = database([collection('log', { options: { capped: true, size: int(8192) } })]);
    const right = database([collection('log')]);
    const options = differenceOf(diffStructure(left, right).differences, 'log', 'options');
    expect(commandsOf(options)).toEqual([['db.runCommand({ convertToCapped: "log", size: 8192 })', true]]);
  });

  it('only notes a collection capped on the right only', () => {
    const left = database([collection('log')]);
    const right = database([collection('log', { options: { capped: true, size: int(4096) } })]);
    const options = differenceOf(diffStructure(left, right).differences, 'log', 'options');
    expect(options.steps).toHaveLength(1);
    expect(options.steps[0]?.operation).toBeUndefined();
    expect(options.steps[0]?.note).toMatch(/^A capped collection can't be made uncapped: /);
  });

  it('changes the granularity and the expiry of a time series with one collMod', () => {
    const left = database([
      collection('metrics', {
        type: 'timeseries',
        options: { timeseries: { timeField: 't', granularity: 'hours' }, expireAfterSeconds: int(60) },
      }),
    ]);
    const right = database([
      collection('metrics', {
        type: 'timeseries',
        options: { timeseries: { timeField: 't', granularity: 'seconds' } },
      }),
    ]);
    const options = differenceOf(diffStructure(left, right).differences, 'metrics', 'options');
    expect(commandsOf(options)).toEqual([
      [
        'db.runCommand({\n  collMod: "metrics",\n  expireAfterSeconds: 60,\n  timeseries: { granularity: "hours" }\n})',
        false,
      ],
    ]);
  });

  it('gives a difference of the kind same no steps, and a step without command only its note', () => {
    const same = database([collection('orders', { indexes: [index('a_1', { a: int(1) })] })]);
    const { differences } = diffStructure(same, same);
    expect(differences.every((difference) => difference.kind === 'same')).toBe(true);
    expect(differences.every((difference) => difference.steps.length === 0)).toBe(true);
    const collated = diffStructure(
      database([collection('orders', { options: { collation: { locale: 'fr' } } })]),
      database([collection('orders')]),
    ).differences;
    const step = differenceOf(collated, 'orders', 'options').steps[0];
    expect(step?.operation).toBeUndefined();
    expect(step?.note).toBeDefined();
    expect(step?.destructive).toBe(false);
  });

  it('marks every drop destructive, except dropping a view to change its collation', () => {
    const left = database([
      collection('orders'),
      view('recent', 'orders', [{ $sort: { date: int(-1) } }]),
      { ...view('byLocale', 'orders'), options: { viewOn: 'orders', pipeline: [], collation: { locale: 'fr' } } },
    ]);
    const right = database([
      collection('orders', { indexes: [index('old_1', { old: int(1) })] }),
      collection('legacy'),
      view('stale', 'orders'),
      view('byLocale', 'orders'),
      collection('recent'),
    ]);
    const { differences } = diffStructure(left, right);
    const legacy = differenceOf(differences, 'legacy', 'collection');
    expect(legacy.summary).toBe('Collection only on the right');
    expect(legacy.steps).toEqual([
      {
        operation: { type: 'drop', collection: 'legacy', dropsDocuments: true },
        destructive: true,
        note: 'Its documents and indexes are deleted.',
      },
    ]);
    expect(differenceOf(differences, 'stale', 'view').steps.every((step) => step.destructive)).toBe(true);
    expect(differenceOf(differences, 'orders', 'index', 'old_1').steps[0]?.destructive).toBe(true);
    const recent = differenceOf(differences, 'recent', 'view');
    expect(recent.summary).toBe('A view on the left, a collection on the right');
    expect(recent.steps.every((step) => step.destructive)).toBe(true);
    expect(recent.steps[0]?.note).toBe(
      'The collection is dropped and created again as a view: its documents are deleted.',
    );
    const byLocale = differenceOf(differences, 'byLocale', 'view');
    expect(byLocale.steps.map((step) => [step.operation?.type, step.destructive])).toEqual([
      ['drop', false],
      ['createCollection', false],
    ]);
  });

  it('changes the pipeline of a view with collMod', () => {
    const left = database([collection('orders'), view('recent', 'orders', [{ $limit: int(5) }])]);
    const right = database([collection('orders'), view('recent', 'orders', [{ $limit: int(10) }])]);
    const recent = differenceOf(diffStructure(left, right).differences, 'recent', 'view');
    expect(commandsOf(recent)).toEqual([
      ['db.runCommand({ collMod: "recent", viewOn: "orders", pipeline: [{ $limit: 5 }] })', false],
    ]);
  });

  it('notes shard keys not compared when only the left is a sharded cluster', () => {
    const left = database([collection('orders', { shardKey: { key: { region: int(1) } } })], { sharded: true });
    const right = database([collection('orders')]);
    const comparison = diffStructure(left, right);
    expect(comparison.notes).toContain('Shard keys are not compared: only the left is a sharded cluster.');
    expect(comparison.differences.some((difference) => difference.object === 'shard-key')).toBe(false);
  });

  it('shards on the right a collection sharded on the left only, when both are sharded clusters', () => {
    const left = database([collection('orders', { shardKey: { key: { region: int(1) } } })], { sharded: true });
    const right = database([collection('orders')], { sharded: true });
    const shard = differenceOf(diffStructure(left, right).differences, 'orders', 'shard-key');
    expect(shard.summary).toBe('Sharded on the left by { region: 1 }, not on the right');
    expect(shard.steps[0]?.note).toBe('The collection needs an index that starts with the shard key.');
    expect(commandsOf(shard)).toEqual([
      ['db.adminCommand({ shardCollection: "shop.orders", key: { region: 1 } })', false],
    ]);
  });

  it('notes search indexes not compared when the right server has no search', () => {
    const left = database(
      [collection('orders', { searchIndexes: [{ name: 'default', type: 'search', definition: { mappings: {} } }] })],
      { search: 'ok' },
    );
    const comparison = diffStructure(left, database([collection('orders')]));
    expect(comparison.notes).toContain(
      'Search indexes are not compared: the right server has no search (1 search index on the left).',
    );
    expect(comparison.differences.some((difference) => difference.object === 'search-index')).toBe(false);
  });

  it('notes search indexes that could not be read', () => {
    const left = database([collection('orders', { searchIndexes: [] })], { search: 'ok' });
    const right = database([collection('orders')], { search: 'error', searchError: 'not authorized' });
    expect(diffStructure(left, right).notes).toContain(
      'Search indexes are not compared: they could not be read on the right: not authorized',
    );
  });

  it('updates, recreates and drops search indexes when both servers have search', () => {
    const search = (name: string, type: string, dynamic: boolean): CollectionSearch => ({
      name,
      type,
      definition: { mappings: { dynamic } },
    });
    const left = database(
      [
        collection('orders', {
          searchIndexes: [search('default', 'search', true), search('vec', 'vectorSearch', true)],
        }),
      ],
      { search: 'ok' },
    );
    const right = database(
      [
        collection('orders', {
          searchIndexes: [
            search('default', 'search', false),
            search('old', 'search', true),
            search('vec', 'search', true),
          ],
        }),
      ],
      { search: 'ok' },
    );
    const { differences } = diffStructure(left, right);
    expect(commandsOf(differenceOf(differences, 'orders', 'search-index', 'default'))).toEqual([
      ['db.getCollection("orders").updateSearchIndex("default", { mappings: { dynamic: true } })', false],
    ]);
    expect(commandsOf(differenceOf(differences, 'orders', 'search-index', 'vec')).map(([, d]) => d)).toEqual([
      true,
      true,
    ]);
    expect(commandsOf(differenceOf(differences, 'orders', 'search-index', 'old'))).toEqual([
      ['db.getCollection("orders").dropSearchIndex("old")', true],
    ]);
  });

  it('counts the differences by kind', () => {
    const left = database([collection('a'), collection('b', { indexes: [index('x_1', { x: int(1) })] })]);
    const right = database([collection('a'), collection('b'), collection('c')]);
    expect(diffStructure(left, right).counts).toEqual({ same: 2, different: 0, 'only-left': 1, 'only-right': 1 });
  });

  it('keeps an index the same when only v, ns, background or a generated name differ', () => {
    const left = database([collection('orders', { indexes: [index('a_1', { a: int(1) }, { v: int(2) })] })]);
    const right = database([
      collection('orders', {
        indexes: [index('a_1', { a: int(1) }, { v: int(1), ns: 'shop.orders', background: true })],
      }),
    ]);
    expect(differenceOf(diffStructure(left, right).differences, 'orders', 'index', 'a_1').kind).toBe('same');
  });
});

type CollectionSearch = NonNullable<Parameters<typeof collection>[1]>['searchIndexes'] extends
  readonly (infer T)[] | undefined
  ? T
  : never;
