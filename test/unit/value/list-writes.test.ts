import { describe, expect, it } from 'vitest';
import * as editElement from '../../../src/features/value/edit-element';
import * as pushElement from '../../../src/features/value/push-element';
import * as removeElements from '../../../src/features/value/remove-elements';
import * as trimList from '../../../src/features/value/trim-list';
import { hexOf } from '../../../src/features/value/types';
import {
  keyContext,
  neededCommands,
  planOf,
  questionOf,
  readAnswers,
  refusalOf,
  stepTexts,
  typed,
  utf8,
} from './context';

const hex = (text: string): { readonly hex: string } => ({ hex: hexOf(utf8(text)) });

describe('value.push-element', () => {
  const context = keyContext('value.push-element', { key: 'queue:mail' });

  it('asks for the element and the end, the tail by default', () => {
    const outcome = pushElement.plan(context, {});
    expect(outcome.kind === 'ask' && outcome.question.fields.map((field) => field.key)).toEqual(['element', 'end']);
  });

  it('sends TYPE queue:mail, then RPUSH queue:mail welcome', () => {
    expect(pushElement.plan(context, { element: typed('welcome') }).kind).toBe('read');
    const outcome = pushElement.plan(context, { element: typed('welcome'), end: 'tail', ...readAnswers('list') });
    expect(stepTexts(outcome)).toEqual(['RPUSH queue:mail welcome']);
  });

  it('sends LPUSH queue:mail welcome with The head', () => {
    const outcome = pushElement.plan(context, { element: typed('welcome'), end: 'head', ...readAnswers('list') });
    expect(stepTexts(outcome)).toEqual(['LPUSH queue:mail welcome']);
  });

  it('sends an element typed in Hex as 00 ff as RPUSH queue:mail "\\x00\\xff"', () => {
    const outcome = pushElement.plan(context, { element: typed('00 ff', 'hex'), ...readAnswers('list') });
    expect(stepTexts(outcome)).toEqual(['RPUSH queue:mail "\\x00\\xff"']);
  });

  it('pushes nothing on a list deleted meanwhile', () => {
    expect(refusalOf(pushElement.plan(context, { element: typed('welcome'), ...readAnswers('none') }))).toEqual({
      code: 'value.push-element/gone',
      message: 'The key queue:mail no longer exists: it was deleted or it expired.',
    });
  });
});

describe('value.edit-element', () => {
  const context = keyContext('value.edit-element', { key: 'queue:mail' });
  const answers = { index: 3, loaded: hex('hello'), value: typed('welcome') };

  it('sends TYPE, LINDEX queue:mail 3, then LSET queue:mail 3 welcome', () => {
    expect(neededCommands(editElement.plan(context, { ...answers, ...readAnswers('list') }), context)).toEqual([
      'LINDEX queue:mail 3',
    ]);
    expect(stepTexts(editElement.plan(context, { ...answers, ...readAnswers('list', [utf8('hello')]) }))).toEqual([
      'LSET queue:mail 3 welcome',
    ]);
  });

  it('refuses when index 3 holds another element, or the list became shorter', () => {
    const changed = {
      code: 'value.edit-element/changed',
      message: 'The element at index 3 of queue:mail is no longer the one shown: the list changed. Refresh and retry.',
    };
    expect(refusalOf(editElement.plan(context, { ...answers, ...readAnswers('list', [utf8('other')]) }))).toEqual(
      changed,
    );
    expect(refusalOf(editElement.plan(context, { ...answers, ...readAnswers('list', [null]) }))).toEqual(changed);
  });
});

