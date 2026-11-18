/**
 * Feature: runner.step-text
 *
 * The one text of a step: what the confirmation shows, what the Log records, what a test compares. MongoDB steps are
 * written as mongosh calls, Redis steps as a command line; long values and lists are cut, and secrets are `***`. The
 * step that is sent is never cut.
 */
import type { Json, MongoRequest, RedisRequest } from '../../shared/engine-request';
import type { AppStep, EngineStep, FileStep } from '../../shared/feature';
import type { Target } from '../../shared/target';
import { mongoshValue, type Shortening } from '../../shared/mongosh-value';
import { cutUnits, groupThousands } from '../../shared/text-units';

/** A value is cut after 200 characters (Datardo's choice). */
export const longestValue = 200;

/** A list shows its first 10 documents or arguments (Datardo's choice). */
export const longestList = 10;

/** A step whose text is to be written: an engine or a file step, or an app step, whose text is its own sentence. */
export type StepToWrite = Omit<EngineStep, 'text'> | Omit<FileStep, 'text'> | AppStep;

/** What a secret is written as. */
export const masked = '***';

/** Feature: runner.step-text. The text of a step; `target` is the plan's, whose database is left out of the text. */
export function stepText(step: StepToWrite, target?: Target): string {
  switch (step.kind) {
    case 'engine':
      return step.request.engine === 'mongodb' ? mongoText(step.request, databaseOf(target)) : redisText(step.request);
    case 'file':
      return `${fileVerb(step.action)} ${step.path}`;
    case 'app':
      return step.text;
  }
}

function databaseOf(target: Target | undefined): string | undefined {
  return target !== undefined && (target.kind === 'database' || target.kind === 'collection')
    ? target.database
    : undefined;
}

function fileVerb(action: FileStep['action']): string {
  switch (action) {
    case 'write':
      return 'write';
    case 'delete':
      return 'delete';
    case 'create-folder':
      return 'create folder';
  }
}

const shortening: Shortening = { longestValue, longestList };

/** `db.orders.deleteOne({ _id: 7 })`, with `db.getSiblingDB("other")` for a database that is not the target's. */
function mongoText(request: MongoRequest, targetDatabase: string | undefined): string {
  const database = request.database === targetDatabase ? 'db' : `db.getSiblingDB(${JSON.stringify(request.database)})`;
  const on = request.collection === undefined ? database : `${database}${collectionPart(request.collection)}`;
  const args = withoutSecrets(request).map((argument) => mongoshValue(argument, shortening));
  return `${on}.${request.method}(${listText(args)})`;
}

function collectionPart(collection: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(collection) ? `.${collection}` : `.getCollection(${JSON.stringify(collection)})`;
}

const userMethods = new Set(['createUser', 'updateUser']);

/** `pwd` of `createUser` and `updateUser`, as methods or as commands, is `***`. */
function withoutSecrets(request: MongoRequest): readonly Json[] {
  const isUserCall =
    userMethods.has(request.method) ||
    (request.method === 'runCommand' && request.arguments.some((argument) => namesUserCommand(argument)));
  return isUserCall ? request.arguments.map(maskPassword) : request.arguments;
}

function namesUserCommand(argument: Json): boolean {
  return isObject(argument) && Object.keys(argument).some((key) => userMethods.has(key));
}

function maskPassword(argument: Json): Json {
  if (!isObject(argument) || !('pwd' in argument)) {
    return argument;
  }
  return Object.fromEntries(Object.entries(argument).map(([key, value]) => [key, key === 'pwd' ? masked : value]));
}

function isObject(value: Json): value is { readonly [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The items of a list, the first 10 and `… and 990 more` after them. */
function listText(items: readonly string[]): string {
  if (items.length <= longestList) {
    return items.join(', ');
  }
  const more = items.length - longestList;
  return `${items.slice(0, longestList).join(', ')}, … and ${groupThousands(more)} more`;
}

/** `SET "user 7" "a\x00b" KEEPTTL`, with the secrets of `AUTH`, `HELLO`, `MIGRATE` and `CONFIG SET` as `***`. */
function redisText(request: RedisRequest): string {
  const secret = secretPositions(request.command);
  const words = request.command.map((word, index) => (secret.has(index) ? masked : redisWord(word)));
  const [name, ...args] = words;
  if (name === undefined) {
    return '';
  }
  return args.length === 0 ? name : `${name} ${listText(args).replaceAll(', ', ' ')}`;
}

/** The positions of the arguments that hold a secret. */
function secretPositions(command: readonly Uint8Array[]): ReadonlySet<number> {
  const words = command.map((word) => new TextDecoder().decode(word).toUpperCase());
  const positions = new Set<number>();
  const name = words[0] ?? '';
  if (name === 'AUTH') {
    positions.add(words.length > 2 ? 2 : 1);
  }
  words.forEach((word, index) => {
    if (index === 0) {
      return;
    }
    if (word === 'AUTH' && (name === 'HELLO' || name === 'MIGRATE')) {
      positions.add(name === 'HELLO' ? index + 2 : index + 1);
    } else if (word === 'AUTH2' && name === 'MIGRATE') {
      positions.add(index + 2);
    }
  });
  if (name === 'CONFIG' && words[1] === 'SET') {
    for (let index = 2; index < words.length; index += 2) {
      if (words[index] === 'REQUIREPASS' || words[index] === 'MASTERAUTH') {
        positions.add(index + 1);
      }
    }
  }
  return positions;
}

/** One argument of a command line: as is, or in double quotes with `\"`, `\\` and `\xNN`. */
function redisWord(word: Uint8Array): string {
  const units = byteUnits(word);
  const quoted = units.length === 0 || units.some((unit) => unit.length > 1 || unit === ' ' || unit === "'");
  const cut = cutUnits(units, longestValue);
  return quoted ? `"${cut.text}"${cut.more}` : `${cut.text}${cut.more}`;
}

/**
 * The bytes as units of text that are never split: a printable character (a whole UTF-8 sequence), an escape of a
 * quote or a backslash, or `\xNN` for a byte that is not printable.
 */
function byteUnits(bytes: Uint8Array): readonly string[] {
  const units: string[] = [];
  let index = 0;
  while (index < bytes.length) {
    const length = sequenceLength(bytes, index);
    if (length === 0) {
      units.push(`\\x${(bytes[index] ?? 0).toString(16).padStart(2, '0')}`);
      index += 1;
      continue;
    }
    const character = new TextDecoder().decode(bytes.subarray(index, index + length));
    units.push(character === '"' ? '\\"' : character === '\\' ? '\\\\' : character);
    index += length;
  }
  return units;
}

/** The length of the printable UTF-8 character at `index`, or 0 for a byte to escape. */
function sequenceLength(bytes: Uint8Array, index: number): number {
  const first = bytes[index] ?? 0;
  if (first >= 0x20 && first < 0x7f) {
    return 1;
  }
  const length = first >= 0xf0 && first < 0xf5 ? 4 : first >= 0xe0 ? 3 : first >= 0xc2 && first < 0xe0 ? 2 : 0;
  if (length === 0 || index + length > bytes.length) {
    return 0;
  }
  for (let next = 1; next < length; next += 1) {
    if (((bytes[index + next] ?? 0) & 0xc0) !== 0x80) {
      return 0;
    }
  }
  const character = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(index, index + length));
  return /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]$/u.test(character) && character !== '�' ? length : 0;
}
