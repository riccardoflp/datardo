/**
 * What the cards of the Pub/Sub area share: a subscription, a message as it arrived (its bytes kept, R5.5), the rows
 * of the list of messages, the redis-oplog event a message may be, the Pub/Sub page as the main process keeps it, and
 * how bytes are shown on one line (the rules of `value.format`, until that card is built).
 */
import type { Context } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { connectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Gap, Kept, Message, PubSubPage, Row, SubscriptionKind } from '../../shared/state/pubsub';
import { groupThousands } from '../../shared/text-units';
import { hexText } from '../console/copy-reply';
import { quotedString, utf8Text } from '../console/reply';

export type {
  EventRow,
  Gap,
  Kept,
  Message,
  MessageFilter,
  NameKind,
  OplogEvent,
  OplogLink,
  PageConnection,
  PubSubPage,
  PubSubPages,
  Row,
  Subscription,
  SubscriptionKind,
} from '../../shared/state/pubsub';

/** What arrives to the list, before `pubsub.keep` numbers it. */
export type Arrived =
  | {
      readonly kind: 'message';
      readonly receivedAt: number;
      readonly channel: Uint8Array;
      readonly pattern?: Uint8Array;
      readonly message: Uint8Array;
    }
  | { readonly kind: 'gap'; readonly from: number; readonly to: number };

/** A Pub/Sub page just opened: nothing subscribed, nothing listed. */
export function openedPage(connection: ConnectionId, offsetMinutes: number): PubSubPage {
  return {
    connection,
    pageConnection: 'closed',
    subscriptions: [],
    kept: { listed: [], held: [], paused: false, dropped: 0, next: 1 },
    filter: { text: '' },
    nameKind: 'auto',
    tries: 0,
    selected: [],
    offsetMinutes,
  };
}

/** The Pub/Sub page of a connection in the app's state, when one is open (the part of the state named `pubsubPages`). */
export function pubsubPageOf(state: AppState, connection: ConnectionId): PubSubPage | undefined {
  return state.pubsubPages[connection];
}

/** What ends the id of a page's own client among the clients of the engines. */
const pubsubSuffix = '#pubsub';

/** The name the server sees for the page's connection (`CLIENT LIST` shows `name=datardo-pubsub`). */
export const pubsubClientName = 'datardo-pubsub';

/**
 * The client of the page's own connection, as the engines know it: apart from the connection's ordinary client and
 * from the console's, since a connection that subscribes runs no other command on RESP2 and a flood of messages must
 * not delay the keys tabs.
 */
export function pubsubClient(connection: ConnectionId): ConnectionId {
  return connectionId(`${connection}${pubsubSuffix}`);
}

/** The connection whose Pub/Sub page a client of the engines is, or none when it is another client. */
export function pubsubOwner(client: ConnectionId): ConnectionId | undefined {
  return client.endsWith(pubsubSuffix) ? connectionId(client.slice(0, -pubsubSuffix.length)) : undefined;
}

/** The Redis connection a feature of the page was started on. */
export function pageConnectionOf(context: Context): ConnectionId | undefined {
  const target = context.target;
  return target.kind === 'app' || target.kind === 'tab' ? (context.state.nav.current ?? undefined) : target.connection;
}

/** The arguments an Operation was started with (`Intent.args`), as an object; empty when there are none. */
export function startArgs(answers: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

/** Text as the bytes Redis receives, in UTF-8. */
export function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Whether two byte strings are equal, byte for byte. */
export function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((byte, index) => byte === second[index]);
}

/** The bytes of lower-case hexadecimal digits, or undefined when they are not pairs of digits. */
export function bytesOfHex(hex: string): Uint8Array | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/u.test(hex)) {
    return undefined;
  }
  return Uint8Array.from(hex.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** The bytes in lower-case hexadecimal, without spaces: `00ff41`. */
export function hexOf(bytes: Uint8Array): string {
  return hexText(bytes);
}

/** The text of bytes that are valid UTF-8, strictly, or undefined. */
export function textOf(bytes: Uint8Array): string | undefined {
  return utf8Text(bytes);
}

/** A name as the lists write it: its text, or, when it is not valid UTF-8, as the console writes a string (`\xNN`). */
export function nameText(name: Uint8Array): string {
  return textOf(name) ?? quotedString(name);
}

/** How bytes are shown when the user chose nothing (`value.format`, rules 1 to 5). */
export type ShownFormat = 'text' | 'json' | 'hex';

/** Text of at most this many bytes may be shown as JSON (`value.format`, Datardo's choice). */
export const jsonMostBytes = 1_048_576;

/** Whether text holds a control character other than tab, line feed and carriage return: it is shown in hexadecimal. */
function holdsControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const isLineOrTab = code === 0x09 || code === 0x0a || code === 0x0d;
    if (!isLineOrTab && (code < 0x20 || (code >= 0x7f && code <= 0x9f))) {
      return true;
    }
  }
  return false;
}

function isJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    // Not JSON: the value is shown as text.
    return false;
  }
}