describe('value.remove-elements', () => {
  const context = keyContext('value.remove-elements', { key: 'queue:mail' });
  const marker = '0123456789abcdef0123456789abcdef';

  it('removes the row at index 2 with MULTI, LSET, LREM and EXEC', () => {
    const elements = [{ index: 2, element: hex('a') }];
    expect(neededCommands(removeElements.plan(context, { elements, ...readAnswers('list') }), context)).toEqual([
      'LINDEX queue:mail 2',
      'LLEN queue:mail',
    ]);
    const outcome = removeElements.plan(context, { elements, marker, ...readAnswers('list', [utf8('a'), 4]) });
    expect(stepTexts(outcome)).toEqual([
      'MULTI',
      `LSET queue:mail 2 __datardo_removed__:${marker}`,
      `LREM queue:mail 1 __datardo_removed__:${marker}`,
      'EXEC',
    ]);
    expect(questionOf(planOf(outcome))).toBe('Remove the element at index 2 from queue:mail?');
  });

  it('removes the rows at indexes 0 and 2 with the same marker', () => {
    const elements = [
      { index: 0, element: hex('a') },
      { index: 2, element: hex('a') },
    ];
    const outcome = removeElements.plan(context, {
      elements,
      marker,
      ...readAnswers('list', [utf8('a'), utf8('a'), 4]),
    });
    expect(stepTexts(outcome)).toEqual([
      'MULTI',
      `LSET queue:mail 0 __datardo_removed__:${marker}`,
      `LSET queue:mail 2 __datardo_removed__:${marker}`,
      `LREM queue:mail 2 __datardo_removed__:${marker}`,
      'EXEC',
    ]);
  });

  it('draws a marker that starts with __datardo_removed__: and differs from one plan to the next', () => {
    const at = {
      connection: context.target.kind === 'key' ? context.target.connection : context.target.kind,
      database: 0,
      key: utf8('queue:mail'),
    };
    const first = removeElements.markerOf({}, context, at as never);
    const second = removeElements.markerOf({}, { ...context, now: context.now + 1 }, at as never);
    expect(first.startsWith('__datardo_removed__:')).toBe(true);
    expect(first).not.toBe(second);
  });

  it('sends nothing after the LINDEX when the element is no longer the one shown', () => {
    const elements = [{ index: 2, element: hex('a') }];
    expect(refusalOf(removeElements.plan(context, { elements, ...readAnswers('list', [utf8('b'), 4]) }))).toMatchObject(
      {
        code: 'value.remove-elements/changed',
      },
    );
  });

  it('says the key is deleted with the only element', () => {
    const elements = [{ index: 0, element: hex('a') }];
    const plan = planOf(removeElements.plan(context, { elements, marker, ...readAnswers('list', [utf8('a'), 1]) }));
    expect(plan.danger.kind === 'confirm' && plan.danger.text).toContain(
      'They are all the elements of queue:mail: the key is deleted with them.',
    );
  });
});

describe('value.trim-list', () => {
  const context = keyContext('value.trim-list', { key: 'queue:mail' });

  it('asks for the range, 0 to -1 by default', () => {
    const outcome = trimList.plan(context, {});
    expect(outcome.kind === 'ask' && outcome.question.fields.map((field) => field.default)).toEqual(['0', '-1']);
  });

  it('asks Trim queue:mail to 100 elements? for 0 to 99 of 1,204', () => {
    const outcome = trimList.plan(context, { from: '0', to: '99', ...readAnswers('list', [1204]) });
    const plan = planOf(outcome);
    expect(questionOf(plan)).toBe('Trim queue:mail to 100 elements?');
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Trim queue:mail to 100 elements?\n1,104 of 1,204 elements are removed: those before index 0 and after index 99.',
      button: 'Trim',
    });
    expect(stepTexts(outcome)).toEqual(['LTRIM queue:mail 0 99']);
  });

  it('keeps -100 to -1 with LTRIM queue:mail -100 -1', () => {
    expect(stepTexts(trimList.plan(context, { from: '-100', to: '-1', ...readAnswers('list', [1204]) }))).toEqual([
      'LTRIM queue:mail -100 -1',
    ]);
  });

  it('refuses a range that keeps every element, one that keeps none, and one that is not a number', () => {
    expect(refusalOf(trimList.plan(context, { from: '0', to: '-1', ...readAnswers('list', [1204]) }))).toEqual({
      code: 'value.trim-list/nothing',
      message: 'This range keeps every element: there is nothing to trim.',
    });
    expect(refusalOf(trimList.plan(context, { from: '5000', to: '6000', ...readAnswers('list', [1204]) }))).toEqual({
      code: 'value.trim-list/empty-range',
      message: 'This range keeps no element: the key would be deleted. Use Delete key instead.',
    });
    expect(refusalOf(trimList.plan(context, { from: 'x', to: '6' }))).toMatchObject({
      code: 'value.trim-list/invalid',
    });
  });

  it('writes what the range keeps under the form', () => {
    expect(trimList.keepsText(0, 99, 1204)).toBe('Keeps 100 of 1,204 elements.');
  });
});
