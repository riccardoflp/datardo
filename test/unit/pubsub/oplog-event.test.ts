import { describe, expect, it } from 'vitest';
import { oplogEvent } from '../../../src/features/pubsub/oplog-event';
import type { OplogEvent, OplogLink } from '../../../src/features/pubsub/types';
import { appLink, bytes, recordedMessages } from './context';

const update = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
const noPrefix: OplogLink = { prefix: '', namespaces: [] };

function eventOf(channel: string, message: string | Uint8Array, link: OplogLink = appLink): OplogEvent | undefined {
  return oplogEvent(bytes(channel), typeof message === 'string' ? bytes(message) : message, link);
}

/** What Mongoster's oplogMessage sends for an event: the channels and the message (oplog.message, its examples). */
function oplogMessage(
  link: OplogLink,
  collection: string,
  id: string,
  message: string,
): { readonly channels: readonly string[]; readonly message: string } {
  const channels = [collection, ...link.namespaces.map((each) => `${each}::${collection}`), `${collection}::${id}`];
  return { channels: channels.map((each) => link.prefix + each), message };
}

describe('pubsub.oplog-event', () => {
  it.each<[string, string, OplogLink, OplogEvent | undefined]>([
    [
      'app:orders',
      update,
      appLink,
      { operation: 'update', collection: 'orders', document: '"abc"', fields: ['qty'], channelKind: 'collection' },
    ],
    [
      'app:tenant1::orders',
      update,
      appLink,
      {
        operation: 'update',
        collection: 'orders',
        document: '"abc"',
        fields: ['qty'],
        channelKind: 'namespace',
        namespace: 'tenant1',
      },
    ],
    [
      'app:orders::abc',
      update,
      appLink,
      { operation: 'update', collection: 'orders', document: '"abc"', fields: ['qty'], channelKind: 'document' },
    ],
    [
      'users::0123456789abcdef01234567',
      '{"e":"i","d":{"_id":{"$type":"oid","$value":"0123456789abcdef01234567"}}}',
      noPrefix,
      {
        operation: 'insert',
        collection: 'users',
        document: 'ObjectId("0123456789abcdef01234567")',
        channelKind: 'document',
      },
    ],
    [
      'c::~3',
      '{"e":"r","d":{"_id":3}}',
      noPrefix,
      { operation: 'remove', collection: 'c', document: '3', channelKind: 'document' },
    ],
    [
      'c::-0123456789abcdef01234567',
      '{"e":"r","d":{"_id":"0123456789abcdef01234567"}}',
      noPrefix,
      { operation: 'remove', collection: 'c', document: '"0123456789abcdef01234567"', channelKind: 'document' },
    ],
    [
      'app:orders',
      '{"e":"u","d":{"_id":"abc","qty":2},"f":["qty"],"u":"k3J"}',
      appLink,
      { operation: 'update', collection: 'orders', document: '"abc"', fields: ['qty'], channelKind: 'collection' },
    ],
    [
      'app:orders::xyz',
      update,
      appLink,
      { operation: 'update', collection: 'orders::xyz', document: '"abc"', fields: ['qty'], channelKind: 'collection' },
    ],
    ['other:orders', update, appLink, undefined],
    ['app:orders', 'hello', appLink, undefined],
    ['app:orders', '{"e":"x","d":{"_id":"abc"}}', appLink, undefined],
    ['app:orders', '{"e":"i","d":{"_id":{"a":1}}}', appLink, undefined],
  ])('reads %s with %s', (channel, message, link, expected) => {
    expect(eventOf(channel, message, link)).toEqual(expected);
  });

  it.each([
    [
      'users',
      'abc',
      '{"e":"u","d":{"_id":"abc"},"f":["a","b.c"]}',
      'update',
      '"abc"',
      { prefix: 'p:', namespaces: ['ns1', 'ns2'] },
    ],
    [
      'users',
      '0123456789abcdef01234567',
      '{"e":"i","d":{"_id":{"$type":"oid","$value":"0123456789abcdef01234567"}}}',
      'insert',
      'ObjectId("0123456789abcdef01234567")',
      noPrefix,
    ],
    ['c', '~3', '{"e":"r","d":{"_id":3}}', 'remove', '3', noPrefix],
    ['c', '-~x', '{"e":"i","d":{"_id":"~x"}}', 'insert', '"~x"', appLink],
    ['c', '--x', '{"e":"i","d":{"_id":"-x"}}', 'insert', '"-x"', appLink],
    ['c', '-{x', '{"e":"i","d":{"_id":"{x"}}', 'insert', '"{x"', appLink],
  ] as const)(
    'gives, on every channel oplog.publish sends for %s %s, the operation, the collection and the _id of the write',
    (...row) => {
      const [collection, id, message, operation, document, link] = row;
      const sent = oplogMessage(link, collection, id, message);
      for (const channel of sent.channels) {
        expect(eventOf(channel, sent.message, link)).toEqual(
          expect.objectContaining({ operation, collection, document }),
        );
      }
    },
  );

  it('never reads a message that is not valid UTF-8 as an event', () => {
    expect(eventOf('app:orders', Uint8Array.of(0x7b, 0xff, 0x7d))).toBeUndefined();
    expect(oplogEvent(Uint8Array.of(0x61, 0x70, 0x70, 0x3a, 0xff), bytes(update), appLink)).toBeUndefined();
  });

  it('reads the event a subscriber received from Redis 7.4 on its three channels', () => {
    const link = { prefix: 'datardo-record:', namespaces: ['tenant1'] };
    const events = recordedMessages().map((each) => oplogEvent(each.channel, each.message, link));
    expect(events.map((each) => each?.channelKind)).toEqual([
      'collection',
      'namespace',
      'document',
      undefined,
      undefined,
    ]);
    expect(events[2]).toEqual(expect.objectContaining({ collection: 'orders', document: '"abc"', fields: ['qty'] }));
  });
});
