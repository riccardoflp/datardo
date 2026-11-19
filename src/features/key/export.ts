/**
 * Feature: key.export
 *
 * Writes keys to a file of Redis commands that creates them again (D37). The plan is one file step whose writer,
 * `key.export`, reads each key a page at a time with the commands this module builds ({@link headCommands},
 * {@link nextValueCommand}, {@link afterValueReply}) and writes the lines of `key.export-text`, beside the file as
 * `.part`, renamed when complete.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import type { Answers, Context, FileStep, Outcome, ReadFeature } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { isVersionAtLeast } from '../connection/server-info';
import { stepText } from '../runner/step-text';
import type { BytePair, ExportedValue, StreamEntry } from './export-text';
import { scoreText, stringPart } from './export-text';
import { countOf } from './delete-by-pattern';
import { text } from './text';
import type { KeyName, KeysPlace, KeyType } from './types';
import {
  argsOf,
  databaseName,
  fileNameOf,
  hexOf,
  namesOfHex,
  numberOf,
  placeOf,
  typeFilterOf,
  typeLabel,
  wordOf,
} from './types';

/** The identifier of the read of the file's place, with the system's file dialog. */
export const fileReadId = 'key.export:file';

/** The identifier of the scan of the keys matching the pattern, to the end. */
export const scanReadId = 'key.export:scan';

/** Items read a page at a time (Datardo's choice). */
export const pageItems = 500;

/** The file the dialog offers: `cache-local-db0.redis`, after the connection and the database. */
export function exportFileName(place: KeysPlace): string {
  return `${fileNameOf(place.connection.name)}-${databaseName(place.database)}.redis`;
}

function whatQuestion(selected: number, pattern: string, type: string): Outcome {
  return ask({
    title: text.export.title,
    button: text.export.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'what',
        label: text.export.what,
        choices: [
          { value: 'selected', label: text.export.selected(selected) },
          {
            value: 'matching',
            label:
              type === 'all' ? text.export.matching(pattern) : text.export.matchingOfType(pattern, typeLabel(type)),
          },
        ],
        default: 'selected',
      },
    ],
  });
}

/**
 * The file step: `write C:\exports\cache-local-db0.redis`, its writer reading the keys named, in this order, with the
 * commands of the server's version (`PEXPIRETIME` from Redis 7.0).
 */
export function exportStep(place: KeysPlace, path: string, names: readonly KeyName[], redisVersion = '6.2'): FileStep {
  const step = {
    kind: 'file' as const,
    action: 'write' as const,
    path,
    content: {
      writer: 'key.export',
      args: { connection: place.connection.id, database: place.database, keys: names.map(hexOf), redisVersion },
    },
  };
  return { ...step, text: stepText(step) };
}

/** The names to export: those selected, or those the scan found, or none yet. */
function namesToExport(place: KeysPlace, answers: Answers, pattern: string): readonly KeyName[] | 'scan' | Outcome {
  const args = argsOf(answers);
  const selected = namesOfHex(args['keys']);
  const fromRow = place.key === undefined ? [] : [place.key];
  const chosen = selected.length > 0 ? selected : fromRow;
  if (chosen.length > 0 && typeof args['pattern'] === 'string' && answers['what'] === undefined) {
    return whatQuestion(chosen.length, pattern, typeFilterOf(args['type']));
  }
  if (chosen.length > 0 && answers['what'] !== 'matching') {
    return chosen;
  }
  const found = countOf(answers['found']);
  if (found === undefined) {
    return 'scan';
  }
  return found.found === 0 ? refuse('key.export/nothing', text.export.nothing(pattern)) : (found.names ?? []);
}

/**
 * Feature: key.export — what to export when keys are selected, the file with the system's dialog, the scan of a
 * pattern to the end, then `write <file>`. Allowed on a read-only connection: it writes nothing to a deployment.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.export needs a database of a Redis connection.');
  }
  const args = argsOf(answers);
  const pattern = typeof args['pattern'] === 'string' ? args['pattern'] : '*';
  const names = namesToExport(place, answers, pattern);
  if (names === 'scan') {
    const scan = {
      connection: place.connection.id,
      database: place.database,
      pattern,
      type: typeFilterOf(args['type']),
      keepAtMost: null,
    };
    return needRead('found', scanReadId, scan);
  }
  if (!Array.isArray(names)) {
    return names as Outcome;
  }
  const file = answers['file'];
  if (file === undefined) {
    return needRead('file', fileReadId, { mode: 'save', name: exportFileName(place) });
  }
  const server = context.state.connections.live[place.connection.id]?.server;
  const version = server?.engine === 'redis' ? server.redisVersion : undefined;
  const steps = typeof file === 'string' ? [exportStep(place, file, names as readonly KeyName[], version)] : [];
  return run({
    title: text.export.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.export.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** What the writer says once the file is complete. */
