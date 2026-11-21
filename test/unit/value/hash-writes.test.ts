import { describe, expect, it } from 'vitest';
import * as addField from '../../../src/features/value/add-field';
import * as editField from '../../../src/features/value/edit-field';
import * as removeFields from '../../../src/features/value/remove-fields';
import * as renameField from '../../../src/features/value/rename-field';
import * as saveString from '../../../src/features/value/save-string';
import { keyNameOf } from '../../../src/features/undo/types';
import { hexOf } from '../../../src/features/value/types';
import {
  bytes,
  keyContext,
  needOf,
  neededCommands,
  planOf,
  readAnswers,
  refusalOf,
  sentCommands,
  stepTexts,
  typed,
  utf8,
} from './context';

const hex = (text: string): { readonly hex: string } => ({ hex: hexOf(utf8(text)) });

describe('value.check', () => {
  it('every write sends TYPE <key> before its first step', () => {
    const context = keyContext('value.add-field');
    const outcome = addField.plan(context, { field: typed('nickname'), value: typed('Ada') });
    expect(needOf(outcome)).toEqual({ key: 'check', read: 'value.check', args: null });
  });

  it('refuses a save on a key that expired', () => {
    const context = keyContext('value.edit-field');
    const answers = { ...readAnswers('none'), field: hex('visits'), loaded: hex('12'), value: typed('14') };
    expect(refusalOf(editField.plan(context, answers))).toEqual({
      code: 'value.edit-field/gone',
      message: 'The key user:7 no longer exists: it was deleted or it expired.',
    });
  });

  it('refuses adding a field to a hash another client replaced with a list', () => {
    const context = keyContext('value.add-field');
    const answers = { ...readAnswers('list'), field: typed('nickname'), value: typed('Ada') };
    expect(refusalOf(addField.plan(context, answers))).toEqual({
      code: 'value.add-field/type-changed',
      message: 'user:7 is now a list: it was a hash when this tab read it. Refresh to see it.',
    });
  });
});

describe('value.save-string', () => {
  const context = keyContext('value.save-string', { key: 'orders:42' });
  const answers = { loaded: hex('hello'), value: typed('hello world') };

  it('sends TYPE, GET, then SET orders:42 "hello world" KEEPTTL', () => {
    expect(needOf(saveString.plan(context, answers))).toMatchObject({ key: 'check' });
    const reading = saveString.plan(context, { ...answers, ...readAnswers('string') });
    expect(neededCommands(reading, context)).toEqual(['GET orders:42']);
    const outcome = saveString.plan(context, { ...answers, ...readAnswers('string', [utf8('hello')]) });
    expect(stepTexts(outcome)).toEqual(['SET orders:42 "hello world" KEEPTTL']);
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
    expect(planOf(outcome).undo).toEqual({
      keeps: { kind: 'keys', database: 0, keys: [keyNameOf(utf8('orders:42'))] },
    });
  });

  it('saves 41 edited to 42 with SET counter 42 KEEPTTL', () => {
    const counter = keyContext('value.save-string', { key: 'counter' });
    const outcome = saveString.plan(counter, {
      loaded: hex('41'),
      value: typed('42'),
      ...readAnswers('string', [utf8('41')]),
    });
    expect(stepTexts(outcome)).toEqual(['SET counter 42 KEEPTTL']);
  });

  it('asks Overwrite when the value changed, and closing it writes nothing', () => {
    const changed = { ...answers, ...readAnswers('string', [utf8('hullo')]) };
    const plan = planOf(saveString.plan(context, changed));
    expect(plan.title).toBe('Edit orders:42');
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'orders:42 was changed in the database after it was loaded. Overwrite it?',
      button: 'Overwrite',
    });
    expect(refusalOf(saveString.plan(context, { ...changed, overwrite: false }))).toEqual({
      code: 'value.save-string/changed',
      message: 'Not saved: the value changed in the database.',
    });
  });

  it('creates the key again without KEEPTTL when it expired meanwhile', () => {
    const outcome = saveString.plan(context, { ...answers, ...readAnswers('none') });
    expect(stepTexts(outcome)).toEqual(['SET orders:42 "hello world"']);
    expect(planOf(outcome).danger).toEqual({
      kind: 'confirm',
      text: 'The key orders:42 no longer exists. Create it again?\nIt is created without an expiry.',
      button: 'Create again',
    });
  });

  it('refuses text that is not JSON saved from JSON, and sends nothing', () => {
    const outcome = saveString.plan(context, { loaded: hex('{"a":1}'), value: typed('{"a":', 'json') });
    const refusal = refusalOf(outcome);
    expect(typeof refusal === 'object' && refusal.code).toBe('value.save-string/invalid');
    expect(typeof refusal === 'object' && refusal.message.startsWith('Not valid JSON: ')).toBe(true);
  });

  it('refuses on a read-only connection, and below Redis 6.0', () => {
    const readOnly = keyContext('value.save-string', { key: 'orders:42', readOnly: true });
    expect(refusalOf(saveString.plan(readOnly, answers))).toMatchObject({ code: 'value.save-string/read-only' });
    const old = keyContext('value.save-string', { key: 'orders:42', version: '5.0.14' });
    expect(refusalOf(saveString.plan(old, { ...answers, ...readAnswers('string') }))).toEqual({
      code: 'value.save-string/unsupported',
      message: 'This server does not support SET with KEEPTTL: saving would remove the expiry.',
    });
  });

  it('writes nothing for a value saved as it was', () => {
    expect(planOf(saveString.plan(context, { loaded: hex('hello'), value: typed('hello') })).steps).toEqual([]);
  });
});

