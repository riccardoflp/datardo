import { describe, expect, it } from 'vitest';
import { countsText, shownMessages } from '../../../src/features/pubsub/filter';
import { messagesAfter, resumedKept } from '../../../src/features/pubsub/keep';
import { view as messages } from '../../../src/features/pubsub/messages';
import type { MessageFilter, Row } from '../../../src/features/pubsub/types';
import { arrived, bytes, keptWith, now, pageOf } from './context';

const three = keptWith([
  arrived('orders', '{"status":"paid"}'),
  arrived('orders', '{"status":"new"}'),
  arrived('invoices', 'PAID 42'),
]);
const rows = three.listed;

function shown(filter: MessageFilter, from: readonly Row[] = rows): readonly number[] {
  return shownMessages(from, filter).map((row) => row.number);
}

describe('pubsub.filter', () => {
  it.each([
    ['', [1, 2, 3]],
    ['paid', [1, 3]],
    ['orders paid', [1]],
    ['ORDERS', [1, 2]],
    ['refund', []],
  ])('with the filter %j shows the rows %j', (typed, expected) => {
    expect(shown({ text: typed })).toEqual(expected);
  });

  it('shows the list with No message matches the filter. when nothing matches', () => {
    const page = pageOf({ kept: three, filter: { text: 'refund' } });
    expect(messages({ page, now }).empty).toBe('No message matches the filter.');
  });

  it('shows only the messages of the subscription chosen: invoices gives the third', () => {
    expect(shown({ text: '', subscription: { kind: 'channel', name: bytes('invoices') } })).toEqual([3]);
  });

  it('tells a message of a channel from one of a pattern when a subscription is chosen', () => {
    const both = keptWith([arrived('orders:1', 'x'), arrived('orders:1', 'x', now, 'orders:*')]).listed;
    expect(shown({ text: '', subscription: { kind: 'pattern', name: bytes('orders:*') } }, both)).toEqual([2]);
    expect(shown({ text: '', subscription: { kind: 'channel', name: bytes('orders:1') } }, both)).toEqual([1]);
  });

  it('keeps a message that does not match, and shows it when the filter is emptied', () => {
    const page = pageOf({ kept: keptWith([arrived('orders', '{"status":"paid"}')]), filter: { text: 'paid' } });
    const kept = messagesAfter(page.kept, [arrived('orders', '{"status":"new"}')]);
    expect(kept.listed).toHaveLength(2);
    expect(shown(page.filter, kept.listed)).toEqual([1]);
    expect(shown({ text: '' }, kept.listed)).toEqual([1, 2]);
  });

  it('applies to the messages a pause held once they are resumed', () => {
    const paused = { ...keptWith([arrived('orders', 'paid')]), paused: true };
    const resumed = resumedKept(messagesAfter(paused, [arrived('orders', 'new'), arrived('orders', 'paid too')]));
    expect(shown({ text: 'paid' }, resumed.listed)).toEqual([1, 3]);
  });

  it('finds a message of the bytes 00 FF 41 by the filter 00ff', () => {
    const binary = keptWith([arrived('orders', Uint8Array.of(0x00, 0xff, 0x41)), arrived('orders', 'text')]).listed;
    expect(shown({ text: '00ff' }, binary)).toEqual([1]);
    expect(shown({ text: '00FF41' }, binary)).toEqual([1]);
  });

  it('looks for the words in the operation, the collection, the document and the fields of an event', () => {
    const event = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
    const linked = keptWith([arrived('app:orders', event), arrived('app:news', 'hello')], {
      ...keptWith([]),
      link: { prefix: 'app:', namespaces: [] },
    }).listed;
    expect(shown({ text: 'update qty' }, linked)).toEqual([1]);
    expect(shown({ text: '"abc"' }, linked)).toEqual([1]);
    expect(shown({ text: 'hello' }, linked)).toEqual([2]);
  });

  it('says 37 of 1,204 messages while a filter is on, and 1,204 messages without', () => {
    expect(countsText(37, 1204, true)).toBe('37 of 1,204 messages');
    expect(countsText(1204, 1204, false)).toBe('1,204 messages');
  });
});
