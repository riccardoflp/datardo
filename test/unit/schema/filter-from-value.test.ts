import { describe, expect, it } from 'vitest';
import { conditionOf, mergedCondition, plan, setFilterAction } from '../../../src/features/schema/filter-from-value';
import type { SchemaClick } from '../../../src/features/schema/filter-from-value';
import type { Json } from '../../../src/shared/engine-request';
import type { Outcome, Plan } from '../../../src/shared/feature';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { contextInTab, contextOn, int } from './context';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The filter the plan of a click sets, as the query bar shows it, and the filter as Extended JSON. */
function clicked(filter: string, path: string, click: SchemaClick): { readonly text: string; readonly json: Json } {
  const outcome = plan(contextOn('schema.filter-from-value'), { args: { filter, path, click } });
  const [step] = planOf(outcome).steps;
  if (step?.kind !== 'app') {
    throw new Error('Expected an app step');
  }
  const args = step.args as { readonly filter: string; readonly filterJson: Json };
  return { text: args.filter, json: args.filterJson };
}

/** The filter after a click, on one line in mongosh syntax. */
function after(filter: string, path: string, click: SchemaClick): string {
  return mongoshValue(clicked(filter, path, click).json);
}

const paid: SchemaClick = { kind: 'value', value: 'paid' };
const ageRange: SchemaClick = { kind: 'range', from: int(15), to: int(20) };

describe('schema.filter-from-value', () => {
  it('makes an empty filter { status: "paid" } in one app step, then analyzes again', () => {
    const outcome = planOf(
      plan(contextInTab('schema.filter-from-value'), {
        args: { filter: '', path: 'status', click: paid, size: 100 },
      }),
    );
    expect(outcome.steps).toHaveLength(1);
    expect(outcome.steps[0]).toMatchObject({
      kind: 'app',
      text: 'add status: "paid" to the filter of orders',
      action: setFilterAction,
      args: {
        connection: 'c-local',
        database: 'shop',
        collection: 'orders',
        tab: 't1',
        filterJson: { status: 'paid' },
      },
    });
    expect(outcome.after).toEqual([
      {
        kind: 'start',
        feature: 'schema.sample',
        target: expect.objectContaining({ kind: 'collection', collection: 'orders' }) as unknown,
        args: { tab: 't1', filter: expect.stringContaining('status: "paid"') as unknown, size: 100 },
      },
    ]);
    expect(outcome.danger).toEqual({ kind: 'none' });
    expect(outcome.undo).toEqual({
      cannot: 'It changes the filter of the tab, not a deployment, so nothing is recorded.',
    });
  });

  it('adds the range of a bar, then merges the type into it, then replaces the value of status', () => {
    const first = after('{ status: "paid" }', 'age', ageRange);
    expect(first).toBe('{ status: "paid", age: { $gte: 15, $lt: 20 } }');
    const second = after(first, 'age', { kind: 'type', type: 'int' });
    expect(second).toBe('{ status: "paid", age: { $gte: 15, $lt: 20, $type: "int" } }');
    expect(after(second, 'status', { kind: 'value', value: 'new' })).toBe(
      '{ status: "new", age: { $gte: 15, $lt: 20, $type: "int" } }',
    );
  });

  it('gives each click of the card its condition', () => {
    const at: SchemaClick = {
      kind: 'range',
      from: { $date: { $numberLong: String(Date.UTC(2024, 0, 18)) } },
      to: { $date: { $numberLong: String(Date.UTC(2024, 1, 17)) } },
    };
    expect(after('', 'at', at)).toBe(
      '{ at: { $gte: ISODate("2024-01-18T00:00:00.000Z"), $lt: ISODate("2024-02-17T00:00:00.000Z") } }',
    );
    expect(after('', 'total', { kind: 'type', type: 'double' })).toBe('{ total: { $type: "double" } }');
    expect(after('', 'tags', { kind: 'value', value: 'a' })).toBe('{ tags: "a" }');
    expect(after('', 'items.sku', { kind: 'value', value: 'A1' })).toBe('{ "items.sku": "A1" }');
  });

  it('adds an ObjectId as an ObjectId and a long value as a number that matches it', () => {
    const id = { $oid: '65f1c0de9a1b2c3d4e5f6a01' };
    expect(clicked('', '_id', { kind: 'value', value: id }).json).toEqual({ _id: id });
    expect(after('', '_id', { kind: 'value', value: id })).toBe('{ _id: ObjectId("65f1c0de9a1b2c3d4e5f6a01") }');
    const long = { $numberLong: '5' };
    expect(clicked('', 'qty', { kind: 'value', value: long }).json).toEqual({ qty: long });
  });

  it('writes the filter as the query bar formats a filter it changes', () => {
    const { text } = clicked('{ status: "paid" }', 'age', ageRange);
    expect(text).toContain('status: "paid"');
    expect(text).toContain('$gte: 15');
  });

  it('adds nothing to the filter { status: and says why', () => {
    const outcome = plan(contextOn('schema.filter-from-value'), {
      args: { filter: '{ status: ', path: 'status', click: paid },
    });
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'schema.filter-from-value/invalid-filter' });
    expect(outcome.kind === 'refuse' ? outcome.message : '').toMatch(
      /^Fix the filter before adding conditions by drag & drop: ./u,
    );
    const notObject = plan(contextOn('schema.filter-from-value'), {
      args: { filter: '[1]', path: 'status', click: paid },
    });
    expect(notObject.kind === 'refuse' ? notObject.message : '').toBe(
      'Fix the filter before adding conditions by drag & drop: must be an object',
    );
  });

  it('sends nothing to the server itself: one app step, and the sample read after it', () => {
    const outcome = planOf(
      plan(contextOn('schema.filter-from-value', true), { args: { path: 'status', click: paid } }),
    );
    expect(outcome.steps.map((step) => step.kind)).toEqual(['app']);
    expect(outcome.after.map((each) => (each.kind === 'start' ? each.feature : each.kind))).toEqual(['schema.sample']);
  });

  it('plans nothing without a path or a click', () => {
    expect(planOf(plan(contextOn('schema.filter-from-value'), { args: { path: 'status' } })).steps).toEqual([]);
  });

  it('merges operators with operators, and lets a value replace them, a new field going last', () => {
    expect(conditionOf({ kind: 'type', type: 'string' })).toEqual({ $type: 'string' });
    const filter = { a: { $gte: int(1), $lt: int(5) }, b: 'x' };
    expect(mergedCondition(filter, 'a', { $lt: int(9) })).toEqual({ a: { $gte: int(1), $lt: int(9) }, b: 'x' });
    expect(mergedCondition(filter, 'a', int(3))).toEqual({ a: int(3), b: 'x' });
    expect(mergedCondition({ d: { $date: { $numberLong: '0' } } }, 'd', { $gte: int(1) })).toEqual({
      d: { $gte: int(1) },
    });
    expect(Object.keys(mergedCondition(filter, 'c', 'y'))).toEqual(['a', 'b', 'c']);
  });
});
