/**
 * Feature: value.add-field — adds a field with its value to a hash, never over a field that is there: `HEXISTS` is
 * read first, and a field that exists is refused under **Field** with the form still open.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { hashText } from './text';
import { keyOf, nameText, replyNumber, writeStep } from './types';

/** The form **Add a field to user:7**: **Field** and **Value**, each typed as text, JSON or hexadecimal. */
function addForm(key: string): Outcome {
  return ask({
    title: hashText.addFieldForm(key),
    button: 'Add',
    fields: [
      { kind: 'text', key: 'field', label: 'Field' },
      { kind: 'text', key: 'value', label: 'Value' },
    ],
  });
}

/**
 * Feature: value.add-field — `answers.field` and `answers.value` as typed (`{ text, format }`); then `TYPE`,
 * `HEXISTS <key> <field>`, and the plan `HSET <key> <field> <value>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.add-field/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['field'] === undefined || answers['value'] === undefined) {
    return addForm(nameText(keyOf(context).key));
  }
  const field = typedAnswer(answers['field']);
  if ('problem' in field) {
    return refuse('value.add-field/invalid', field.problem);
  }
  const value = typedAnswer(answers['value']);
  if ('problem' in value) {
    return refuse('value.add-field/invalid', value.problem);
  }
  const guarded = guard(context, answers, 'hash', {
    readOnly: 'value.add-field/read-only',
    gone: 'value.add-field/gone',
    typeChanged: 'value.add-field/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['HEXISTS', at.key, field.bytes]]);
  }
  const fieldName = nameText(field.bytes);
  if (replyNumber(current[0]) === 1) {
    return refuse('value.add-field/exists', hashText.fieldExists(name, fieldName));
  }
  return writePlan({
    at,
    name: hashText.addFieldTitle(fieldName, name),
    steps: [writeStep(at, ['HSET', at.key, field.bytes, value.bytes])],
    done: hashText.addedField(fieldName, name),
  });
}