describe('value.add-field', () => {
  const context = keyContext('value.add-field');

  it('asks for the field and the value', () => {
    expect(addField.plan(context, {}).kind).toBe('ask');
  });

  it('sends TYPE, HEXISTS user:7 nickname, then HSET user:7 nickname Ada', () => {
    const answers = { field: typed('nickname'), value: typed('Ada') };
    expect(neededCommands(addField.plan(context, { ...answers, ...readAnswers('hash') }), context)).toEqual([
      'HEXISTS user:7 nickname',
    ]);
    const outcome = addField.plan(context, { ...answers, ...readAnswers('hash', [0]) });
    expect(stepTexts(outcome)).toEqual(['HSET user:7 nickname Ada']);
    expect(planOf(outcome).after[0]).toEqual({
      kind: 'notify',
      level: 'success',
      text: 'Added the field nickname to user:7.',
    });
  });

  it('sends a value with a space in quotes', () => {
    const outcome = addField.plan(context, {
      field: typed('nickname'),
      value: typed('Ada Lovelace'),
      ...readAnswers('hash', [0]),
    });
    expect(stepTexts(outcome)).toEqual(['HSET user:7 nickname "Ada Lovelace"']);
  });

  it('refuses a field that exists', () => {
    const outcome = addField.plan(context, {
      field: typed('nickname'),
      value: typed('Ada'),
      ...readAnswers('hash', [1]),
    });
    expect(refusalOf(outcome)).toEqual({
      code: 'value.add-field/exists',
      message: 'user:7 already has a field named nickname: edit its value instead.',
    });
  });

  it('refuses on a read-only connection', () => {
    expect(refusalOf(addField.plan(keyContext('value.add-field', { readOnly: true }), {}))).toEqual({
      code: 'value.add-field/read-only',
      message: 'The connection Cache local is read-only.',
    });
  });
});

describe('value.edit-field', () => {
  const answers = { field: hex('visits'), loaded: hex('12'), value: typed('14') };

  it('sends TYPE, HGET user:7 visits, then HSET user:7 visits 14', () => {
    const context = keyContext('value.edit-field', { version: '6.2.14' });
    expect(neededCommands(editField.plan(context, { ...answers, ...readAnswers('hash') }), context)).toEqual([
      'HGET user:7 visits',
    ]);
    expect(stepTexts(editField.plan(context, { ...answers, ...readAnswers('hash', [utf8('12')]) }))).toEqual([
      'HSET user:7 visits 14',
    ]);
  });

  it('asks Overwrite when another client set visits to 13 meanwhile', () => {
    const context = keyContext('value.edit-field');
    const plan = planOf(editField.plan(context, { ...answers, ...readAnswers('hash', [utf8('13'), [-1]]) }));
    expect(plan.title).toBe('Edit field visits of user:7');
    expect(plan.danger.kind === 'confirm' && plan.danger.text).toBe(
      'visits of user:7 was changed to 13 in the database after it was loaded. Overwrite it?',
    );
  });

  it('writes nothing for a value saved without a change', () => {
    const context = keyContext('value.edit-field');
    expect(planOf(editField.plan(context, { ...answers, value: typed('12') })).steps).toEqual([]);
  });

  it('keeps the expiry of a field on Redis 7.4 with MULTI, HSET, HPEXPIRE, EXEC', () => {
    const context = keyContext('value.edit-field');
    expect(neededCommands(editField.plan(context, { ...answers, ...readAnswers('hash') }), context)).toEqual([
      'HGET user:7 visits',
      'HPTTL user:7 FIELDS 1 visits',
    ]);
    const outcome = editField.plan(context, { ...answers, ...readAnswers('hash', [utf8('12'), [86_400_000]]) });
    expect(stepTexts(outcome)).toEqual([
      'MULTI',
      'HSET user:7 visits 14',
      'HPEXPIRE user:7 86400000 FIELDS 1 visits',
      'EXEC',
    ]);
  });
});

