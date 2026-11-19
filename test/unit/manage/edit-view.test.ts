import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/manage/edit-view';
import type { EngineStep } from '../../../src/shared/feature';
import { manageContext, planOf, started } from './harness';

const context = manageContext('manage.edit-view');

function plannedWith(definition: unknown, connection = 'c-local'): ReturnType<typeof plan> {
  return plan(
    context,
    started({ connection, database: 'shop', collection: 'recent', view: true, definition: definition as never }),
  );
}

describe('manage.edit-view', () => {
  it('sends collMod with the new pipeline', () => {
    const definition = { viewOn: 'orders', pipeline: [{ $match: { status: 'new' } }] };
    const save = planOf(plannedWith({ kind: 'value', value: definition }));
    expect(save.steps.map((step) => step.text)).toEqual([
      'db.runCommand({ collMod: "recent", viewOn: "orders", pipeline: [{ $match: { status: "new" } }] })',
    ]);
    expect(save.danger).toEqual({ kind: 'none' });
    expect(save.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Saved view shop.recent.' });
    expect(save.undo).toHaveProperty('cannot');
  });

  it('applies values written in mongosh syntax with their types', () => {
    const since = { $date: { $numberLong: '1704067200000' } };
    const id = { $oid: '65f1c0de9a7b4e00012f3a2c' };
    const definition = { viewOn: 'orders', pipeline: [{ $match: { at: { $gte: since }, by: id } }] };
    const [step] = planOf(plannedWith({ kind: 'value', value: definition })).steps as readonly EngineStep[];
    expect(step?.request).toMatchObject({
      method: 'runCommand',
      arguments: [{ collMod: 'recent', viewOn: 'orders', pipeline: definition.pipeline }],
    });
    expect(step?.text).toContain('ISODate("2024-01-01T00:00:00.000Z")');
    expect(step?.text).toContain('ObjectId("65f1c0de9a7b4e00012f3a2c")');
  });

  it('refuses a definition without pipeline, without viewOn, or that is not an object', () => {
    expect(plannedWith('{ "viewOn": "orders" }')).toEqual({
      kind: 'refuse',
      code: 'manage.edit-view/pipeline',
      message: 'pipeline: an array of stages',
    });
    expect(plannedWith('{ "pipeline": [] }')).toEqual({
      kind: 'refuse',
      code: 'manage.edit-view/view-on',
      message: 'viewOn: the name of the source collection or view',
    });
    expect(plannedWith('[]')).toEqual({
      kind: 'refuse',
      code: 'manage.edit-view/not-an-object',
      message: 'The definition must be an object',
    });
  });

  it('refuses another field, naming the first', () => {
    const definition = { viewOn: 'orders', pipeline: [], collation: { locale: 'en' } };
    expect(plannedWith({ kind: 'value', value: definition })).toEqual({
      kind: 'refuse',
      code: 'manage.edit-view/unknown-field',
      message: 'Unknown field collation: a view has viewOn and pipeline',
    });
  });

  it('refuses text that does not parse, with the parse error', () => {
    expect(plannedWith({ kind: 'invalid', message: 'Unexpected token }' })).toEqual({
      kind: 'refuse',
      code: 'manage.edit-view/invalid',
      message: 'Invalid definition: Unexpected token }',
    });
  });

  it('refuses a save through a connection made read-only, and sends nothing', () => {
    expect(plannedWith('{ "viewOn": "orders", "pipeline": [] }', 'c-production')).toEqual({
      kind: 'refuse',
      code: 'manage.edit-view/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
