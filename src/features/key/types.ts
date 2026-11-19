/**
 * What the cards of the keys area share (key.md, the lines every card shares): names as bytes and their text, the
 * types of keys, where the keys are (a connection and a database), the steps of a write, and what the undo history
 * keeps of keys.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json, RedisReply } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { After, Answers, Context, EngineStep, NotificationAction, ReadRequest, Undo } from '../../shared/feature';
import { featureId, type ConnectionId, type RefusalCode } from '../../shared/ids';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { stepText } from '../runner/step-text';
import { setting } from '../settings/read';
import { keepsJson, keyNameOf } from '../undo/types';
import { text } from './text';

/** A key's name: its bytes, never assumed to be UTF-8 (glossary, "key": `KeyRef`). */
export type KeyName = Uint8Array;

/** The six types of values Datardo shows, as `TYPE` answers them. */
export const knownTypes = ['string', 'hash', 'list', 'set', 'zset', 'stream'] as const;

/** A type of value Datardo shows. */
export type KnownType = (typeof knownTypes)[number];

/** The type of a key as `TYPE` answers it: one of the six, or the name a module gives (`ReJSON-RL`). */
export type KeyType = string;

/** The type filter of a keys tab: **All types**, or one of the six. */
export type TypeFilter = 'all' | KnownType;

/** Whether a type is one of the six Datardo shows. */
export function isKnownType(type: KeyType): type is KnownType {
  return (knownTypes as readonly string[]).includes(type);
}

/** The type as the table and the inspector island name it: **Hash**, **Sorted set**, or a module's name as it is. */
export function typeLabel(type: KeyType): string {
  return isKnownType(type) ? text.types[type] : type;
}

/** The type as a sentence names it: `hash`, `sorted set`, or a module's name as it is. */
export function typeWord(type: KeyType): string {
  return isKnownType(type) ? text.typeWords[type] : type;
}

/** The type filter read from what a control sent; **All types** for anything else. */
export function typeFilterOf(value: unknown): TypeFilter {
  return typeof value === 'string' && isKnownType(value) ? value : 'all';
}

/** The bytes in lower-case hexadecimal: how a name crosses the bridge inside JSON arguments. */
export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The bytes of a hexadecimal text, or `undefined` when it is not one. */
export function bytesOfHex(hex: string): Uint8Array | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/u.test(hex)) {
    return undefined;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Text as the bytes of a name, in UTF-8: what the user types is sent as UTF-8. */
export function nameOfText(typed: string): KeyName {
  return new TextEncoder().encode(typed);
}

/** Whether two names are the same bytes. */
export function isSameName(one: KeyName, other: KeyName): boolean {
  return one.length === other.length && one.every((byte, index) => byte === other[index]);
}

/** The name as text, when it is valid UTF-8 without control characters; `undefined` otherwise. */
export function textOfName(name: KeyName): string | undefined {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(name);
  } catch {
    // Not UTF-8: the caller writes the bytes as value.quote does.
    return undefined;
  }
  return /[\p{Cc}]/u.test(decoded) ? undefined : decoded;
}

/** The name as the user reads it (key.md, "Names are bytes"): as text, or as `value.quote` writes it. */
export function nameText(name: KeyName): string {
  return textOfName(name) ?? quoted(name);
}

/** Whether a byte is written bare by `value.quote`: printable ASCII but the space, `"`, `'` and `\`. */
function isBareByte(byte: number): boolean {
  return byte >= 0x21 && byte <= 0x7e && byte !== 0x22 && byte !== 0x27 && byte !== 0x5c;
}

const escapes: Readonly<Record<number, string>> = { 0x22: '\\"', 0x5c: '\\\\', 0x0a: '\\n', 0x0d: '\\r', 0x09: '\\t' };