describe('value.rename-field', () => {
  const context = keyContext('value.rename-field');
  const answers = { field: hex('nickname'), name: typed('nick') };

  it('sends MULTI, HSET user:7 nick Ada, HDEL user:7 nickname, EXEC', () => {
    expect(neededCommands(renameField.plan(context, { ...answers, ...readAnswers('hash') }), context)).toEqual([
      'HGET user:7 nickname',
      'HEXISTS user:7 nick',
      'HPTTL user:7 FIELDS 1 nickname',
    ]);
    const outcome = renameField.plan(context, { ...answers, ...readAnswers('hash', [utf8('Ada'), 0, [-1]]) });
    expect(stepTexts(outcome)).toEqual(['MULTI', 'HSET user:7 nick Ada', 'HDEL user:7 nickname', 'EXEC']);
  });

  it('gives nick the same bytes nickname had, also when they are not text', () => {
    const outcome = renameField.plan(context, { ...answers, ...readAnswers('hash', [bytes('00 ff'), 0, [-1]]) });
    expect(Array.from(sentCommands(outcome)[1]?.[3] ?? [])).toEqual([0x00, 0xff]);
  });

  it('refuses a name that exists, and a field removed meanwhile', () => {
    expect(
      refusalOf(renameField.plan(context, { ...answers, ...readAnswers('hash', [utf8('Ada'), 1, [-1]]) })),
    ).toEqual({
      code: 'value.rename-field/exists',
      message: 'user:7 already has a field named nick.',
    });
    expect(refusalOf(renameField.plan(context, { ...answers, ...readAnswers('hash', [null, 0, [-2]]) }))).toEqual({
      code: 'value.rename-field/gone-item',
      message: 'The field nickname is no longer in user:7.',
    });
  });

  it('sends nothing for Enter without a change', () => {
    expect(planOf(renameField.plan(context, { field: hex('nickname'), name: typed('nickname') })).steps).toEqual([]);
  });
});

describe('value.remove-fields', () => {
  const context = keyContext('value.remove-fields');

  it('asks Remove the field nickname from user:7? and sends HDEL user:7 nickname', () => {
    const outcome = removeFields.plan(context, { fields: [hex('nickname')], ...readAnswers('hash', [2]) });
    const plan = planOf(outcome);
    expect(plan.title).toBe('Remove field nickname from user:7');
    expect(plan.danger).toEqual({ kind: 'confirm', text: 'Remove the field nickname from user:7?', button: 'Remove' });
    expect(stepTexts(outcome)).toEqual(['HDEL user:7 nickname']);
  });

  it('sends one HDEL with the three names', () => {
    const fields = [hex('a'), hex('b'), hex('c')];
    expect(stepTexts(removeFields.plan(context, { fields, ...readAnswers('hash', [12]) }))).toEqual([
      'HDEL user:7 a b c',
    ]);
  });

  it('says the key is deleted with all its fields', () => {
    const plan = planOf(removeFields.plan(context, { fields: [hex('a'), hex('b')], ...readAnswers('hash', [2]) }));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Remove 2 fields from user:7?\nThey are all the fields of user:7: the key is deleted with them.',
      button: 'Remove',
    });
  });

  it('does nothing on a read-only connection', () => {
    const readOnly = keyContext('value.remove-fields', { readOnly: true });
    expect(refusalOf(removeFields.plan(readOnly, { fields: [hex('a')] }))).toMatchObject({
      code: 'value.remove-fields/read-only',
    });
  });
});
