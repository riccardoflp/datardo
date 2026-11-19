import { describe, expect, it } from 'vitest';
import { optionsOf, plan } from '../../../src/features/manage/create-collection';
import type { EngineStep, Plan } from '../../../src/shared/feature';
import { collectionTab, listed, manageContext, planOf, questionOf, readOf, started } from './harness';

const context = manageContext('manage.create-collection');
const collections = listed([
  ['orders', 'collection'],
  ['recent', 'view'],
]);

function created(options?: unknown): Plan {
  return planOf(plan(context, started({ database: 'shop' }, { collections, name: 'log', options })));
}

describe('manage.create-collection', () => {
  it('reads the collections of the database, then asks the name and the options', () => {
    expect(readOf(plan(context, started({ database: 'shop' })))).toMatchObject({
      key: 'collections',
      read: 'tree.list-collections',
      args: { connection: 'c-local', database: 'shop' },
    });
    const question = questionOf(plan(context, started({ database: 'shop' }, { collections })));
    expect(question.title).toBe('Create collection in shop');
    expect(question.fields[1]).toMatchObject({
      label: 'Options, optional: leave empty for a regular collection',
      placeholder: '{ capped: true, size: 1048576 }  or  { timeseries: { timeField: "ts" } }',
    });
  });

  it('creates a regular collection with empty options: db.createCollection("orders")', () => {
    const plain = planOf(plan(context, started({ database: 'shop' }, { collections: listed([]), name: 'orders' })));
    expect(plain.steps.map((step) => step.text)).toEqual(['db.createCollection("orders")']);
    expect(plain.after[0]).toEqual({ kind: 'refresh', connection: 'c-local' });
    expect(plain.after.some((after) => after.kind === 'start')).toBe(false);
    expect(created('').steps[0]?.text).toBe('db.createCollection("log")');
  });

  it('creates a capped collection of 1 MB', () => {
    expect(created({ capped: true, size: 1048576 }).steps[0]?.text).toBe(
      'db.createCollection("log", { capped: true, size: 1048576 })',
    );
  });

  it('creates a time series collection', () => {
    expect(created({ timeseries: { timeField: 'ts' } }).steps[0]?.text).toBe(
      'db.createCollection("log", { timeseries: { timeField: "ts" } })',
    );
  });

  it('creates a view on orders, as the same call does in mongosh', () => {
    const options = { viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] };
    expect(created(options).steps[0]?.text).toBe(
      'db.createCollection("log", { viewOn: "orders", pipeline: [{ $match: { status: "paid" } }] })',
    );
  });

  it('sends size as a 64-bit integer when written NumberLong(1048576)', () => {
    const options = { size: { $numberLong: '1048576' }, capped: true };
    const [step] = created({ kind: 'value', value: options }).steps as readonly EngineStep[];
    expect(step?.request).toMatchObject({ method: 'createCollection', arguments: ['log', options] });
    expect(step?.text).toBe('db.createCollection("log", { size: Long("1048576"), capped: true })');
  });

  it('shows Options must be an object for [1] and 5, and cannot accept them', () => {
    expect(optionsOf('[1]')).toEqual({ problem: 'Options must be an object' });
    expect(optionsOf('5')).toEqual({ problem: 'Options must be an object' });
    expect(optionsOf({ kind: 'invalid', message: 'Unexpected token' })).toEqual({
      problem: 'Options: Unexpected token',
    });
    const answers = started({ database: 'shop' }, { collections, name: 'log', options: '[1]' });
    expect(questionOf(plan(context, answers)).text).toBe('Options must be an object');
  });

  it('shows This collection already exists, and the messages of manage.name-rules', () => {
    const again = questionOf(plan(context, started({ database: 'shop' }, { collections, name: 'orders' })));
    expect(again.text).toBe('This collection already exists');
    const reserved = questionOf(plan(context, started({ database: 'shop' }, { collections, name: 'system.x' })));
    expect(reserved.text).toBe('Names starting with "system." are reserved');
  });

  it('from Go to, takes the database of the active tab, or asks to pick one', () => {
    const onTab = manageContext('manage.create-collection', [collectionTab(1, 'orders')], { kind: 'app' });
    expect(readOf(plan(onTab, {})).args).toMatchObject({ database: 'shop' });
    const none = manageContext('manage.create-collection', [], { kind: 'app' });
    const current = { ...none, state: { ...none.state, nav: { ...none.state.nav, current: 'c-local' as never } } };
    expect(readOf(plan(current, {}))).toMatchObject({ key: 'databases', read: 'tree.list-databases' });
    const pick = questionOf(plan(current, { databases: [{ name: 'shop' }, { name: 'test' }] }));
    expect(pick.fields[0]).toMatchObject({
      kind: 'pick-one',
      key: 'database',
      choices: [{ value: 'shop' }, { value: 'test' }],
    });
    expect(readOf(plan(current, { databases: [{ name: 'shop' }], database: 'shop' })).args).toMatchObject({
      database: 'shop',
    });
  });

  it('is refused on a read-only connection', () => {
    expect(plan(context, started({ connection: 'c-production', database: 'shop' }))).toEqual({
      kind: 'refuse',
      code: 'manage.create-collection/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
