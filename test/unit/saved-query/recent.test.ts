import { describe, expect, it } from 'vitest';
import { plan as clearPlan } from '../../../src/features/saved-query/clear-recent';
import { plan, sameQuery, withRecent } from '../../../src/features/saved-query/recent';
import { plan as removePlan } from '../../../src/features/saved-query/remove-recent';
import type { RecentQuery } from '../../../src/features/saved-query/types';
import {
  answersWith,
  appArgs,
  contextOn,
  find,
  listOf,
  mine,
  now,
  pipeline,
  planOf,
  production,
  queryArgs,
  stepTexts,
} from './harness';

function recentAfter(outcome: ReturnType<typeof plan>): readonly RecentQuery[] {
  return appArgs(outcome, 'saved-query.set-recent')['recent'] as readonly RecentQuery[];
}

const paid = find('{ status: "paid" }');

describe('saved-query.recent', () => {
  it('reads the queries of the collection, then puts the query that ran first, on Local / shop / orders only', () => {
    const answers = answersWith(queryArgs(paid));
    expect(plan(contextOn('saved-query.recent'), answers)).toEqual({
      kind: 'read',
      need: {
        key: 'list',
        read: 'saved-query.list',
        args: { connection: 'c-local', database: 'shop', collection: 'orders' },
      },
    });
    const outcome = plan(contextOn('saved-query.recent'), { ...answers, list: listOf() });
    expect(stepTexts(outcome)).toEqual(['add the query to the recent queries of Local / shop / orders']);
    expect(appArgs(outcome, 'saved-query.set-recent')).toMatchObject({
      connection: 'c-local',
      database: 'shop',
      collection: 'orders',
    });
    expect(recentAfter(outcome)).toEqual([{ query: paid, at: now }]);
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
  });

  it('keeps one recent query when {status:\'paid\'} runs after { status: "paid" }: the new text, first', () => {
    const list = listOf(
      [],
      [
        { query: paid, at: now - 5000 },
        { query: find('{ a: 1 }'), at: now - 9000 },
      ],
    );
    const again = find("{status:'paid'}");
    const outcome = plan(contextOn('saved-query.recent'), answersWith(queryArgs(again), { list }));
    expect(recentAfter(outcome)).toEqual([
      { query: again, at: now },
      { query: find('{ a: 1 }'), at: now - 9000 },
    ]);
  });

  it('adds a second recent query when the same filter runs with another sort', () => {
    const list = listOf([], [{ query: paid, at: now - 5000 }]);
    const outcome = plan(
      contextOn('saved-query.recent'),
      answersWith(queryArgs(find('{ status: "paid" }', '{ a: -1 }')), { list }),
    );
    expect(recentAfter(outcome)).toHaveLength(2);
  });

  it('keeps 50: a 51st that is new drops the one that ran longest ago', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => ({
      query: find(`{ n: ${String(index)} }`),
      at: now - index - 1,
    }));
    const outcome = plan(contextOn('saved-query.recent'), answersWith(queryArgs(paid), { list: listOf([], fifty) }));
    const after = recentAfter(outcome);
    expect(after).toHaveLength(50);
    expect(after[0]?.query).toEqual(paid);
    expect(after.some((each) => each.query.kind === 'find' && each.query.filter === '{ n: 49 }')).toBe(false);
  });

  it('adds neither a find with everything empty nor a pipeline whose stages are all disabled', () => {
    for (const query of [find('  ', '', '\n'), pipeline(['$match', '{}', false], ['$sort', '{ a: 1 }', false])]) {
      const outcome = plan(contextOn('saved-query.recent'), answersWith(queryArgs(query), { list: listOf() }));
      expect(planOf(outcome).steps).toEqual([]);
    }
  });

  it('keeps a pipeline with its disabled stage, still disabled, and its names trimmed, bodies as typed', () => {
    const query = pipeline([' $match ', '{ a: 1 } '], ['$sort', '{ a: 1 }', false]);
    const outcome = plan(contextOn('saved-query.recent'), answersWith(queryArgs(query), { list: listOf() }));
    expect(recentAfter(outcome)[0]?.query).toEqual(pipeline(['$match', '{ a: 1 } '], ['$sort', '{ a: 1 }', false]));
  });

  it('keeps a find without the spaces around its texts', () => {
    const outcome = plan(
      contextOn('saved-query.recent'),
      answersWith(queryArgs(find('  { a: 1 }\n', ' { b: 1 } ')), { list: listOf() }),
    );
    expect(recentAfter(outcome)[0]?.query).toEqual(find('{ a: 1 }', '{ b: 1 }'));
  });

  it('is on the connection it ran on only', () => {
    const answers = answersWith({ ...queryArgs(paid), connection: production.id });
    expect(stepTexts(plan(contextOn('saved-query.recent'), { ...answers, list: listOf() }))).toEqual([
      'add the query to the recent queries of Production / shop / orders',
    ]);
  });

  it('compares queries by their values: a find and a pipeline are never the same', () => {
    expect(sameQuery(find('{a:1}', '{ b: -1 }'), find('{ "a": 1 }', "{'b':-1}"))).toBe(true);
    expect(sameQuery(find('{ a: 1, b: 2 }'), find('{ b: 2, a: 1 }'))).toBe(false);
    expect(sameQuery(find('{ a: '), find(' { a: '))).toBe(true);
    expect(sameQuery(find('{ a: '), find('{ b: '))).toBe(false);
    expect(sameQuery(find('{}'), pipeline(['$match', '{}']))).toBe(false);
    expect(sameQuery(pipeline(['$match', '{a:1}']), pipeline([' $match', '{ a: 1 }']))).toBe(true);
    expect(sameQuery(pipeline(['$match', '{a:1}']), pipeline(['$match', '{a:1}', false]))).toBe(false);
    expect(sameQuery(pipeline(['$match', '{a:1}']), pipeline(['$match', '{a:1}'], ['$limit', '1']))).toBe(false);
  });

  it('moves a query that was there to the front instead of keeping it twice', () => {
    const older: RecentQuery = { query: paid, at: 1 };
    expect(withRecent([older], { query: find('{status:"paid"}'), at: 2 })).toEqual([
      { query: find('{status:"paid"}'), at: 2 },
    ]);
  });
});

