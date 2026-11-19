import { describe, expect, it } from 'vitest';
import { afterReplies, countsKey, dropsKey, plan } from '../../../src/features/structure/apply';
import { diffStructure } from '../../../src/features/structure/steps';
import type { StructureDifference } from '../../../src/features/structure/types';
import type { Danger, EngineStep, Outcome, Plan } from '../../../src/shared/feature';
import {
  collection,
  contextWith,
  database,
  dev,
  differenceOf,
  index,
  int,
  pageStart,
  planOf,
  production,
  questionOf,
  refusalOf,
  view,
  workedExample,
} from './build';

const context = contextWith('structure.apply');

function applied(
  differences: readonly StructureDifference[],
  more: Readonly<Record<string, unknown>> = {},
  answers: Readonly<Record<string, unknown>> = {},
): Outcome {
  return plan(context, pageStart(differences, more, answers));
}

function stepTexts(planned: Plan): readonly string[] {
  return planned.steps.map((step) => step.text);
}

function confirmation(planned: Plan): Exclude<Danger, { readonly kind: 'none' }> {
  if (planned.danger.kind === 'none') {
    throw new Error('Expected a confirmation.');
  }
  return planned.danger;
}

const statusIndex = (): StructureDifference => differenceOf(workedExample(), 'orders', 'index', 'status_1');

