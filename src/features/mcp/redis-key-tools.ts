/**
 * Feature: mcp.redis-key-tools
 *
 * The keys of a Redis database a page at a time (`redis_scan_keys`), what a key is (`redis_key_details`), and its
 * value a part at a time (`redis_read_value`). They send only `SCAN`, `TYPE`, `PTTL`, `OBJECT ENCODING`, `MEMORY
 * USAGE`, the length of a type and the reads of a part, in the database asked for (the engine selects it on the MCP
 * server's own client): never `KEYS`, never a write, never a command the assistant writes.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Context } from '../../shared/feature';
import { groupThousands } from '../../shared/text-units';
import { knownTypes } from '../key/types';
import { intArg, keyArg, oneOfArg, redisDatabaseArg, stringArg, toolConnection } from './arguments';
import { bounds, counted, fittedItems, SCAN_CALLS, SCAN_COUNT } from './output-limits';
import { utcText } from './tool/mongo';
import { ToolProblem, type ToolSession } from './tool/program';
import { keyText, redisCall, redisReply, replyItems, replyNumber, replyText } from './tool/redis';
import { connectionProp, endOf, groupOf, integerProp, keyProp, namesProp, redisDatabaseProp } from './tool/schemas';
import { shortDuration, sizeText } from './tool/units';
import { partOf, partRequests } from './tool/value-parts';
import type { ToolCall, ToolEnd, ToolStep } from './types';

/** A key of a database of a connection, as the tools find it. */
interface KeyPlace {
  readonly connection: ConnectionView;
  readonly database: number;
}

function placeOf(session: ToolSession): KeyPlace {
  const connection = toolConnection(session, 'redis');
  return { connection, database: redisDatabaseArg(session.args, connection) };
}

function call(place: KeyPlace, words: readonly (string | Uint8Array)[]) {
  return redisCall(place.connection.id, place.database, words);
}

function replies(session: ToolSession, place: KeyPlace, sent: readonly (readonly (string | Uint8Array)[])[]) {
  const where = { connectionName: place.connection.name, database: place.database };
  return session.send(sent.map((words) => call(place, words))).map((reply) => redisReply(reply, where));
}

/** `SCAN <cursor> MATCH <pattern> COUNT <n>`, with ` TYPE <type>` when a type is given; `n` is the limit, at most 500. */
export function scanWords(cursor: string, pattern: string, limit: number, type: string | undefined): readonly string[] {
  return [
    'SCAN',
    cursor,
    'MATCH',
    pattern,
    'COUNT',
    String(Math.min(limit, SCAN_COUNT)),
    ...(type === undefined ? [] : ['TYPE', type]),
  ];
}

interface ScanFound {
  readonly keys: readonly Uint8Array[];
  readonly cursor: string;
}

function scan(
  session: ToolSession,
  place: KeyPlace,
  asked: { cursor: string; pattern: string; limit: number; type?: string },
): ScanFound {
  const keys = new Map<string, Uint8Array>();
  let cursor = asked.cursor;
  for (let calls = 0; calls < SCAN_CALLS; calls += 1) {
    const [reply] = replies(session, place, [scanWords(cursor, asked.pattern, asked.limit, asked.type)]);
    const [next, found] = replyItems(reply);
    cursor = replyText(next);
    for (const key of replyItems(found)) {
      if (key instanceof Uint8Array) {
        keys.set(keyText(key), key);
      }
    }
    if (keys.size >= asked.limit || cursor === '0') {
      break;
    }
  }
  return { keys: [...keys.values()], cursor };
}

function scanKeys(session: ToolSession): string {
  const place = placeOf(session);
  const pattern = stringArg(session.args, 'pattern') ?? '*';
  const type = oneOfArg(session.args, 'type', knownTypes);
  const start = stringArg(session.args, 'cursor') ?? '0';
  if (!/^\d+$/u.test(start)) {
    throw new ToolProblem('cursor must be the cursor returned by redis_scan_keys.');
  }
  const range = bounds.keys;
  const limit = intArg(session.args, 'limit', range);
  const found = scan(session, place, { cursor: start, pattern, limit, ...(type === undefined ? {} : { type }) });
  const types =
    type === undefined
      ? replies(
          session,
          place,
          found.keys.map((key) => ['TYPE', key]),
        ).map(replyText)
      : [];
  const lines = found.keys.map((key, index) => `- ${keyText(key)} · ${type ?? types[index] ?? 'none'}`);
  const fitted = fittedItems(lines);
  const complete = found.cursor === '0';
  const where = `${place.connection.name} db${String(place.database)}`;
  const typed = type === undefined ? '' : ` (type ${type})`;
  const ending = complete ? 'the scan is complete.' : 'the scan is not finished.';
  const head =
    found.keys.length === 0
      ? `${where}: no keys match ${pattern}${typed}${complete ? ', the scan is complete.' : ' so far, the scan is not finished.'}`
      : `${where}: ${counted(found.keys.length, 'key')} ${found.keys.length === 1 ? 'matches' : 'match'} ${pattern}${typed}, ${ending}`;
  const foot =
    fitted.left > 0
      ? [
          `${counted(fitted.left, 'more key', 'more keys')} didn't fit in the output: scan again from the same cursor with a smaller limit.`,
          `Cursor: ${start}`,
        ]
      : complete
        ? []
        : [`Cursor: ${found.cursor}`, '(pass it as cursor to go on from here)'];
  return [
    head,
    ...(fitted.shown.length === 0 ? [] : ['', ...fitted.shown]),
    ...(foot.length === 0 ? [] : ['', ...foot]),
  ].join('\n');
}

