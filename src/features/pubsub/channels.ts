/**
 * Feature: pubsub.channels
 *
 * Lists the channels that have at least one subscriber right now, with how many, so that the user sees what there is
 * to follow. Three commands, on the connection's ordinary client and not on the page's own, each read on its own so
 * that one refused by the server leaves the others: `PUBSUB CHANNELS` (with the list's filter as a pattern), then
 * `PUBSUB NUMSUB` with the first 200 channels by name, and `PUBSUB NUMPAT`. The arguments say which: `{ command:
 * 'channels', filter }`, `{ command: 'numsub', channels }` (their names in hexadecimal) or `{ command: 'numpat' }`;
 * `sent` numbers the requests, so that a reply that arrives after a newer request was sent is dropped.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { text } from './text';
import type { Subscription } from './types';
import { bytesOf, bytesOfHex, hexOf, nameText, pageConnectionOf, sameBytes } from './types';

/** The list shows this many channels, and `PUBSUB NUMSUB` counts them (Datardo's choice). */
export const channelsShown = 200;

/** The list is read again this long after the last key typed in its filter, in milliseconds (Datardo's choice). */
export const filterWaitMs = 300;

/** The list is read again this often while the tab is active and the window visible, in milliseconds (Datardo's choice). */
export const refreshEveryMs = 5000;

/** Each command may take this long, in milliseconds (R9.2). */
export const channelsTimeLimitMs = 5000;

/** What the read is asked: one of its three commands. */
export type ChannelsArgs =
  | { readonly command: 'channels'; readonly filter: string; readonly sent?: number }
  | { readonly command: 'numsub'; readonly channels: readonly string[]; readonly sent?: number }
  | { readonly command: 'numpat'; readonly sent?: number };

/** What the read gives back, with the number of its request. */
export type ChannelsRead =
  | {
      readonly command: 'channels';
      readonly sent: number;
      readonly names: readonly Uint8Array[];
      readonly total: number;
    }
  | { readonly command: 'numsub'; readonly sent: number; readonly counts: readonly (readonly [Uint8Array, number])[] }
  | { readonly command: 'numpat'; readonly sent: number; readonly patterns: number };

/** The pattern `PUBSUB CHANNELS` is sent: the filter as typed when it holds `*`, `?` or `[`, else `*filter*`. */
export function channelsPattern(filter: string): string | undefined {
  const typed = filter.trim();
  if (typed === '') {
    return undefined;
  }
  return /[*?[]/u.test(typed) ? typed : `*${typed.replace(/\\/gu, '\\\\')}*`;
}

function argsOf(args: Json): ChannelsArgs {
  const fields: { readonly [key: string]: Json } =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as { readonly [key: string]: Json }) : {};
  const sent = typeof fields['sent'] === 'number' ? { sent: fields['sent'] } : {};
  const channels = fields['channels'];
  if (fields['command'] === 'numsub' && Array.isArray(channels)) {
    return { command: 'numsub', channels: channels.filter((each) => typeof each === 'string'), ...sent };
  }
  if (fields['command'] === 'numpat') {
    return { command: 'numpat', ...sent };
  }
  return { command: 'channels', filter: typeof fields['filter'] === 'string' ? fields['filter'] : '', ...sent };
}

function words(args: ChannelsArgs): readonly (string | Uint8Array)[] {
  switch (args.command) {
    case 'channels': {
      const pattern = channelsPattern(args.filter);
      return pattern === undefined ? ['PUBSUB', 'CHANNELS'] : ['PUBSUB', 'CHANNELS', pattern];
    }
    case 'numsub':
      return ['PUBSUB', 'NUMSUB', ...args.channels.map((each) => bytesOfHex(each) ?? bytesOf(each))];
    case 'numpat':
      return ['PUBSUB', 'NUMPAT'];
  }
}

/** Feature: pubsub.channels — one of the three commands, on the connection's ordinary client. */
export function request(context: Context, args: Json): ReadRequest {
  const connection = pageConnectionOf(context);
  return {
    kind: 'engine',
    requests:
      connection === undefined
        ? []
        : [{ connection, request: { ...redisCommand(0, ...words(argsOf(args))), timeLimitMs: channelsTimeLimitMs } }],
  };
}