/** Text, JSON or hexadecimal, as `value.format` decides with no choice. */
export function shownFormat(bytes: Uint8Array): ShownFormat {
  const text = textOf(bytes);
  if (text === undefined || holdsControlCharacter(text)) {
    return 'hex';
  }
  return bytes.length <= jsonMostBytes && isJson(text) ? 'json' : 'text';
}

/** A value on one line is cut after this many characters, with `…` (`value.format`, compact; Datardo's choice). */
export const lineMostCharacters = 200;

/** A value in hexadecimal on one line shows this many bytes, then `…` and its length (Datardo's choice). */
export const lineMostBytes = 32;

/** Bytes on one line, as `value.format` writes them compact: text with `↵` and `→`, or pairs of hexadecimal digits. */
export function lineText(bytes: Uint8Array): string {
  if (shownFormat(bytes) === 'hex') {
    const pairs = [...bytes.subarray(0, lineMostBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    return bytes.length > lineMostBytes ? `${pairs} … (${groupThousands(bytes.length)} bytes)` : pairs;
  }
  const characters = Array.from((textOf(bytes) ?? '').replace(/\r?\n|\r/gu, '↵').replace(/\t/gu, '→'));
  return characters.length > lineMostCharacters
    ? `${characters.slice(0, lineMostCharacters).join('')}…`
    : characters.join('');
}

/** The text a value is searched and copied as: its text, or its hexadecimal digits when it is shown in hexadecimal. */
export function searchedText(bytes: Uint8Array): string {
  return shownFormat(bytes) === 'hex' ? hexOf(bytes) : (textOf(bytes) ?? '');
}

/** The messages of the rows, in the order they arrived; a gap stays a row of its own. */
export function messagesOf(rows: readonly Row[]): readonly (Message | Gap)[] {
  return rows
    .flatMap((row): readonly (Message | Gap)[] => (row.kind === 'event' ? row.messages : [row]))
    .sort((first, second) => first.number - second.number);
}

/** The rows the list keeps, the held ones last: what is selected, copied and exported is found among them. */
export function keptRows(kept: Kept): readonly Row[] {
  return [...kept.listed, ...kept.held];
}

/** A channel or a pattern named in the arguments of an intent or a step as `{ kind, hex }`, its name in hexadecimal. */
export interface NamedSubscription {
  readonly kind: SubscriptionKind;
  readonly name: Uint8Array;
}

/** The subscription `{ kind, hex }` names, when it is one. */
export function namedSubscription(value: unknown): NamedSubscription | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { kind, hex } = value as { readonly kind?: unknown; readonly hex?: unknown };
  const name = typeof hex === 'string' ? bytesOfHex(hex) : undefined;
  return (kind === 'channel' || kind === 'pattern') && name !== undefined ? { kind, name } : undefined;
}

/** A subscription as the arguments of an intent or a step name it: `{ kind, hex }`. */
export function subscriptionArgs(subscription: NamedSubscription): {
  readonly kind: SubscriptionKind;
  readonly hex: string;
} {
  return { kind: subscription.kind, hex: hexOf(subscription.name) };
}

/** Whether a message arrived through a subscription: a channel by its name, or a pattern it matched. */
export function isThrough(message: Pick<Message, 'channel' | 'pattern'>, subscription: NamedSubscription): boolean {
  return subscription.kind === 'pattern'
    ? message.pattern !== undefined && sameBytes(message.pattern, subscription.name)
    : message.pattern === undefined && sameBytes(message.channel, subscription.name);
}

/** The rows whose numbers are given, in the order of the list. */
export function rowsNumbered(rows: readonly Row[], numbers: readonly number[]): readonly Row[] {
  const wanted = new Set(numbers);
  return rows.filter((row) => wanted.has(row.number));
}

/** A moment as the computer's clock shows it, in the time zone `offsetMinutes` east of UTC, each part as written. */
export interface LocalTime {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hours: string;
  readonly minutes: string;
  readonly seconds: string;
  readonly milliseconds: string;
}

/** The parts of a moment, in milliseconds since 1970, on the computer's clock. */
export function localTime(milliseconds: number, offsetMinutes: number): LocalTime {
  const shifted = new Date(milliseconds + offsetMinutes * 60_000);
  const two = (value: number): string => String(value).padStart(2, '0');
  return {
    year: String(shifted.getUTCFullYear()),
    month: two(shifted.getUTCMonth() + 1),
    day: two(shifted.getUTCDate()),
    hours: two(shifted.getUTCHours()),
    minutes: two(shifted.getUTCMinutes()),
    seconds: two(shifted.getUTCSeconds()),
    milliseconds: String(shifted.getUTCMilliseconds()).padStart(3, '0'),
  };
}

/** The time of day to the second: `14:05:09`. */
export function clockText(milliseconds: number, offsetMinutes: number): string {
  const time = localTime(milliseconds, offsetMinutes);
  return `${time.hours}:${time.minutes}:${time.seconds}`;
}

/** The number of messages, by the cards' words: *1 message*, *1,204 messages*. */
export function messagesText(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'message' : 'messages'}`;
}