describe('structure.apply', () => {
  it('asks to apply an index missing on the right with Apply, and creates it with its keys, name and options', () => {
    const planned = planOf(applied(workedExample(), { chosen: [statusIndex().id] }));
    expect(planned.title).toBe('Apply to Production › shop: orders index status_1');
    expect(confirmation(planned)).toEqual({
      kind: 'confirm',
      text: [
        'Apply to Production › shop: orders index status_1?',
        '1 change: createIndex.',
        "Index builds can take a while on large collections. These changes can't be undone from the undo history.",
      ].join('\n'),
      button: 'Apply',
    });
    expect(planned.steps).toHaveLength(1);
    const step = planned.steps[0] as EngineStep;
    expect(step).toMatchObject({
      kind: 'engine',
      connection: 'c-prod',
      writes: true,
      text: 'db.getCollection("orders").createIndex({ status: 1 })',
      group: 'orders index status_1',
      request: {
        engine: 'mongodb',
        database: 'shop',
        method: 'runCommand',
        arguments: [{ createIndexes: 'orders', indexes: [{ key: { status: int(1) }, name: 'status_1' }] }],
      },
    });
  });

  it('asks with Drop for an index with the same keys and another name', () => {
    const differences = diffStructure(
      database([collection('orders', { indexes: [index('byStatus', { status: int(1) })] })]),
      database([collection('orders', { indexes: [index('status_1', { status: int(1) })] })]),
    ).differences;
    const pair = differenceOf(differences, 'orders', 'index', 'byStatus');
    const planned = planOf(applied(differences, { chosen: [pair.id] }));
    const asked = confirmation(planned);
    expect(asked.kind).toBe('confirm');
    expect(asked.button).toBe('Drop');
    expect(asked.text.split('\n')).toContain('2 steps drop something: dropIndex, createIndex.');
    expect(stepTexts(planned)).toEqual([
      'db.getCollection("orders").dropIndex("status_1")',
      'db.getCollection("orders").createIndex({ status: 1 }, { name: "byStatus" })',
    ]);
  });

  it('asks Apply all… whether to apply the drops, Apply without drops first', () => {
    const question = questionOf(applied(workedExample()));
    expect(question.title).toBe('Apply all…');
    expect(question.text).toBe('2 steps drop something: drop, dropIndex.');
    expect(question.fields).toEqual([
      {
        kind: 'pick-one',
        key: dropsKey,
        label: 'Apply all…',
        choices: [
          { value: 'without', label: 'Apply without drops' },
          { value: 'including', label: 'Apply including drops' },
        ],
        default: 'without',
      },
    ]);
  });

  it('applies all without drops: creates and changes, leaves what is only on the right, never asks for a name', () => {
    const planned = planOf(applied(workedExample(), {}, { [dropsKey]: 'without' }));
    expect(planned.title).toBe('Make Production › shop like Dev › shop');
    expect(stepTexts(planned)).toEqual([
      'db.getCollection("orders").createIndex({ status: 1 })',
      'db.runCommand({ collMod: "users", validator: {} })',
      'db.createView("recent", "orders", [{ $sort: { date: -1 } }])',
      'db.createView("big", "recent", [{ $match: { total: { $gt: 100 } } }])',
    ]);
    const asked = confirmation(planned);
    expect(asked.kind).toBe('confirm');
    expect(asked.button).toBe('Apply');
    expect(asked.text).not.toContain('drop something');
  });

  it('applies all including drops in the order of the script, after reading how many documents are lost', () => {
    const before = applied(workedExample(), {}, { [dropsKey]: 'including' });
    expect(before).toEqual({
      kind: 'read',
      need: {
        key: countsKey,
        read: 'tree.count',
        args: { connection: 'c-prod', database: 'shop', collections: ['legacy'] },
      },
    });
    const planned = planOf(applied(workedExample(), {}, { [dropsKey]: 'including', [countsKey]: { legacy: 1204 } }));
    expect(stepTexts(planned)).toEqual([
      'db.getCollection("orders").createIndex({ status: 1 })',
      'db.runCommand({ collMod: "users", validator: {} })',
      'db.createView("recent", "orders", [{ $sort: { date: -1 } }])',
      'db.createView("big", "recent", [{ $match: { total: { $gt: 100 } } }])',
      'db.getCollection("legacy").drop()',
      'db.getCollection("orders").dropIndex("old_1")',
    ]);
    expect(confirmation(planned)).toEqual({
      kind: 'destructive',
      text: [
        'Make Production › shop like Dev › shop?',
        '4 changes: createIndex, collMod, createCollection ×2.',
        '2 steps drop something: drop, dropIndex.',
        'legacy is dropped with its 1,204 documents and indexes.',
        "Index builds can take a while on large collections. These changes can't be undone from the undo history.",
      ].join('\n'),
      button: 'Apply including drops',
      name: 'legacy',
    });
    expect(planned.steps.map((step) => (step as EngineStep).group)).toEqual([
      'orders index status_1',
      'users options',
      'recent view',
      'big view',
      'legacy collection',
      'orders index old_1',
    ]);
  });

  it('asks to type legacy to drop the collection only on the right, and says how many documents it has', () => {
    const legacy = differenceOf(workedExample(), 'legacy', 'collection');
    const planned = planOf(applied(workedExample(), { chosen: [legacy.id] }, { [countsKey]: { legacy: 3 } }));
    expect(stepTexts(planned)).toEqual(['db.getCollection("legacy").drop()']);
    const asked = confirmation(planned);
    expect(asked).toMatchObject({ kind: 'destructive', name: 'legacy', button: 'Drop' });
    expect(asked.text).toContain('legacy is dropped with its 3 documents and indexes.');
  });

  it('asks to type the name of the right database when several collections are dropped', () => {
    const differences = diffStructure(database([]), database([collection('legacy'), collection('tmp')])).differences;
    const planned = planOf(applied(differences, {}, { [countsKey]: { legacy: 1, tmp: 0 } }));
    expect(confirmation(planned)).toMatchObject({ kind: 'destructive', name: 'shop', button: 'Apply drops' });
  });

  it('asks for no name to drop a view, an index or a search index only on the right', () => {
    const differences = diffStructure(
      database([collection('orders', { searchIndexes: [] })], { search: 'ok' }),
      database(
        [
          collection('orders', {
            indexes: [index('old_1', { old: int(1) })],
            searchIndexes: [{ name: 'default', type: 'search', definition: { mappings: { dynamic: true } } }],
          }),
          view('stale', 'orders'),
        ],
        { search: 'ok' },
      ),
    ).differences;
    for (const difference of differences.filter((each) => each.kind === 'only-right')) {
      const outcome = applied(differences, { chosen: [difference.id] });
      expect(outcome.kind).toBe('run');
      expect(confirmation(planOf(outcome)).kind).toBe('confirm');
    }
    expect(differences.filter((each) => each.kind === 'only-right')).toHaveLength(3);
  });

  it('asks nothing first when no step drops something, and when every step does (Apply drops)', () => {
    const creating = diffStructure(database([collection('a'), collection('b')]), database([])).differences;
    expect(confirmation(planOf(applied(creating))).button).toBe('Apply');
    const dropping = diffStructure(
      database([collection('a', { indexes: [] })]),
      database([collection('a', { indexes: [index('x_1', { x: int(1) }), index('y_1', { y: int(1) })] })]),
    ).differences;
    const planned = planOf(applied(dropping));
    expect(confirmation(planned)).toMatchObject({ kind: 'confirm', button: 'Apply drops' });
    expect(stepTexts(planned)).toHaveLength(2);
  });

  it('applies the steps of one difference all, its drops included, with Apply and drop', () => {
    const differences = diffStructure(
      database([collection('orders'), view('recent', 'orders')]),
      database([collection('orders'), collection('recent')]),
    ).differences;
    const recent = differenceOf(differences, 'recent', 'view');
    const outcome = applied(differences, { chosen: [recent.id] });
    expect(outcome).toMatchObject({ kind: 'read', need: { args: { collections: ['recent'] } } });
    const planned = planOf(applied(differences, { chosen: [recent.id] }, { [countsKey]: { recent: 0 } }));
    expect(stepTexts(planned)).toEqual(['db.getCollection("recent").drop()', 'db.createView("recent", "orders", [])']);
    expect(confirmation(planned).button).toBe('Drop');
  });

  it('leaves out what only a script comment can solve, and says how many', () => {
    const differences = diffStructure(
      database([collection('a', { options: { collation: { locale: 'fr' } } }), collection('b')]),
      database([collection('a')]),
    ).differences;
    const collation = differenceOf(differences, 'a', 'options');
    expect(refusalOf(applied(differences, { chosen: [collation.id] }))).toEqual({
      code: 'structure.apply/no-command',
      message: "These differences can't be applied by a command: the script says what to do.",
    });
    const planned = planOf(applied(differences));
    expect(stepTexts(planned)).toEqual(['db.createCollection("b")']);
    expect(confirmation(planned).text).toContain(
      "1 difference can't be applied by a command and is left out (the script says what to do).",
    );
  });

  it('is refused on a read-only right connection', () => {
    const outcome = plan(contextWith('structure.apply', [dev, production]), pageStart(workedExample()));
    expect(refusalOf(outcome)).toEqual({
      code: 'structure.apply/read-only',
      message: "The connection Production is read-only. Its structure can't be changed.",
    });
  });

  it('is refused while a comparison runs, and when the differences are no longer there', () => {
    expect(refusalOf(applied(workedExample(), { comparing: true })).code).toBe('structure.apply/comparing');
    const swapped = {
      left: { connection: 'c-prod', database: 'shop' },
      right: { connection: 'c-dev', database: 'shop' },
    };
    expect(refusalOf(applied(workedExample(), swapped))).toEqual({
      code: 'structure.apply/stale',
      message: 'Nothing to change: compare again.',
    });
    expect(refusalOf(applied(workedExample(), { chosen: ['gone'] })).code).toBe('structure.apply/stale');
    expect(refusalOf(plan(context, { args: {} })).code).toBe('structure.apply/stale');
  });

  it('cannot be undone, publishes nothing, and refreshes the tree', () => {
    const planned = planOf(applied(workedExample(), { chosen: [statusIndex().id] }));
    expect(planned.undo).toEqual({ cannot: "These changes can't be undone from the undo history." });
    expect(planned.publishes).toBe(false);
    expect(planned.after).toEqual([{ kind: 'refresh', connection: 'c-prod' }]);
    expect(confirmation(planned).text).toContain("These changes can't be undone from the undo history.");
  });

  it('names the differences that failed with the server error, and what was applied', () => {
    const answers = pageStart(workedExample(), {}, { [dropsKey]: 'without' });
    const failure = { kind: 'error', message: 'Index build failed' };
    expect(afterReplies(context, answers, [failure, {}, {}, {}])).toEqual([
      {
        kind: 'notify',
        level: 'warning',
        text: 'Applied 3 changes to Production › shop. 1 difference failed: orders index status_1: Index build failed',
      },
      { kind: 'refresh', connection: 'c-prod' },
    ]);
    expect(afterReplies(context, answers, [{}, {}, {}, {}])).toEqual([
      { kind: 'notify', level: 'success', text: 'Applied 4 changes to Production › shop.' },
      { kind: 'refresh', connection: 'c-prod' },
    ]);
    expect(afterReplies(context, answers, [failure])).toEqual([
      {
        kind: 'notify',
        level: 'warning',
        text: 'Nothing was changed in Production › shop. 1 difference failed: orders index status_1: Index build failed',
      },
    ]);
  });
});