/** The length of the valid UTF-8 character above U+009F at `index`, or 0 when the byte is to be escaped. */
function characterLength(bytes: Uint8Array, index: number): number {
  const first = bytes[index] ?? 0;
  const length = first >= 0xf0 && first < 0xf5 ? 4 : first >= 0xe0 && first < 0xf0 ? 3 : first >= 0xc2 ? 2 : 0;
  if (length === 0 || first > 0xf4 || index + length > bytes.length) {
    return 0;
  }
  try {
    const character = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(index, index + length));
    return (character.codePointAt(0) ?? 0) > 0x9f ? length : 0;
  } catch {
    // Not a valid sequence: each of its bytes is written as \xHH.
    return 0;
  }
}

/**
 * Bytes as one argument of a command, in full, as a file and the clipboard hold it (`value.quote`, rules 1 to 3):
 * bare when every byte is printable ASCII other than the space and the quotes and it does not start with `#`;
 * otherwise in double quotes with `\"`, `\\`, `\n`, `\r`, `\t`, characters above U+009F as themselves and `\xHH`.
 * `value.quote` is M14's card: this is its rule for files, until that card is built.
 */
export function quoted(bytes: Uint8Array): string {
  if (bytes.length > 0 && bytes[0] !== 0x23 && bytes.every(isBareByte)) {
    return new TextDecoder().decode(bytes);
  }
  let written = '';
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    const length = byte >= 0x80 ? characterLength(bytes, index) : 0;
    if (length > 0) {
      written += new TextDecoder().decode(bytes.subarray(index, index + length));
      index += length;
      continue;
    }
    const escape = escapes[byte];
    written +=
      escape ?? (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : `\\x${byte.toString(16).padStart(2, '0')}`);
    index += 1;
  }
  return `"${written}"`;
}

/** `db0`: a database as the confirmations, the notifications and the path name it. */
export function databaseName(database: number): string {
  return `db${String(database)}`;
}

/** Where the keys of a feature are: a saved Redis connection, one of its databases, and a key when there is one. */
export interface KeysPlace {
  readonly connection: ConnectionView;
  readonly database: number;
  readonly key?: KeyName;
  /** The namespace of the tab or the node, with its separator (`orders:`). */
  readonly namespace?: string;
}

/** The arguments a feature was started with (`Intent.args`), as an object; empty when there are none. */
export function argsOf(answers: Answers): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

/** The fields of a JSON object; empty for any other value. */
export function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The names of a list of hexadecimal texts, leaving out what is not one. */
export function namesOfHex(value: unknown): readonly KeyName[] {
  return Array.isArray(value)
    ? value.flatMap((each) => {
        const bytes = typeof each === 'string' ? bytesOfHex(each) : undefined;
        return bytes === undefined ? [] : [bytes];
      })
    : [];
}

function redisConnection(context: Context, connection: ConnectionId): ConnectionView | undefined {
  const saved = savedConnection(context.state.connections, connection);
  return saved?.engine === 'redis' ? saved : undefined;
}

function tabPlace(context: Context, tab: string): KeysPlace | undefined {
  const shows = context.state.tabs.tabs.find((each) => each.id === tab)?.shows;
  if (shows?.kind !== 'keys' && shows?.kind !== 'key') {
    return undefined;
  }
  const connection = redisConnection(context, shows.connection);
  if (connection === undefined) {
    return undefined;
  }
  if (shows.kind === 'keys') {
    return {
      connection,
      database: shows.database,
      ...(shows.namespace === undefined ? {} : { namespace: shows.namespace }),
    };
  }
  const key = shows.keyHex === undefined ? nameOfText(shows.key) : bytesOfHex(shows.keyHex);
  return { connection, database: shows.database, ...(key === undefined ? {} : { key }) };
}

/**
 * Where a feature was started: a key, a database, a connection (its `db0`) or a keys tab or key tab. `args.key` (the
 * name in hexadecimal) and `args.namespace` add to a database.
 */
