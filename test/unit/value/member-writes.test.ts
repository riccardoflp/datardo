import { describe, expect, it } from 'vitest';
import * as addMember from '../../../src/features/value/add-member';
import * as addScoredMember from '../../../src/features/value/add-scored-member';
import * as changeScore from '../../../src/features/value/change-score';
import * as removeFields from '../../../src/features/value/remove-fields';
import * as removeMembers from '../../../src/features/value/remove-members';
import * as removeScoredMembers from '../../../src/features/value/remove-scored-members';
import { hexOf } from '../../../src/features/value/types';
import { keyContext, neededCommands, planOf, readAnswers, refusalOf, stepTexts, typed, utf8 } from './context';

const hex = (text: string): { readonly hex: string } => ({ hex: hexOf(utf8(text)) });

describe('value.add-member', () => {
  const context = keyContext('value.add-member', { key: 'tags' });

  it('sends TYPE tags, SISMEMBER tags redis, then SADD tags redis', () => {
    expect(addMember.plan(context, { member: typed('redis') }).kind).toBe('read');
    expect(neededCommands(addMember.plan(context, { member: typed('redis'), ...readAnswers('set') }), context)).toEqual(
      ['SISMEMBER tags redis'],
    );
    expect(stepTexts(addMember.plan(context, { member: typed('redis'), ...readAnswers('set', [0]) }))).toEqual([
      'SADD tags redis',
    ]);
  });

  it('refuses a member that is there', () => {
    expect(refusalOf(addMember.plan(context, { member: typed('redis'), ...readAnswers('set', [1]) }))).toEqual({
      code: 'value.add-member/exists',
      message: 'redis is already a member of tags.',
    });
  });

  it('sends a member with a space in quotes', () => {
    expect(stepTexts(addMember.plan(context, { member: typed('key value'), ...readAnswers('set', [0]) }))).toEqual([
      'SADD tags "key value"',
    ]);
  });

  it('refuses on a read-only connection', () => {
    const readOnly = keyContext('value.add-member', { key: 'tags', readOnly: true });
    expect(refusalOf(addMember.plan(readOnly, {}))).toMatchObject({ code: 'value.add-member/read-only' });
  });
});

describe('value.remove-members', () => {
  const context = keyContext('value.remove-members', { key: 'tags' });

  it('asks Remove the member redis from tags? and sends SREM tags redis', () => {
    const outcome = removeMembers.plan(context, { members: [hex('redis')], ...readAnswers('set', [3]) });
    expect(planOf(outcome).title).toBe('Remove the member redis from tags?');
    expect(stepTexts(outcome)).toEqual(['SREM tags redis']);
  });

  it('sends one SREM with three members, and says when one was already gone', () => {
    const members = [hex('a'), hex('b'), hex('c')];
    expect(stepTexts(removeMembers.plan(context, { members, ...readAnswers('set', [10]) }))).toEqual([
      'SREM tags a b c',
    ]);
    const removal = {
      at: { connection: 'c-cache', database: 0, key: utf8('tags') },
      name: 'tags',
      command: 'SREM' as const,
      items: members.map((each) => utf8(Buffer.from(each.hex, 'hex').toString())),
      count: 10,
      words: ['member', 'members'] as const,
    };
    expect(removeFields.removedText(removal as never, 2)).toBe(
      'Removed 2 of 3 members from tags: the others were already gone.',
    );
  });

  it('says the key is deleted with every member', () => {
    const plan = planOf(removeMembers.plan(context, { members: [hex('a')], ...readAnswers('set', [1]) }));
    expect(plan.danger.kind === 'confirm' && plan.danger.text).toBe(
      'They are all the members of tags: the key is deleted with them.',
    );
  });
});

