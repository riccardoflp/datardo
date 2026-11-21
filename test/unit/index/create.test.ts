import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/create';
import { dialogAnswers, openDialog, view } from '../../../src/features/index/dialog';
import type { Answers } from '../../../src/shared/feature';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, engineSteps, notices, planOf, recordedList, refusalOf, started, value } from './harness';

const context = contextOn(false, 'index.create');

function answered(keys: Json, options: Json = {}, more: Readonly<Record<string, Json>> = {}): Answers {
  return { ...started(more), indexes: recordedList(), keys: value(keys), options: value(options) };
}

describe('index.create', () => {
  it('creates status_1_createdAt_-1, unique, with the createIndexes command', () => {
    expect(plan(context, started())).toEqual({
      kind: 'read',
      need: {
        key: 'indexes',
        read: 'index.list',
        args: { connection: 'c-local', database: 'shop', collection: 'orders' },
      },
    });
    const shown = planOf(plan(context, answered({ status: 1, createdAt: -1 }, { unique: true })));
    const [step] = engineSteps(shown);
    expect(step?.request).toMatchObject({
      database: 'shop',
      method: 'runCommand',
      arguments: [
        {
          createIndexes: 'orders',
          indexes: [{ key: { status: 1, createdAt: -1 }, name: 'status_1_createdAt_-1', unique: true }],
        },
      ],
    });
    expect(step?.request).not.toHaveProperty('collection');
    expect(notices(shown)).toEqual(['Created index status_1_createdAt_-1.']);
    expect(shown.danger).toEqual({ kind: 'none' });
  });

  it('creates a TTL of 2 hours with expireAfterSeconds: 7200', () => {
    const state = openDialog({ collection: 'orders' });
    const form = {
      ...state.form,
      rows: [{ field: 'createdAt', type: '1', weight: '' }],
      ttl: { on: true, value: '2', unit: 'hours' as const },
    };
    const answers = dialogAnswers({ ...state, form }) ?? {};
    const shown = planOf(plan(context, { ...started(), indexes: recordedList(), ...answers }));
    expect(engineSteps(shown)[0]?.request.arguments).toEqual([
      { createIndexes: 'orders', indexes: [{ key: { createdAt: 1 }, name: 'createdAt_1', expireAfterSeconds: 7200 }] },
    ]);
  });

  it('sends an option MongoDB does not know as given, for the server to refuse', () => {
    const shown = planOf(plan(context, answered({ a: 1 }, { uniqe: true })));
    expect(engineSteps(shown)[0]?.request.arguments).toEqual([
      { createIndexes: 'orders', indexes: [{ key: { a: 1 }, name: 'a_1', uniqe: true }] },
    ]);
  });

  it('moves commitQuorum from the index to the command', () => {
    const shown = planOf(plan(context, answered({ a: 1 }, { commitQuorum: 'majority' })));
    expect(engineSteps(shown)[0]?.request.arguments).toEqual([
      { createIndexes: 'orders', indexes: [{ key: { a: 1 }, name: 'a_1' }], commitQuorum: 'majority' },
    ]);
  });

  it('says that an identical index already exists, and creates nothing', () => {
    const shown = planOf(plan(context, answered({ email: 1 }, { unique: true })));
    expect(shown.steps).toEqual([]);
    expect(notices(shown)).toEqual(['An identical index already exists: nothing was created.']);
  });

  it('leaves the duplicate values of a unique index to the server, whose error the dialog shows', () => {
    const [step] = engineSteps(planOf(plan(context, answered({ status: 1 }, { unique: true }))));
    expect(step?.onFailure).toBeUndefined();
  });

  it('opens on the keys of an advice for shop.events, titled Create index · events, whatever tab is active', () => {
    const answers = {
      args: { connection: 'c-local', database: 'shop', collection: 'events', keys: { kind: 1, createdAt: -1 } },
    };
    const asked = plan(context, { ...answers, indexes: recordedList() });
    expect(asked.kind).toBe('ask');
    const question = asked.kind === 'ask' ? asked.question : undefined;
    expect(question?.title).toBe('Create index · events');
    expect(question?.fields[0]).toMatchObject({ key: 'keys', default: '{ kind: 1, createdAt: -1 }' });
    const dialog = openDialog({ collection: 'events', definition: { keys: { kind: 1, createdAt: -1 }, options: {} } });
    expect(view(dialog).rows.map((row) => [row.field, row.type])).toEqual([
      ['kind', '1'],
      ['createdAt', '-1'],
    ]);
  });

  it('opens on suggested keys of canonical Extended JSON as plain numbers, so the index is named status_1', () => {
    const answers = {
      args: { connection: 'c-local', database: 'shop', collection: 'orders', keys: { status: { $numberInt: '1' } } },
    };
    const asked = plan(context, { ...answers, indexes: recordedList() });
    const question = asked.kind === 'ask' ? asked.question : undefined;
    expect(question?.fields[0]).toMatchObject({ key: 'keys', default: '{ status: 1 }' });
  });

  it('notifies Created index status_1. when the build ends', () => {
    expect(notices(planOf(plan(context, answered({ status: 1 }))))).toEqual(['Created index status_1.']);
  });

  it('is refused on a read-only connection and on a view', () => {
    expect(refusalOf(plan(contextOn(true, 'index.create'), started()))).toEqual({
      code: 'index.create/read-only',
      text: 'The connection Production is read-only.',
    });
    expect(refusalOf(plan(context, started({ view: true })))).toEqual({
      code: 'index.create/view',
      text: 'Views have no indexes of their own.',
    });
    expect(refusalOf(plan(context, answered({})))).toEqual({
      code: 'index.create/no-keys',
      text: 'Keys: enter the fields to index, e.g. { status: 1, age: -1 }',
    });
    expect(refusalOf(plan(context, answered([1]))).text).toBe('Keys must be an object');
    expect(refusalOf(plan(context, answered({ a: 1 }, 'x'))).text).toBe('Options must be an object');
  });
});
