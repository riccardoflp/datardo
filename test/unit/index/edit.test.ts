import { describe, expect, it } from 'vitest';
import { openDialog, view } from '../../../src/features/index/dialog';
import { plan } from '../../../src/features/index/edit';
import type { IndexList, JsonDocument } from '../../../src/features/index/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { contextOn, engineSteps, notices, planOf, refusalOf, started, value, type MongoStep } from './harness';

const context = contextOn(false, 'index.edit');

/** The collection as getIndexes reports it now: `status_1` and `created_1` (TTL 1 day). */
const now: IndexList = {
  indexes: [
    { name: '_id_', key: { _id: 1 }, options: { v: 2 }, building: false },
    { name: 'status_1', key: { status: 1 }, options: { v: 2 }, building: false },
    { name: 'created_1', key: { created: 1 }, options: { v: 2, expireAfterSeconds: 86_400 }, building: false },
  ],
  totals: {},
};

function saved(index: string, keys: JsonDocument, options: JsonDocument): Answers {
  return {
    ...started({ index }),
    indexes: now,
    keys: value(keys),
    options: value(options),
    current: now,
  };
}

function command(step: MongoStep | undefined): Json | undefined {
  return step?.request.method === 'dropIndex'
    ? `dropIndex ${JSON.stringify(step.request.arguments[0]).replaceAll('"', '')}`
    : step?.request.arguments[0];
}

describe('index.edit', () => {
  it('hides with one collMod, with no confirmation and no rebuild', () => {
    const shown = planOf(plan(context, saved('status_1', { status: 1 }, { hidden: true })));
    expect(engineSteps(shown).map(command)).toEqual([{ collMod: 'orders', index: { name: 'status_1', hidden: true } }]);
    expect(shown.danger).toEqual({ kind: 'none' });
    expect(notices(shown)).toEqual(['Index status_1: hidden.']);
  });

  it('changes a TTL from 1 days to 2 hours in place', () => {
    const shown = planOf(plan(context, saved('created_1', { created: 1 }, { expireAfterSeconds: 7200 })));
    expect(engineSteps(shown).map(command)).toEqual([
      { collMod: 'orders', index: { name: 'created_1', expireAfterSeconds: 7200 } },
    ]);
    expect(notices(shown)).toEqual(['Index created_1: documents expire after 2 hours.']);
    const both = planOf(plan(context, saved('created_1', { created: 1 }, { expireAfterSeconds: 7200, hidden: true })));
    expect(notices(both)).toEqual(['Index created_1: hidden, documents expire after 2 hours.']);
  });

  it('asks to drop and recreate for Unique, and recreates the index under the same name', () => {
    const shown = planOf(plan(context, saved('status_1', { status: 1 }, { unique: true })));
    expect(shown.title).toBe('Drop and recreate the index status_1 of orders?');
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text: "MongoDB can't change the unique of an existing index: it is dropped and built again with the new definition. Building reads the whole collection, and until it ends queries can't use the index.",
      button: 'Drop and recreate',
    });
    expect(engineSteps(shown).map(command)).toEqual([
      'dropIndex status_1',
      { createIndexes: 'orders', indexes: [{ key: { status: 1 }, name: 'status_1', unique: true }] },
    ]);
    expect(notices(shown)).toEqual(['Recreated index status_1.']);
  });

  it('builds the new index first and drops the old one afterwards when the keys and the name change', () => {
    const shown = planOf(plan(context, saved('status_1', { status: 1, created: -1 }, { name: 'byStatus' })));
    const steps = engineSteps(shown);
    expect(steps.map(command)).toEqual([
      { createIndexes: 'orders', indexes: [{ key: { status: 1, created: -1 }, name: 'byStatus' }] },
      'dropIndex status_1',
    ]);
    const instead = steps[0]?.onFailure;
    expect(instead?.kind === 'instead' ? instead.codes : undefined).toEqual([85, 86]);
    expect(notices(shown)).toEqual(['Created index byStatus and dropped status_1.']);
  });

  it('drops the old index first under another name with the same keys and options', () => {
    const shown = planOf(plan(context, saved('status_1', { status: 1 }, { name: 'byStatus' })));
    expect(engineSteps(shown).map(command)).toEqual([
      'dropIndex status_1',
      { createIndexes: 'orders', indexes: [{ key: { status: 1 }, name: 'byStatus' }] },
    ]);
  });

  it('creates the index again as it was when the new definition is refused', () => {
    const steps = engineSteps(
      planOf(plan(context, saved('created_1', { created: 1 }, { unique: true, expireAfterSeconds: 86_400 }))),
    );
    const recovery = steps[1]?.onFailure;
    expect(recovery?.kind).toBe('instead');
    const [again] = recovery?.kind === 'instead' ? (recovery.steps as readonly MongoStep[]) : [];
    expect(command(again)).toEqual({
      createIndexes: 'orders',
      indexes: [{ key: { created: 1 }, name: 'created_1', expireAfterSeconds: 86_400 }],
    });
  });

  it('disables Save changes and says No changes yet. without changes', () => {
    const shown = planOf(plan(context, saved('status_1', { status: 1 }, {})));
    expect(shown.steps).toEqual([]);
    expect(notices(shown)).toEqual(['No changes to the index status_1.']);
    const definition = { keys: { status: 1 }, options: {} };
    const state = openDialog({ collection: 'orders', editing: { name: 'status_1', definition }, list: now });
    expect(view(state).main.enabled).toBe(false);
    expect(view(state).note).toBe('No changes yet.');
  });

  it('shows the steps of a rebuild in order and says it cannot be undone from the undo history', () => {
    const shown = planOf(plan(context, saved('status_1', { status: 1 }, { unique: true })));
    expect(shown.steps.map((step) => step.text)).toEqual([
      'db.orders.dropIndex("status_1")',
      expect.stringContaining('createIndexes'),
    ]);
    expect(shown.undo).toEqual({ cannot: "An index is not a document: this can't be undone from the undo history." });
  });

  it('says that an index dropped meanwhile no longer exists', () => {
    const gone = { ...saved('status_1', { status: 1 }, { hidden: true }), current: { indexes: [], totals: {} } };
    expect(refusalOf(plan(context, gone))).toEqual({
      code: 'index.edit/gone',
      text: 'The index status_1 no longer exists.',
    });
    expect(refusalOf(plan(context, started({ index: '_id_' }))).code).toBe('index.edit/id-index');
    expect(refusalOf(plan(contextOn(true, 'index.edit'), started({ index: 'status_1' }))).code).toBe(
      'index.edit/read-only',
    );
    const asked = plan(context, { ...started({ index: 'status_1' }), indexes: now });
    expect(asked.kind === 'ask' ? asked.question.title : '').toBe('Edit index · status_1');
  });
});