export function placeOf(context: Context, answers: Answers = {}): KeysPlace | undefined {
  const target = context.target;
  const args = argsOf(answers);
  const namespace = typeof args['namespace'] === 'string' ? { namespace: args['namespace'] } : {};
  const asked = typeof args['key'] === 'string' ? bytesOfHex(args['key']) : undefined;
  switch (target.kind) {
    case 'key': {
      const connection = redisConnection(context, target.connection);
      return connection === undefined ? undefined : { connection, database: target.database, key: target.key };
    }
    case 'redis-database':
    case 'connection': {
      const connection = redisConnection(context, target.connection);
      const database = target.kind === 'redis-database' ? target.database : 0;
      return connection === undefined
        ? undefined
        : { connection, database, ...namespace, ...(asked === undefined ? {} : { key: asked }) };
    }
    case 'tab':
      return tabPlace(context, target.tab);
    case 'app':
    case 'database':
    case 'collection':
      return undefined;
  }
}

/** Whether the connection is connected now. */
export function isConnected(context: Context, place: KeysPlace): boolean {
  return connectionState(context.state.connections, place.connection.id) === 'connected';
}

/** The separator of namespaces (`datardo.key.separator`). */
export function separatorOf(context: Context): string {
  return setting(context.state.settings, 'datardo.key.separator');
}

/** A command that writes to the database of the place, with its text as `runner.step-text` writes it. */
export function writeStep(place: KeysPlace, words: readonly (string | Uint8Array)[], database?: number): EngineStep {
  const step = {
    kind: 'engine' as const,
    connection: place.connection.id,
    request: redisCommand(database ?? place.database, ...words),
    writes: true,
  };
  return { ...step, text: stepText(step) };
}

/** The steps of one command over many names, `size` names a command, in the order given. */
export function stepsInBatches(
  place: KeysPlace,
  command: string,
  names: readonly KeyName[],
  size: number,
): readonly EngineStep[] {
  const steps: EngineStep[] = [];
  for (let start = 0; start < names.length; start += size) {
    steps.push(writeStep(place, [command, ...names.slice(start, start + size)]));
  }
  return steps;
}

/** What the undo history keeps for a plan: the keys with these names, in a database (`undo.record`). */
export function keysKept(database: number, names: readonly KeyName[]): Undo {
  return { keeps: keepsJson({ kind: 'keys', database, keys: names.map(keyNameOf) }) };
}

/** Whether a write of a number of keys will be recorded, and the line its confirmation says about undo. */
export interface UndoNote {
  readonly recorded: boolean;
  readonly line: string;
}

/**
 * Whether a write to keys will be recorded, as `undo.note` (M11) decides it: the undo history on for the app and
 * for the connection, and no more keys than `datardo.undo.maxDocumentsPerOperation`.
 */
export function undoNote(context: Context, place: KeysPlace, count: number): UndoNote {
  const settings = context.state.settings;
  if (!setting(settings, 'datardo.undo.enabled') || !place.connection.keepsUndo) {
    return { recorded: false, line: text.undo.off };
  }
  const most = setting(settings, 'datardo.undo.maxDocumentsPerOperation');
  return count > most
    ? { recorded: false, line: text.undo.overLimit(most) }
    : { recorded: true, line: text.undo.recorded };
}

/** The undo of a write to these keys: kept when it is recorded, why it cannot be otherwise. */
export function keysUndo(context: Context, place: KeysPlace, names: readonly KeyName[], database?: number): Undo {
  const note = undoNote(context, place, names.length);
  return note.recorded ? keysKept(database ?? place.database, names) : { cannot: note.line };
}

/** A reply as a number, when it is one. */
export function numberOf(reply: RedisReply | undefined): number | undefined {
  return typeof reply === 'number' ? reply : undefined;
}

/** A reply of bytes as text (a `TYPE`, an `OBJECT ENCODING`), when it is bytes. */
export function wordOf(reply: RedisReply | undefined): string | undefined {
  return reply instanceof Uint8Array ? new TextDecoder().decode(reply) : undefined;
}

