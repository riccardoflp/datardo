import { describe, expect, it } from 'vitest';
import {
  lastChannelKey,
  messageBytes,
  plan,
  publishedText,
  publishProblem,
} from '../../../src/features/pubsub/publish';
import type { PublishForm } from '../../../src/features/pubsub/publish';
import type { AppState } from '../../../src/shared/state';
import type { Answers, EngineStep, Outcome } from '../../../src/shared/feature';
import {
  bytes,
  cacheLocal,
  cacheProduction,
  pageOf,
  planOf,
  pubsubContext,
  pubsubState,
  recordedReply,
} from './context';
import type { ConnectionView } from '../../../src/shared/connection';

function publish(answers: Answers, connection: ConnectionView = cacheLocal, state: AppState = pubsubState()): Outcome {
  return plan(pubsubContext('pubsub.publish', state, connection), answers);
}

function form(message: string, sendAs: PublishForm['sendAs'] = 'text', channel = 'orders'): Answers {
  return { channel, message, sendAs };
}

function sentBytes(outcome: Outcome): readonly number[] {
  const step = planOf(outcome).steps[0] as EngineStep;
  return step.request.engine === 'redis' ? [...(step.request.command[2] ?? [])] : [];
}

describe('pubsub.publish', () => {
  it('sends PUBLISH orders "{\\"status\\":\\"paid\\"}" for {"status":"paid"} as Text, with no confirmation', () => {
    const planned = planOf(publish(form('{"status":"paid"}')));
    expect(planned.title).toBe('Publish to orders');
    expect(planned.steps.map((step) => step.text)).toEqual(['PUBLISH orders "{\\"status\\":\\"paid\\"}"']);
    expect(planned.danger).toEqual({ kind: 'none' });
    expect((planned.steps[0] as EngineStep).connection).toBe(cacheLocal.id);
  });

  it('notifies how many clients received it, from the reply of PUBLISH', () => {
    expect(publishedText('orders', 2)).toBe('Published to orders: 2 clients received it.');
    expect(publishedText('orders', 1)).toBe('Published to orders: 1 client received it.');
    expect(recordedReply('redis-7.4-pubsub-replies', 'publishNobody')).toBe(0);
    expect(publishedText('orders', 0)).toBe('Published to orders: no client is subscribed, so nobody received it.');
  });

  it('sends a message of 3 bytes for 00 ff 41 as Hexadecimal, and refuses 00 ff 4 with pubsub.publish/invalid-hex', () => {
    expect(sentBytes(publish(form('00 ff 41', 'hex')))).toEqual([0x00, 0xff, 0x41]);
    expect(publishProblem({ channel: 'orders', message: '00 ff 4', sendAs: 'hex' })).toEqual({
      code: 'pubsub.publish/invalid-hex',
      message: 'Hexadecimal is pairs of the digits 0-9 and a-f: 5 digits is not a whole number of bytes.',
    });
    expect(publish(form('00 zz', 'hex'))).toEqual(expect.objectContaining({ code: 'pubsub.publish/invalid-hex' }));
  });

  it('refuses {"status": as JSON, and sends { "status": "paid" } with its spaces', () => {
    expect(publish(form('{"status":', 'json'))).toEqual(
      expect.objectContaining({ code: 'pubsub.publish/invalid-json' }),
    );
    expect(sentBytes(publish(form('{ "status": "paid" }', 'json')))).toEqual([...bytes('{ "status": "paid" }')]);
  });

  it('sends an empty message of 0 bytes', () => {
    expect(sentBytes(publish(form('')))).toEqual([]);
  });

  it('sends line breaks as line feeds', () => {
    expect(messageBytes({ channel: 'orders', message: 'a\r\nb', sendAs: 'text' })).toEqual(bytes('a\nb'));
  });

  it('refuses an empty channel with pubsub.publish/no-channel, and more than 1 MB with pubsub.publish/too-large', () => {
    expect(publish(form('x', 'text', ''))).toEqual(expect.objectContaining({ code: 'pubsub.publish/no-channel' }));
    const large = 'x'.repeat(Math.round(2.4 * 1_048_576));
    expect(publishProblem({ channel: 'orders', message: large, sendAs: 'text' })).toEqual({
      code: 'pubsub.publish/too-large',
      message: 'The message is 2.4 MB: this form sends up to 1 MB.',
    });
  });

  it('refuses on Cache production with pubsub.publish/read-only, and sends nothing', () => {
    expect(publish(form('hello'), cacheProduction)).toEqual(
      expect.objectContaining({ kind: 'refuse', code: 'pubsub.publish/read-only' }),
    );
  });

  it('marks the step as a write, so that the runner’s guard refuses it on a read-only connection', () => {
    expect((planOf(publish(form('hello'))).steps[0] as EngineStep).writes).toBe(true);
  });

  it('adds no operation to the undo history, and its notification has no Undo', () => {
    const planned = planOf(publish(form('hello')));
    expect('cannot' in planned.undo).toBe(true);
    expect(planned.after.some((after) => after.kind === 'notify')).toBe(false);
  });

  it('shows the channel published to last when Publish… is opened again', () => {
    const planned = planOf(publish(form('hello', 'text', 'invoices')));
    const remembered = planned.after.find((after) => after.kind === 'remember');
    expect(remembered).toEqual({ kind: 'remember', key: lastChannelKey, value: { [cacheLocal.id]: 'invoices' } });
    const base = pubsubState([pageOf()]);
    const state = {
      ...base,
      runner: { ...base.runner, remembered: { [lastChannelKey]: { [cacheLocal.id]: 'invoices' } } },
    };
    const asked = publish({}, cacheLocal, state);
    expect(asked.kind === 'ask' ? asked.question.fields[0]?.default : undefined).toBe('invoices');
    const page = pubsubState([pageOf({ lastChannel: 'news' })]);
    const fromPage = publish({}, cacheLocal, page);
    expect(fromPage.kind === 'ask' ? fromPage.question.fields[0]?.default : undefined).toBe('news');
  });

  it('asks with the form Publish a message, saying that a published message cannot be taken back', () => {
    const asked = publish({ args: { channel: 'orders', messageHex: '00ff41' } });
    expect(asked.kind === 'ask' ? [asked.question.title, asked.question.text, asked.question.button] : []).toEqual([
      'Publish a message',
      'A published message cannot be taken back.',
      'Publish',
    ]);
    expect(asked.kind === 'ask' ? asked.question.fields.map((field) => field.default) : []).toEqual([
      'orders',
      '00 ff 41',
      'hex',
    ]);
  });
});