export function exportedText(exported: number, asked: number, path: string): string {
  return exported < asked ? text.export.someGone(exported, asked, path) : text.export.done(exported, path);
}

/** Whether the server has `PEXPIRETIME` (Redis 7.0): the expiry is read as a date, not as the time left. */
export function readsExpiryAsDate(redisVersion: string): boolean {
  return isVersionAtLeast(redisVersion, [7, 0]);
}

/** The first commands of a key: `TYPE <key>`, then `PEXPIRETIME <key>`, or `PTTL <key>` on an older server. */
export function headCommands(name: KeyName, redisVersion: string): readonly (readonly (string | Uint8Array)[])[] {
  return [
    ['TYPE', name],
    [readsExpiryAsDate(redisVersion) ? 'PEXPIRETIME' : 'PTTL', name],
  ];
}

/** The date of expiry from the reply of the second head command: `undefined` for none, `gone` for a key gone. */
export function expiresAtOfReply(reply: RedisReply, redisVersion: string, readAt: number): number | 'gone' | undefined {
  const number = numberOf(reply);
  if (number === undefined || number === -1) {
    return undefined;
  }
  if (number === -2) {
    return 'gone';
  }
  return readsExpiryAsDate(redisVersion) ? number : readAt + number;
}

/** A value being read a page at a time. */
export interface ValueReading {
  readonly name: KeyName;
  readonly type: KeyType;
  /** A cursor of `HSCAN` and `SSCAN`, a start of `LRANGE`, `ZRANGE` and `GETRANGE`, the last ID of `XRANGE`. */
  readonly position: string;
  /** The length of a string, once `STRLEN` answered. */
  readonly length?: number;
  readonly value: ExportedValue;
  readonly done: boolean;
}

function emptyValue(type: KeyType): ExportedValue {
  switch (type) {
    case 'string':
      return { type: 'string', bytes: new Uint8Array() };
    case 'hash':
      return { type: 'hash', pairs: [] };
    case 'list':
      return { type: 'list', elements: [] };
    case 'set':
      return { type: 'set', members: [] };
    case 'zset':
      return { type: 'zset', members: [] };
    case 'stream':
      return { type: 'stream', entries: [] };
    default:
      return { type: 'dump', payload: new Uint8Array() };
  }
}

/** A value not read yet. */
export function startReading(name: KeyName, type: KeyType): ValueReading {
  return { name, type, position: '0', value: emptyValue(type), done: false };
}

/** The next command that reads the value, or none once it is read. */
export function nextValueCommand(reading: ValueReading): readonly (string | Uint8Array)[] | undefined {
  if (reading.done) {
    return undefined;
  }
  const { name, position } = reading;
  const last = String(Number(position) + pageItems - 1);
  switch (reading.value.type) {
    case 'string':
      return reading.length === undefined
        ? ['STRLEN', name]
        : reading.length <= stringPart
          ? ['GET', name]
          : ['GETRANGE', name, position, String(Number(position) + stringPart - 1)];
    case 'hash':
      return ['HSCAN', name, position, 'COUNT', String(pageItems)];
    case 'set':
      return ['SSCAN', name, position, 'COUNT', String(pageItems)];
    case 'list':
      return ['LRANGE', name, position, last];
    case 'zset':
      return ['ZRANGE', name, position, last, 'WITHSCORES'];
    case 'stream':
      return ['XRANGE', name, position === '0' ? '-' : `(${position}`, '+', 'COUNT', String(pageItems)];
    case 'dump':
      return ['DUMP', name];
  }
}

const bytesOf = (reply: RedisReply | undefined): Uint8Array => (reply instanceof Uint8Array ? reply : new Uint8Array());
const listOf = (reply: RedisReply | undefined): readonly RedisReply[] =>
  Array.isArray(reply) ? (reply as readonly RedisReply[]) : [];