/** Whether a reply is an error the server gave inside a reply. */
export function isErrorReply(
  reply: RedisReply | undefined,
): reply is { readonly kind: 'error'; readonly message: string } {
  return (
    typeof reply === 'object' &&
    reply !== null &&
    !(reply instanceof Uint8Array) &&
    'kind' in reply &&
    reply.kind === 'error'
  );
}

/** The arguments of a read of one key on a database: `{ connection, database, key }`, the name in hexadecimal. */
export function keyArgs(place: KeysPlace, name: KeyName, database?: number): Json {
  return { connection: place.connection.id, database: database ?? place.database, key: hexOf(name) };
}

/** The connection, the database and the key of {@link keyArgs}. */
export function keyOfArgs(args: Json): { connection: ConnectionId; database: number; key: KeyName } {
  const fields = fieldsOf(args);
  return {
    connection: (typeof fields['connection'] === 'string' ? fields['connection'] : '') as ConnectionId,
    database: typeof fields['database'] === 'number' ? fields['database'] : 0,
    key: (typeof fields['key'] === 'string' ? bytesOfHex(fields['key']) : undefined) ?? new Uint8Array(),
  };
}

/** A read of one command on one key: `EXISTS <key>`, `TYPE <key>`. */
export function oneKeyRequest(command: string, args: Json): ReadRequest {
  const asked = keyOfArgs(args);
  return {
    kind: 'engine',
    requests: [{ connection: asked.connection, request: redisCommand(asked.database, command, asked.key) }],
  };
}

/** Whether `EXISTS` answered that the key exists. */
export function parseExists(replies: readonly unknown[]): boolean {
  return numberOf(replies[0] as RedisReply) === 1;
}

/** What `TYPE` answered: the type, or `none` for a key that does not exist. */
export function parseType(replies: readonly unknown[]): KeyType {
  return wordOf(replies[0] as RedisReply) ?? 'none';
}

/** What a step's reply means for the user, once it has run: done, a refusal, or a notification instead. */
export type ReplyOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'refuse'; readonly code: RefusalCode; readonly message: string }
  | { readonly kind: 'notify'; readonly level: 'info' | 'warning'; readonly text: string };

/** The outcome of a reply that is a refusal, its code written whole by the caller. */
export function refusedReply(code: string, message: string): ReplyOutcome {
  return { kind: 'refuse', code: code as RefusalCode, message };
}

/** A notification of success, as the runner shows it after the steps; the runner adds **Undo** when recorded. */
export function notifySuccess(message: string, actions: readonly NotificationAction[] = []): After {
  return { kind: 'notify', level: 'success', text: message, ...(actions.length === 0 ? {} : { actions }) };
}

/** What follows every write to keys: the pages of the connection are read again (the keys tab, the tree). */
export function refreshAfter(place: KeysPlace): After {
  return { kind: 'refresh', connection: place.connection.id };
}

/** The open key tabs of these keys, to close once they are deleted (`tab.close`). */
export function closeKeyTabs(context: Context, place: KeysPlace, names: readonly KeyName[]): readonly After[] {
  const wanted = new Set(names.map(hexOf));
  return context.state.tabs.tabs.flatMap((tab): After[] => {
    const shows = tab.shows;
    if (shows.kind !== 'key' || shows.connection !== place.connection.id || shows.database !== place.database) {
      return [];
    }
    const hex = shows.keyHex ?? hexOf(nameOfText(shows.key));
    return wanted.has(hex)
      ? [{ kind: 'start', feature: featureId('tab.close'), target: { kind: 'app' }, args: { tab: tab.id } }]
      : [];
  });
}

/** The connection's name as a file name: `cache-local`. */
export function fileNameOf(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return slug === '' ? 'redis' : slug;
}

/** The refusal of a write on a read-only connection: *The connection Cache local is read-only.* */
export function readOnlyMessage(place: KeysPlace): string {
  return text.readOnly(place.connection.name);
}
