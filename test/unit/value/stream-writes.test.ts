import { describe, expect, it } from 'vitest';
import * as addEntry from '../../../src/features/value/add-entry';
import * as deleteEntries from '../../../src/features/value/delete-entries';
import * as trimStream from '../../../src/features/value/trim-stream';
import { keyContext, neededCommands, planOf, readAnswers, refusalOf, stepTexts, typed } from './context';

describe('value.add-entry', () => {
  const context = keyContext('value.add-entry', { key: 'events' });
  const pairs = [
    { field: typed('type'), value: typed('signup') },
    { field: typed('user'), value: typed('7') },
  ];

  it('asks for the ID, * by default, and a pair', () => {
    const outcome = addEntry.plan(context, {});
    expect(outcome.kind === 'ask' && outcome.question.fields[0]?.default).toBe('*');
  });

  it('sends TYPE events, then XADD events NOMKSTREAM * type signup user 7', () => {
    expect(addEntry.plan(context, { pairs }).kind).toBe('read');
    expect(stepTexts(addEntry.plan(context, { pairs, ...readAnswers('stream') }))).toEqual([
      'XADD events NOMKSTREAM * type signup user 7',
    ]);
  });

  it('sends an ID 1700000000000-5 in the place of *', () => {
    const outcome = addEntry.plan(context, { pairs, id: '1700000000000-5', ...readAnswers('stream') });
    expect(stepTexts(outcome)).toEqual(['XADD events NOMKSTREAM 1700000000000-5 type signup user 7']);
  });

  it('refuses a form without a pair, and an ID that is not one', () => {
    expect(refusalOf(addEntry.plan(context, { pairs: [{ field: typed(''), value: typed('x') }] }))).toEqual({
      code: 'value.add-entry/invalid',
      message: 'An entry needs at least one field with a name.',
    });
    expect(refusalOf(addEntry.plan(context, { pairs, id: 'abc' }))).toEqual({
      code: 'value.add-entry/invalid',
      message: 'Enter *, or an ID such as 1700000000000-0.',
    });
  });

  it('refuses a stream deleted meanwhile, and an ID with * as its sequence before Redis 7.0', () => {
    expect(refusalOf(addEntry.plan(context, { pairs, ...readAnswers('none') }))).toMatchObject({
      code: 'value.add-entry/gone',
    });
    const old = keyContext('value.add-entry', { key: 'events', version: '6.2.14' });
    expect(refusalOf(addEntry.plan(old, { pairs, id: '1700000000000-*', ...readAnswers('stream') }))).toEqual({
      code: 'value.add-entry/unsupported',
      message: 'This server needs * or a full ID.',
    });
  });

  it('says which ID the server gave', () => {
    expect(addEntry.addedText(new TextEncoder().encode('1700000000000-0'), 'events')).toBe(
      'Added the entry 1700000000000-0 to events.',
    );
  });
});

describe('value.delete-entries', () => {
  const context = keyContext('value.delete-entries', { key: 'events' });

  it('asks Delete the entry 1700000000000-0 from events? and sends XDEL events 1700000000000-0', () => {
    const outcome = deleteEntries.plan(context, { ids: ['1700000000000-0'], ...readAnswers('stream') });
    const plan = planOf(outcome);
    expect(plan.title).toBe('Delete the entry 1700000000000-0 from events?');
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Consumer groups keep an entry they have pending in their lists, without its fields.',
      button: 'Delete',
    });
    expect(stepTexts(outcome)).toEqual(['XDEL events 1700000000000-0']);
  });

  it('sends one XDEL with three IDs, and says when one was already gone', () => {
    const ids = ['1-0', '2-0', '3-0'];
    expect(stepTexts(deleteEntries.plan(context, { ids, ...readAnswers('stream') }))).toEqual([
      'XDEL events 1-0 2-0 3-0',
    ]);
    expect(deleteEntries.deletedText(ids, 2, 'events')).toBe(
      'Deleted 2 of 3 entries from events: the others were already gone.',
    );
  });
});

describe('value.trim-stream', () => {
  const context = keyContext('value.trim-stream', { key: 'events' });

  it('asks Trim events to its newest 1,000 entries? on a stream of 5,200', () => {
    const answers = { by: 'newest', count: '1000' };
    expect(neededCommands(trimStream.plan(context, { ...answers, ...readAnswers('stream') }), context)).toEqual([
      'XLEN events',
    ]);
    const outcome = trimStream.plan(context, { ...answers, ...readAnswers('stream', [5200]) });
    const plan = planOf(outcome);
    expect(plan.title).toBe('Trim events to its newest 1,000 entries?');
    expect(plan.danger).toEqual({ kind: 'confirm', text: '4,200 of 5,200 entries are deleted.', button: 'Trim' });
    expect(stepTexts(outcome)).toEqual(['XTRIM events MAXLEN 1000']);
  });

  it('keeps the entries from 1700000000000-0 with XTRIM events MINID 1700000000000-0', () => {
    const outcome = trimStream.plan(context, { by: 'from', from: '1700000000000-0', ...readAnswers('stream', [5200]) });
    expect(stepTexts(outcome)).toEqual(['XTRIM events MINID 1700000000000-0']);
  });

  it('refuses keeping the newest 6000 of 5,200', () => {
    expect(
      refusalOf(trimStream.plan(context, { by: 'newest', count: '6000', ...readAnswers('stream', [5200]) })),
    ).toEqual({
      code: 'value.trim-stream/nothing',
      message: 'events has 5,200 entries: there is nothing to trim.',
    });
  });

  it('keeps the newest 0 with XTRIM events MAXLEN 0', () => {
    expect(stepTexts(trimStream.plan(context, { by: 'newest', count: '0', ...readAnswers('stream', [5200]) }))).toEqual(
      ['XTRIM events MAXLEN 0'],
    );
  });

  it('refuses a count that is not a whole number', () => {
    expect(refusalOf(trimStream.plan(context, { by: 'newest', count: '-3' }))).toEqual({
      code: 'value.trim-stream/invalid',
      message: 'Enter a whole number of entries, 0 or more.',
    });
  });
});