function compareBytes(first: Uint8Array, second: Uint8Array): number {
  const length = Math.min(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (first[index] ?? 0) - (second[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return first.length - second.length;
}

/** The pairs of a reply of `PUBSUB NUMSUB`: a flat array on RESP2, a map on RESP3. */
function pairsOf(reply: RedisReply | undefined): readonly (readonly [Uint8Array, number])[] {
  if (reply !== null && typeof reply === 'object' && 'kind' in reply) {
    return reply.kind === 'map'
      ? reply.entries.flatMap(([name, each]) =>
          name instanceof Uint8Array && typeof each === 'number' ? [[name, each] as const] : [],
        )
      : [];
  }
  const items = Array.isArray(reply) ? (reply as readonly RedisReply[]) : [];
  const pairs: (readonly [Uint8Array, number])[] = [];
  for (let index = 0; index + 1 < items.length; index += 2) {
    const name = items[index];
    const each = items[index + 1];
    if (name instanceof Uint8Array && typeof each === 'number') {
      pairs.push([name, each]);
    }
  }
  return pairs;
}

/** Feature: pubsub.channels — the reply of one command: the channels sorted by name as bytes, their counts, or the patterns. */
export function parse(replies: readonly unknown[], args: Json = null): ChannelsRead {
  const asked = argsOf(args);
  const reply = replies[0] as RedisReply | undefined;
  const sent = asked.sent ?? 0;
  switch (asked.command) {
    case 'channels': {
      const all = (Array.isArray(reply) ? (reply as readonly RedisReply[]) : []).filter(
        (each): each is Uint8Array => each instanceof Uint8Array,
      );
      const names = [...all].sort(compareBytes);
      return { command: 'channels', sent, names: names.slice(0, channelsShown), total: names.length };
    }
    case 'numsub':
      return { command: 'numsub', sent, counts: pairsOf(reply) };
    case 'numpat':
      return { command: 'numpat', sent, patterns: typeof reply === 'number' ? reply : 0 };
  }
}

/** The arguments that count the channels listed: their names in hexadecimal. */
export function countArgs(names: readonly Uint8Array[], sent: number): ChannelsArgs {
  return { command: 'numsub', channels: names.map(hexOf), sent };
}

/** Whether a reply is still wanted: no newer request of the same command was sent since (rule 5). */
export function isNewest(read: ChannelsRead, lastSent: number): boolean {
  return read.sent >= lastSent;
}

/** Whether the list is read again now: the tab is active, the window visible, and the last read 5 seconds old. */
export function isReadDue(tabActive: boolean, windowVisible: boolean, lastReadAt: number, now: number): boolean {
  return tabActive && windowVisible && now - lastReadAt >= refreshEveryMs;
}

/** What the list shows when a command cannot run: a user that may not run it, or a server that does not allow it. */
export function channelsProblem(message: string): string {
  if (message.startsWith('NOPERM')) {
    return text.channels.notAllowed(message);
  }
  return message.startsWith('ERR unknown command') || message.startsWith('ERR unknown subcommand')
    ? text.channels.unknown(message)
    : message;
}

/** One active channel of the list. */
export interface ActiveChannel {
  readonly name: Uint8Array;
  readonly text: string;
  /** The clients subscribed to it by name; absent while unknown or when `PUBSUB NUMSUB` was refused. */
  readonly subscribers?: number;
  /** *(this page too)*, when this page is subscribed to it by name. */
  readonly thisPage?: string;
}

/** What the list **Active channels** shows. */
export interface ActiveChannels {
  readonly channels: readonly ActiveChannel[];
  /** *200 of 12,400 channels*, when there are more. */
  readonly more?: string;
  /** *3 patterns subscribed on the server*, unless `PUBSUB NUMPAT` was refused. */
  readonly patterns?: string;
  /** *No active channels…*, or what the list shows in place of the channels when `PUBSUB CHANNELS` was refused. */
  readonly empty?: string;
}

/** What was read, as the page keeps it: each part absent until read, or the message of the server that refused it. */
export interface ChannelsState {
  readonly names?: Extract<ChannelsRead, { command: 'channels' }>;
  readonly counts?: Extract<ChannelsRead, { command: 'numsub' }>;
  readonly patterns?: Extract<ChannelsRead, { command: 'numpat' }>;
  /** The server's message when `PUBSUB CHANNELS` was refused. */
  readonly refused?: string;
}

function countOf(state: ChannelsState, name: Uint8Array): number | undefined {
  return state.counts?.counts.find(([each]) => sameBytes(each, name))?.[1];
}

/** The list from what was read and the page's subscriptions (rules 1 to 4). */
export function activeChannels(state: ChannelsState, subscriptions: readonly Subscription[]): ActiveChannels {
  if (state.refused !== undefined) {
    return { channels: [], empty: channelsProblem(state.refused) };
  }
  const read = state.names;
  const patterns = state.patterns === undefined ? {} : { patterns: text.channels.patterns(state.patterns.patterns) };
  if (read === undefined || read.total === 0) {
    return { channels: [], ...(read === undefined ? {} : { empty: text.channels.none }), ...patterns };
  }
  const channels = read.names.map((name): ActiveChannel => {
    const subscribers = countOf(state, name);
    const ours = subscriptions.some((each) => each.kind === 'channel' && sameBytes(each.name, name));
    return {
      name,
      text: nameText(name),
      ...(subscribers === undefined ? {} : { subscribers }),
      ...(ours ? { thisPage: text.channels.thisPage } : {}),
    };
  });
  const more = read.total > read.names.length ? { more: text.channels.more(read.names.length, read.total) } : {};
  return { channels, ...more, ...patterns };
}