describe('saved-query.remove-recent', () => {
  const three = [
    { query: find('{ a: 1 }'), at: now - 1000 },
    { query: find('{ b: 1 }'), at: now - 2000 },
    { query: find('{ c: 1 }'), at: now - 3000 },
  ];

  it('removes the second of three recent queries and leaves the other two in their order, at once', () => {
    const outcome = removePlan(
      contextOn('saved-query.remove-recent'),
      answersWith(queryArgs(find('{ b: 1 }')), { list: listOf([], three) }),
    );
    expect(stepTexts(outcome)).toEqual(['remove a query from the recent queries of Local / shop / orders']);
    expect(appArgs(outcome, 'saved-query.set-recent')['recent']).toEqual([three[0], three[2]]);
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
  });

  it('changes neither the saved queries nor the query of the tab', () => {
    const outcome = removePlan(
      contextOn('saved-query.remove-recent'),
      answersWith(queryArgs(find('{ a: 1 }')), { list: listOf([mine('A', find('{ a: 1 }'))], three) }),
    );
    expect(planOf(outcome).steps.map((step) => (step.kind === 'app' ? step.action : step.kind))).toEqual([
      'saved-query.set-recent',
    ]);
    expect(planOf(outcome).after).toEqual([]);
  });

  it('removes the last recent query, leaving none', () => {
    const outcome = removePlan(
      contextOn('saved-query.remove-recent'),
      answersWith(queryArgs(find('{ a: 1 }')), { list: listOf([], [three[0] as RecentQuery]) }),
    );
    expect(appArgs(outcome, 'saved-query.set-recent')['recent']).toEqual([]);
  });
});

describe('saved-query.clear-recent', () => {
  it('asks "Clear the recent queries of orders?" with "Saved queries are kept." and the button Clear', () => {
    const outcome = clearPlan(contextOn('saved-query.clear-recent'), answersWith({}));
    expect(planOf(outcome)).toMatchObject({
      title: 'Clear the recent queries of orders?',
      danger: { kind: 'confirm', text: 'Saved queries are kept.', button: 'Clear' },
      undo: { cannot: 'The recent queries are forgotten.' },
    });
    expect(stepTexts(outcome)).toEqual(['clear the recent queries of Local / shop / orders']);
  });

  it('empties the recent queries of this collection of this connection only, and touches no saved query', () => {
    const outcome = clearPlan(contextOn('saved-query.clear-recent'), answersWith({}));
    expect(planOf(outcome).steps).toHaveLength(1);
    expect(appArgs(outcome, 'saved-query.set-recent')).toEqual({
      connection: 'c-local',
      database: 'shop',
      collection: 'orders',
      recent: [],
    });
  });
});
