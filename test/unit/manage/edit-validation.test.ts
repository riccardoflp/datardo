import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/manage/edit-validation';
import { collectionTab, manageContext, planOf, started } from './harness';

const context = manageContext('manage.edit-validation');

function savedWith(rules: unknown, more: Readonly<Record<string, string | boolean>> = {}): ReturnType<typeof plan> {
  return plan(context, started({ database: 'shop', collection: 'orders', rules: rules as never, ...more }));
}

describe('manage.edit-validation', () => {
  it('removes the rules with { validator: {} }, sending neither validationLevel nor validationAction', () => {
    const saved = planOf(savedWith('{ "validator": {} }'));
    expect(saved.steps.map((step) => step.text)).toEqual(['db.runCommand({ collMod: "orders", validator: {} })']);
    expect(saved.danger).toEqual({ kind: 'none' });
    expect(saved.after[0]).toEqual({
      kind: 'notify',
      level: 'success',
      text: 'Applied the validation rules of shop.orders.',
    });
  });

  it('sends the three fields in their order, with only those present in the text', () => {
    const rules = {
      validationAction: 'warn',
      validator: { $jsonSchema: { bsonType: 'object', required: ['status'] } },
      validationLevel: 'strict',
    };
    expect(planOf(savedWith({ kind: 'value', value: rules })).steps[0]?.text).toBe(
      'db.runCommand({ collMod: "orders", validator: { $jsonSchema: { bsonType: "object", required: ["status"] } }, ' +
        'validationLevel: "strict", validationAction: "warn" })',
    );
    expect(planOf(savedWith('{ "validationAction": "error" }')).steps[0]?.text).toBe(
      'db.runCommand({ collMod: "orders", validationAction: "error" })',
    );
  });

  it('refuses a validator that is not an object, and an unknown field', () => {
    expect(savedWith('{ "validator": 5 }')).toEqual({
      kind: 'refuse',
      code: 'manage.edit-validation/validator',
      message: 'validator must be an object ({} removes the rules)',
    });
    expect(savedWith('{ "validatorLevel": "strict" }')).toEqual({
      kind: 'refuse',
      code: 'manage.edit-validation/unknown-field',
      message: 'Unknown field validatorLevel: use validator, validationLevel, validationAction',
    });
  });

  it('refuses text that does not parse, and text that is not an object', () => {
    expect(savedWith({ kind: 'invalid', message: 'Unexpected end of input' })).toMatchObject({
      code: 'manage.edit-validation/invalid',
      message: 'Invalid definition: Unexpected end of input',
    });
    expect(savedWith('5')).toMatchObject({
      code: 'manage.edit-validation/not-an-object',
      message: 'The definition must be an object',
    });
  });

  it('refuses a view', () => {
    expect(savedWith('{ "validator": {} }', { view: true })).toEqual({
      kind: 'refuse',
      code: 'manage.edit-validation/view',
      message: 'Views have no validation rules.',
    });
    const onView = manageContext('manage.edit-validation', [collectionTab(1, 'recent', true)]);
    expect(plan(onView, started({ database: 'shop', collection: 'recent', rules: '{}' }))).toMatchObject({
      code: 'manage.edit-validation/view',
    });
  });

  it('refuses a save through a connection made read-only, and sends nothing', () => {
    expect(savedWith('{ "validator": {} }', { connection: 'c-production' })).toEqual({
      kind: 'refuse',
      code: 'manage.edit-validation/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
