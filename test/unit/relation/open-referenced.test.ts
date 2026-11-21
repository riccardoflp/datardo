import { describe, expect, it } from 'vitest';
import { openFilteredAction } from '../../../src/features/relation/model/open-filtered';
import { plan } from '../../../src/features/relation/open-referenced';
import { collectionReferences } from '../../../src/features/relation/targets';
import type { Answers, Outcome } from '../../../src/shared/feature';
import type { Json } from '../../../src/shared/engine-request';
import { ada, contextOn, local, oid, planOf, questionOf, shopReferences } from './context';

const outgoing = collectionReferences(shopReferences, 'orders').outgoing;

function follow(path: string, value: Json, more: Answers = {}, label?: string): Outcome {
  const args = {
    connection: local.id,
    database: 'shop',
    outgoing,
    path,
    value,
    ...(label === undefined ? {} : { label }),
  };
  return plan(contextOn('relation.open-referenced'), { args, ...more });
}

describe('relation.open-referenced', () => {
  it('opens shop.users with the filter of the customer, then runs the query', () => {
    const opened = planOf(follow('customer', ada));
    expect(opened.steps).toEqual([
      {
        kind: 'app',
        text: 'open shop.users with the filter { _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }',
        action: openFilteredAction,
        args: {
          connection: local.id,
          database: 'shop',
          collection: 'users',
          filter: '{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }',
          filterJson: { _id: ada },
          sort: '',
          projection: '',
        },
      },
    ]);
    // The window shows the filter in the bar of the tab and runs it: the plan starts nothing after its step.
    expect(opened.after).toEqual([]);
    expect(opened.danger).toEqual({ kind: 'none' });
    expect(opened.undo).toEqual({ cannot: 'Nothing is written; Back returns to where you were.' });
  });

  it('opens the 3 values of a cell holding 3 references with $in', () => {
    const opened = planOf(follow('tagIds', [oid('01'), oid('02'), oid('03')]));
    expect(opened.steps[0]).toMatchObject({
      args: { collection: 'tags', filterJson: { _id: { $in: [oid('01'), oid('02'), oid('03')] } } },
    });
  });

  it('asks where to open a field that refers to users and admins, and opens the one chosen', () => {
    const question = questionOf(follow('owner', ada));
    expect(question.fields[0]).toMatchObject({
      kind: 'pick-one',
      key: 'target',
      label: 'Open the referenced document in',
    });
    const field = question.fields[0];
    expect(field?.kind === 'pick-one' ? field.choices.map((choice) => choice.label) : []).toEqual([
      'users._id',
      'admins._id',
    ]);
    expect(planOf(follow('owner', ada, { target: 'admins._id' })).steps[0]).toMatchObject({
      args: { collection: 'admins' },
    });
  });

  it('opens nothing when the question is closed', () => {
    expect(planOf(follow('owner', ada, { target: null })).steps).toEqual([]);
  });

  it('opens the collection a line names without asking', () => {
    expect(planOf(follow('owner', ada, {}, 'users._id')).steps[0]).toMatchObject({ args: { collection: 'users' } });
  });

  it('opens a reference to a unique field on that field', () => {
    expect(planOf(follow('customerEmail', 'ada@example.com')).steps[0]).toMatchObject({
      args: { collection: 'users', filter: '{ email: "ada@example.com" }' },
    });
  });

  it('is allowed on a read-only connection: it writes nothing', () => {
    expect(planOf(follow('customer', ada)).steps.every((step) => step.kind === 'app')).toBe(true);
  });
});