function pairsOf(flat: readonly RedisReply[]): readonly BytePair[] {
  const pairs: BytePair[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    pairs.push([bytesOf(flat[index]), bytesOf(flat[index + 1])]);
  }
  return pairs;
}

function joined(one: Uint8Array, other: Uint8Array): Uint8Array {
  const all = new Uint8Array(one.length + other.length);
  all.set(one);
  all.set(other, one.length);
  return all;
}

/** Members and scores of `ZRANGE … WITHSCORES`: pairs in RESP3, a flat list in RESP2. */
function scoredOf(reply: RedisReply): readonly (readonly [Uint8Array, string])[] {
  const items = listOf(reply);
  if (items.every((item) => Array.isArray(item))) {
    return items.map((item) => {
      const [member, score] = listOf(item);
      return [bytesOf(member), typeof score === 'number' ? scoreText(score) : (wordOf(score) ?? '0')] as const;
    });
  }
  return pairsOf(items).map(([member, score]) => [member, new TextDecoder().decode(score)] as const);
}

function entriesOf(reply: RedisReply): readonly StreamEntry[] {
  return listOf(reply).map((entry) => {
    const [id, fields] = listOf(entry);
    return { id: wordOf(id) ?? '', fields: pairsOf(listOf(fields)) };
  });
}

/** The reading after the reply of {@link nextValueCommand}. */
export function afterValueReply(reading: ValueReading, reply: RedisReply): ValueReading {
  const value = reading.value;
  switch (value.type) {
    case 'string':
      return afterString(reading, value.bytes, reply);
    case 'hash': {
      const [cursor, flat] = listOf(reply);
      const next = wordOf(cursor) ?? '0';
      return {
        ...reading,
        position: next,
        value: { ...value, pairs: [...value.pairs, ...pairsOf(listOf(flat))] },
        done: next === '0',
      };
    }
    case 'set': {
      const [cursor, members] = listOf(reply);
      const next = wordOf(cursor) ?? '0';
      return {
        ...reading,
        position: next,
        value: { ...value, members: [...value.members, ...listOf(members).map(bytesOf)] },
        done: next === '0',
      };
    }
    case 'list': {
      const page = listOf(reply).map(bytesOf);
      return {
        ...reading,
        position: String(Number(reading.position) + page.length),
        value: { ...value, elements: [...value.elements, ...page] },
        done: page.length < pageItems,
      };
    }
    case 'zset': {
      const page = scoredOf(reply);
      return {
        ...reading,
        position: String(Number(reading.position) + page.length),
        value: { ...value, members: [...value.members, ...page] },
        done: page.length < pageItems,
      };
    }
    case 'stream': {
      const page = entriesOf(reply);
      const last = page[page.length - 1]?.id ?? reading.position;
      return {
        ...reading,
        position: last,
        value: { ...value, entries: [...value.entries, ...page] },
        done: page.length < pageItems,
      };
    }
    case 'dump':
      return { ...reading, value: { type: 'dump', payload: bytesOf(reply) }, done: true };
  }
}

function afterString(reading: ValueReading, bytes: Uint8Array, reply: RedisReply): ValueReading {
  if (reading.length === undefined) {
    return { ...reading, length: numberOf(reply) ?? 0 };
  }
  const all = joined(bytes, bytesOf(reply));
  return {
    ...reading,
    position: String(all.length),
    value: { type: 'string', bytes: all },
    done: all.length >= reading.length,
  };
}

/** A stream read with no entry is written as `RESTORE`: its reading starts again as a dump; none otherwise. */
export function dumpInstead(reading: ValueReading): ValueReading | undefined {
  return reading.done && reading.value.type === 'stream' && reading.value.entries.length === 0
    ? { ...reading, position: '0', value: emptyValue('dump'), done: false }
    : undefined;
}

/** `key.export:file`: the system's save dialog, an app read that answers the path, or null when it was closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'key.choose-file', args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};

/** `key.export:scan`: the names matching the pattern, to the end, by the app read `key.scan-all`. */
export const scanRead: ReadFeature = {
  kind: 'read',
  id: featureId(scanReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'key.scan-all', args }),
  parse: (replies) => replies[0],
};