describe('value.add-scored-member', () => {
  const context = keyContext('value.add-scored-member', { key: 'board' });

  it('sends TYPE board, ZSCORE board ada, then ZADD board NX 1.5 ada', () => {
    const answers = { member: typed('ada'), score: '1.5' };
    expect(neededCommands(addScoredMember.plan(context, { ...answers, ...readAnswers('zset') }), context)).toEqual([
      'ZSCORE board ada',
    ]);
    expect(stepTexts(addScoredMember.plan(context, { ...answers, ...readAnswers('zset', [null]) }))).toEqual([
      'ZADD board NX 1.5 ada',
    ]);
  });

  it('sends ZADD board NX 0 ada with the default score, and -inf as it is', () => {
    expect(stepTexts(addScoredMember.plan(context, { member: typed('ada'), ...readAnswers('zset', [null]) }))).toEqual([
      'ZADD board NX 0 ada',
    ]);
    const outcome = addScoredMember.plan(context, {
      member: typed('ada'),
      score: '-inf',
      ...readAnswers('zset', [null]),
    });
    expect(stepTexts(outcome)).toEqual(['ZADD board NX -inf ada']);
  });

  it('refuses a member that is there, with its score', () => {
    const outcome = addScoredMember.plan(context, { member: typed('ada'), score: '1', ...readAnswers('zset', [3]) });
    expect(refusalOf(outcome)).toEqual({
      code: 'value.add-scored-member/exists',
      message: 'ada is already a member of board, with the score 3: change its score instead.',
    });
  });

  it('refuses nan and high as a score', () => {
    for (const score of ['nan', 'high']) {
      expect(refusalOf(addScoredMember.plan(context, { member: typed('ada'), score }))).toEqual({
        code: 'value.add-scored-member/invalid',
        message: 'Enter a number, inf or -inf.',
      });
    }
  });
});

describe('value.change-score', () => {
  const context = keyContext('value.change-score', { key: 'board' });
  const answers = { member: hex('ada'), loaded: '1.5', score: '2.5' };

  it('sends TYPE board, ZSCORE board ada, then ZADD board XX 2.5 ada', () => {
    expect(neededCommands(changeScore.plan(context, { ...answers, ...readAnswers('zset') }), context)).toEqual([
      'ZSCORE board ada',
    ]);
    expect(stepTexts(changeScore.plan(context, { ...answers, ...readAnswers('zset', [1.5]) }))).toEqual([
      'ZADD board XX 2.5 ada',
    ]);
  });

  it('refuses a member removed meanwhile, and does not add it again', () => {
    expect(refusalOf(changeScore.plan(context, { ...answers, ...readAnswers('zset', [null]) }))).toEqual({
      code: 'value.change-score/gone-item',
      message: 'ada is no longer a member of board.',
    });
  });

  it('asks Overwrite when the score was set to 2 meanwhile, and closing it writes nothing', () => {
    const changed = { ...answers, ...readAnswers('zset', [2]) };
    expect(planOf(changeScore.plan(context, changed)).title).toBe(
      'The score of ada in board was changed to 2 in the database after it was loaded. Overwrite it?',
    );
    expect(refusalOf(changeScore.plan(context, { ...changed, overwrite: false }))).toMatchObject({
      code: 'value.change-score/changed',
    });
  });

  it('sends nothing for Enter with the same score', () => {
    expect(planOf(changeScore.plan(context, { ...answers, score: '1.50' })).steps).toEqual([]);
  });
});

describe('value.remove-scored-members', () => {
  const context = keyContext('value.remove-scored-members', { key: 'board' });

  it('asks Remove the member ada from board? and sends ZREM board ada', () => {
    const outcome = removeScoredMembers.plan(context, { members: [hex('ada')], ...readAnswers('zset', [3]) });
    expect(planOf(outcome).title).toBe('Remove the member ada from board?');
    expect(stepTexts(outcome)).toEqual(['ZREM board ada']);
  });

  it('sends one ZREM with three members, and says the key goes with every member', () => {
    const members = [hex('a'), hex('b'), hex('c')];
    const outcome = removeScoredMembers.plan(context, { members, ...readAnswers('zset', [3]) });
    expect(stepTexts(outcome)).toEqual(['ZREM board a b c']);
    const plan = planOf(outcome);
    expect(plan.danger.kind === 'confirm' && plan.danger.text).toBe(
      'They are all the members of board: the key is deleted with them.',
    );
  });
});