const lengthCommands: Readonly<Record<string, readonly [string, string, string]>> = {
  string: ['STRLEN', 'Bytes', 'Bytes'],
  hash: ['HLEN', 'Fields', 'fields'],
  list: ['LLEN', 'Elements', 'elements'],
  set: ['SCARD', 'Members', 'members'],
  zset: ['ZCARD', 'Members', 'members'],
  stream: ['XLEN', 'Entries', 'entries'],
};

function missingKey(key: Uint8Array, place: KeyPlace): ToolProblem {
  return new ToolProblem(
    `The key ${keyText(key)} doesn't exist in db${String(place.database)} of ${place.connection.name}: use redis_scan_keys.`,
  );
}

/** `Expiry: in 59 m 12 s (2026-11-18T10:20:30Z)`, or `Expiry: none (the key is persistent)`. */
export function expiryLine(timeLeftMs: number | undefined, now: number): string {
  if (timeLeftMs === undefined || timeLeftMs < 0) {
    return 'Expiry: none (the key is persistent)';
  }
  return `Expiry: in ${shortDuration(timeLeftMs / 1000)} (${utcText(now + timeLeftMs)})`;
}

function keyDetails(session: ToolSession): string {
  const place = placeOf(session);
  const key = keyArg(session.args);
  const [type, timeLeft, encoding, memory] = replies(session, place, [
    ['TYPE', key],
    ['PTTL', key],
    ['OBJECT', 'ENCODING', key],
    ['MEMORY', 'USAGE', key],
  ]);
  const typeName = replyText(type);
  if (typeName === 'none' || replyNumber(timeLeft) === -2) {
    throw missingKey(key, place);
  }
  const length = lengthCommands[typeName];
  const [count] = length === undefined ? [] : replies(session, place, [[length[0], key]]);
  const bytes = replyNumber(memory);
  return [
    `${keyText(key)} in db${String(place.database)} of ${place.connection.name}`,
    `Type: ${typeName}`,
    ...(replyText(encoding) === '' ? [] : [`Encoding: ${replyText(encoding)}`]),
    ...(length === undefined ? [] : [`${length[1]}: ${groupThousands(replyNumber(count) ?? 0)}`]),
    `Memory: ${bytes === undefined ? 'unknown' : sizeText(bytes)}`,
    expiryLine(replyNumber(timeLeft), session.context.now),
  ].join('\n');
}

function readValue(session: ToolSession): string {
  const place = placeOf(session);
  const key = keyArg(session.args);
  const match = stringArg(session.args, 'match');
  const range = bounds.items;
  const count = intArg(session.args, 'count', range);
  const [type] = replies(session, place, [['TYPE', key]]);
  const typeName = replyText(type);
  if (typeName === 'none') {
    throw missingKey(key, place);
  }
  if (!(knownTypes as readonly string[]).includes(typeName)) {
    throw new ToolProblem(
      `The value of ${keyText(key)} (type ${typeName}) can't be read: Datardo doesn't show the values of module types.`,
    );
  }
  if (match !== undefined && typeName !== 'hash' && typeName !== 'set') {
    throw new ToolProblem('match is for hashes and sets.');
  }
  const from = stringArg(session.args, 'from');
  const asked = {
    connection: place.connection.id,
    database: place.database,
    key,
    type: typeName,
    count,
    ...(from === undefined ? {} : { from }),
    ...(match === undefined ? {} : { match }),
  };
  const where = { connectionName: place.connection.name, database: place.database };
  const part = partOf(
    asked,
    session.send(partRequests(asked)).map((reply) => redisReply(reply, where)),
  );
  const end = part.next === undefined ? 'That is the end of the value.' : `Next: from ${part.next}`;
  return [part.head, ...part.lines, '', end].join('\n');
}

/** The tools of this group. */
export const group = groupOf('mcp.redis-key-tools', [
  {
    name: 'redis_scan_keys',
    title: 'Scan the keys of a Redis database',
    description:
      'The keys of a Redis database that match a pattern, and their types, found with SCAN from a cursor (never KEYS). Call it again with the cursor it returns to go on.',
    properties: {
      connection: connectionProp,
      database: redisDatabaseProp,
      pattern: { type: 'string', default: '*', description: 'A glob-style pattern, e.g. orders:*.' },
      type: namesProp(knownTypes, 'Only the keys of this type.'),
      cursor: { type: 'string', default: '0', description: 'The cursor returned by the last call; 0 to start.' },
      limit: integerProp(1, 1000, 100, 'Keys to find.'),
    },
    required: ['connection'],
    run: scanKeys,
  },
  {
    name: 'redis_key_details',
    title: 'Describe a Redis key',
    description:
      "A key's type, encoding, number of fields, elements, members or entries (bytes for a string), memory used and expiry. Never its value.",
    properties: { connection: connectionProp, database: redisDatabaseProp, key: keyProp },
    required: ['connection', 'key'],
    run: keyDetails,
  },
  {
    name: 'redis_read_value',
    title: 'Read the value of a Redis key',
    description:
      'A part of the value of a key: bytes of a string, fields of a hash, elements of a list, members of a set or of a sorted set with their scores, entries of a stream; then where the next part starts (pass it as from).',
    properties: {
      connection: connectionProp,
      database: redisDatabaseProp,
      key: keyProp,
      from: {
        type: 'string',
        description: 'Where the part starts: a byte offset, a cursor, an index, a rank or an entry ID.',
      },
      count: integerProp(1, 100, 20, 'Fields, elements, members or entries to read.'),
      match: { type: 'string', description: 'A pattern for the fields of a hash or the members of a set.' },
    },
    required: ['connection', 'key'],
    readsData: true,
    run: readValue,
  },
]);

/** Feature: mcp.redis-key-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.redis-key-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
