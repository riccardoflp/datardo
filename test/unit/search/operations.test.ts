import { describe, expect, it } from 'vitest';
import { plan as copyId } from '../../../src/features/search/copy-id';
import { plan as openInCollection } from '../../../src/features/search/open-in-collection';
import { wanted } from '../../../src/features/search/text';
import { matches } from '../../../src/features/search/match';
import type { Json } from '../../../src/shared/engine-request';
import type { AppStep } from '../../../src/shared/feature';
import { contextOn, int, local, long, objectId, planOf, production, uuid } from './context';

const first = objectId('65f1c0a2b3d4e5f6a7b8c9d0');
const second = objectId('65f1c0a2b3d4e5f6a7b8c9d1');
const third = objectId('65f1c0a2b3d4e5f6a7b8c9d2');

function opened(args: Readonly<Record<string, Json>>, on = local) {
  const context = contextOn('search.open-in-collection', { kind: 'connection', connection: on.id });
  return planOf(
    openInCollection(context, { args: { connection: on.id, database: 'shop', collection: 'orders', ...args } }),
  );
}

function stepOf(steps: readonly unknown[]): AppStep {
  const [step] = steps as readonly AppStep[];
  if (step?.kind !== 'app') {
    throw new Error('Expected an app step');
  }
  return step;
}

describe('search.open-in-collection', () => {
  it('opens shop.orders filtered on the three _ids of its group, and runs the query', () => {
    const plan = opened({ ids: [first, second, third], found: 3 });
    const step = stepOf(plan.steps);
    expect(step.text).toBe(
      'open shop.orders with the filter { _id: { $in: [ObjectId("65f1c0a2b3d4e5f6a7b8c9d0"), ObjectId("65f1c0a2b3d4e5f6a7b8c9d1"), ObjectId("65f1c0a2b3d4e5f6a7b8c9d2")] } }',
    );
    expect(step.args).toMatchObject({ filterJson: { _id: { $in: [first, second, third] } }, sort: '', projection: '' });
    expect(plan.after).toEqual([
      {
        kind: 'start',
        feature: 'query.run',
        target: { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' },
      },
    ]);
    expect(plan.danger).toEqual({ kind: 'none' });
  });

  it('filters on one _id without $in for a group of one document', () => {
    const step = stepOf(opened({ ids: [first], found: 1 }).steps);
    expect(step.text).toBe('open shop.orders with the filter { _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") }');
  });

  it('keeps 1,000 _ids of 2,345 and says so in a notification', () => {
    const ids = Array.from({ length: 1000 }, (_, index) => int(index));
    const plan = opened({ ids, found: 2345 });
    const step = stepOf(plan.steps);
    expect((step.args as { filterJson: { _id: { $in: readonly Json[] } } }).filterJson._id.$in).toHaveLength(1000);
    expect(step.text).toContain(', … and 990 more] } }');
    expect(plan.after).toContainEqual({
      kind: 'notify',
      level: 'info',
      text: 'orders: the filter has the first 1,000 of 2,345 matching documents.',
    });
  });

  it('opens one item alone from its menu, whatever the number of documents of its group', () => {
    const plan = opened({ id: second });
    expect(stepOf(plan.steps).text).toBe(
      'open shop.orders with the filter { _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d1") }',
    );
    expect(plan.after.filter((each) => each.kind === 'notify')).toEqual([]);
  });

  it('writes each _id with its type', () => {
    const texts = [long('42'), 'A-17', uuid('3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f'), { a: int(1), b: int(2) }].map(
      (id) => stepOf(opened({ id }).steps).text,
    );
    expect(texts).toEqual([
      'open shop.orders with the filter { _id: NumberLong(42) }',
      'open shop.orders with the filter { _id: "A-17" }',
      'open shop.orders with the filter { _id: UUID("3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f") }',
      'open shop.orders with the filter { _id: { a: 1, b: 2 } }',
    ]);
  });

  it('filters on the documents found so far while the search runs', () => {
    expect(stepOf(opened({ ids: [first, second], found: 2 }).steps).args).toMatchObject({
      filterJson: { _id: { $in: [first, second] } },
    });
  });

  it('works on a read-only connection', () => {
    const plan = opened({ ids: [first], found: 1 }, production);
    expect(plan.steps).toHaveLength(1);
  });
});

describe('search.copy-id', () => {
  function copied(id: Json) {
    return planOf(copyId(contextOn('search.copy-id'), { args: { id } }));
  }

  it('copies exactly ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") and says Copied to the clipboard', () => {
    const plan = copied(first);
    expect(stepOf(plan.steps)).toMatchObject({
      text: 'copy ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") to the clipboard',
      action: 'nav.copy',
      args: { text: 'ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")' },
    });
    expect(plan.after).toEqual([{ kind: 'notify', level: 'info', text: 'Copied to the clipboard' }]);
  });

  it('copies a string _id with its quotes', () => {
    expect(stepOf(copied('A-17').steps).args).toEqual({ text: '"A-17"' });
  });

  it('copies what finds the same document again when pasted in the text of the page', () => {
    const text = (stepOf(copied(first).steps).args as { text: string }).text;
    expect(matches({ _id: first, name: 'x' }, wanted(text, 'contains', false), false)?.matches[0]?.path).toBe('_id');
  });

  it('neither selects the item nor opens the document', () => {
    const plan = copied(first);
    expect(plan.steps).toHaveLength(1);
    expect(plan.after.some((each) => each.kind === 'start' || each.kind === 'open')).toBe(false);
  });
});
