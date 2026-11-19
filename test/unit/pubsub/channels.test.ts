import { describe, expect, it } from 'vitest';
import {
  activeChannels,
  channelsShown,
  countArgs,
  isNewest,
  isReadDue,
  parse,
  request,
  type ChannelsState,
} from '../../../src/features/pubsub/channels';
import { commandLine } from '../../../src/features/runner/step-text';
import type { Json, RedisReply } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { bytes, now, pubsubContext, pubsubState, recordedReply } from './context';

function sent(args: Json): string {
  const read: ReadRequest = request(pubsubContext('pubsub.channels', pubsubState()), args);
  const first = read.kind === 'engine' ? read.requests[0] : undefined;
  return first?.request.engine === 'redis' ? commandLine(first.request.command) : '';
}

function recorded(part: string): RedisReply {
  return recordedReply('redis-7.4-pubsub-replies', part);
}

function listed(names: RedisReply, counts?: RedisReply, patterns?: RedisReply): ChannelsState {
  return {
    names: parse([names], { command: 'channels', filter: '' }) as NonNullable<ChannelsState['names']>,
    ...(counts === undefined
      ? {}
      : { counts: parse([counts], { command: 'numsub', channels: [] }) as NonNullable<ChannelsState['counts']> }),
    ...(patterns === undefined
      ? {}
      : { patterns: parse([patterns], { command: 'numpat' }) as NonNullable<ChannelsState['patterns']> }),
  };
}

describe('pubsub.channels', () => {
  it('sends PUBSUB CHANNELS, then PUBSUB NUMSUB with the channels and PUBSUB NUMPAT, on the ordinary client', () => {
    expect(sent({ command: 'channels', filter: '' })).toBe('PUBSUB CHANNELS');
    expect(sent(countArgs([bytes('orders'), bytes('invoices')], 1) as Json)).toBe('PUBSUB NUMSUB orders invoices');
    expect(sent({ command: 'numpat' })).toBe('PUBSUB NUMPAT');
    const read = request(pubsubContext('pubsub.channels', pubsubState()), { command: 'numpat' });
    expect(read.kind === 'engine' ? read.requests[0]?.connection : undefined).toBe('c-cache');
  });

  it('sends PUBSUB CHANNELS *inv* for the filter inv, and PUBSUB CHANNELS inv:* for inv:*', () => {
    expect(sent({ command: 'channels', filter: 'inv' })).toBe('PUBSUB CHANNELS *inv*');
    expect(sent({ command: 'channels', filter: 'inv:*' })).toBe('PUBSUB CHANNELS inv:*');
  });

  it('lists invoices with 1 and orders with 2, in that order, from the replies of Redis 7.4', () => {
    const shown = activeChannels(listed(recorded('channels'), recorded('numsub'), recorded('numpat')), []);
    expect(shown.channels.map((each) => [each.text, each.subscribers])).toEqual([
      ['datardo-record:invoices', 1],
      ['datardo-record:orders', 2],
    ]);
    expect(shown.patterns).toBe('1 pattern subscribed on the server');
  });

  it('says (this page too) of a channel this page is subscribed to by name', () => {
    const subscriptions = [
      { kind: 'channel' as const, name: bytes('datardo-record:orders'), answered: true, received: 0 },
    ];
    const shown = activeChannels(listed(recorded('channels'), recorded('numsub')), subscriptions);
    expect(shown.channels.map((each) => each.thisPage)).toEqual([undefined, '(this page too)']);
  });

  it('counts the first 200 of 12,400 channels by name, and says 200 of 12,400 channels', () => {
    const many = Array.from({ length: 12_400 }, (_, index) => bytes(`c${String(index).padStart(5, '0')}`));
    const names = parse([many.slice().reverse()], { command: 'channels', filter: '' });
    expect(names.command === 'channels' ? [names.names.length, names.total] : []).toEqual([channelsShown, 12_400]);
    const args = names.command === 'channels' ? countArgs(names.names, 2) : { command: 'numpat' as const };
    expect(args.command === 'numsub' ? args.channels.length : 0).toBe(200);
    expect(activeChannels({ names: names as NonNullable<ChannelsState['names']> }, []).more).toBe(
      '200 of 12,400 channels',
    );
  });

  it('sorts the channels by name as bytes', () => {
    const names = parse([[bytes('b'), Uint8Array.of(0xff), bytes('a'), bytes('B')]], {
      command: 'channels',
      filter: '',
    });
    expect(names.command === 'channels' ? names.names.map((each) => [...each]) : []).toEqual([
      [0x42],
      [0x61],
      [0x62],
      [0xff],
    ]);
  });

  it('reads nothing while another tab is active or the window hidden, and every 5 seconds otherwise', () => {
    expect(isReadDue(false, true, now - 30_000, now)).toBe(false);
    expect(isReadDue(true, false, now - 30_000, now)).toBe(false);
    expect(isReadDue(true, true, now - 4999, now)).toBe(false);
    expect(isReadDue(true, true, now - 5000, now)).toBe(true);
  });

  it('shows No active channels… on a server with no subscriber', () => {
    expect(activeChannels(listed([]), []).empty).toBe('No active channels: nobody is subscribed to a channel by name.');
  });

  it('shows PUBSUB CHANNELS needs a user that may run it: … to a user whose ACL denies PUBSUB', () => {
    const refused = new TextDecoder().decode(recorded('datardo-record-no-pubsub') as Uint8Array);
    expect(refused.startsWith('NOPERM')).toBe(true);
    expect(activeChannels({ refused }, [])).toEqual({
      channels: [],
      empty: `PUBSUB CHANNELS needs a user that may run it: ${refused}`,
    });
  });

  it('says that the server does not allow PUBSUB CHANNELS on an unknown command or subcommand', () => {
    expect(activeChannels({ refused: "ERR unknown subcommand 'CHANNELS'" }, []).empty).toBe(
      "This server does not allow PUBSUB CHANNELS: ERR unknown subcommand 'CHANNELS'",
    );
  });

  it('lists the channels without counts when only PUBSUB NUMSUB is refused, and leaves out the patterns', () => {
    const shown = activeChannels(listed(recorded('channels')), []);
    expect(shown.channels.every((each) => each.subscribers === undefined)).toBe(true);
    expect(shown.patterns).toBeUndefined();
  });

  it('drops a reply that arrives after a newer request was sent', () => {
    const old = parse([[]], { command: 'channels', filter: 'a', sent: 3 });
    expect(isNewest(old, 4)).toBe(false);
    expect(isNewest(old, 3)).toBe(true);
  });
});
