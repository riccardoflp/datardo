/**
 * Feature: value.push-element — adds an element at the tail (the default) or at the head of a list. A list deleted
 * meanwhile is refused by the check before the push, so the key is not created again.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { guard, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { listText } from './text';
import { keyOf, nameText, writeStep } from './types';

/** The form **Push to queue:mail**: **Element**, and **At**: **The tail** or **The head**. */
function pushForm(key: string): Outcome {
  return ask({
    title: listText.pushForm(key),
    button: 'Push',
    fields: [
      { kind: 'text', key: 'element', label: 'Element' },
      {
        kind: 'pick-one',
        key: 'end',
        label: 'At',
        choices: [
          { value: 'tail', label: 'The tail' },
          { value: 'head', label: 'The head' },
        ],
        default: 'tail',
      },
    ],
  });
}

/**
 * Feature: value.push-element — `answers.element` as typed and `answers.end` (`tail` or `head`). Then `TYPE`, and the
 * plan `RPUSH <key> <element>` or `LPUSH <key> <element>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.push-element/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['element'] === undefined) {
    return pushForm(nameText(keyOf(context).key));
  }
  const element = typedAnswer(answers['element']);
  if ('problem' in element) {
    return refuse('value.push-element/invalid', element.problem);
  }
  const guarded = guard(context, answers, 'list', {
    readOnly: 'value.push-element/read-only',
    gone: 'value.push-element/gone',
    typeChanged: 'value.push-element/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const end = answers['end'] === 'head' ? 'head' : 'tail';
  return writePlan({
    at,
    name: listText.pushTitle(name),
    steps: [writeStep(at, [end === 'head' ? 'LPUSH' : 'RPUSH', at.key, element.bytes])],
    done: listText.pushed(end, name),
  });
}
