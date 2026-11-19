/**
 * Feature: history.document-writes
 *
 * Turns one oplog entry into the writes it made to one document: the entry itself, those of its `applyOps` (a
 * transaction, or one command writing several documents), or a drop or rename of the collection. The `_id` is matched
 * by its key ({@link idKey}), which is the same for the `_id` values MongoDB holds equal: `1`, `1.0` and
 * `NumberLong(1)` are one `_id`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../aggregate/mongosh/format';
import {
  isRecord,
  isTypedObject,
  numberOf,
  objectOf,
  type CollectionCommand,
  type DocumentWrite,
  type JsonObject,
} from './types';

const numberKeys: readonly string[] = ['$numberInt', '$numberLong', '$numberDouble'];

/** A number's text that is the same for equal values of `Int32`, `Int64` and `Double`. */
function numberText(key: string, digits: string): string {
  if (key === '$numberLong' && /^-?\d+$/u.test(digits)) {
    return BigInt(digits).toString();
  }
  const number = Number(digits);
  if (Number.isInteger(number) && Math.abs(number) > Number.MAX_SAFE_INTEGER) {
    return BigInt(number).toString();
  }
  return Object.is(number, -0) ? '0' : String(number);
}

/** The value with its numbers by value, the order of its fields kept. */
function byValue(value: Json): Json {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(byValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  const [key] = Object.keys(value);
  const inner = key === undefined ? undefined : value[key];
  if (Object.keys(value).length === 1 && key !== undefined && numberKeys.includes(key) && typeof inner === 'string') {
    return { $number: numberText(key, inner) };
  }
  if (isTypedObject(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, byValue(item)]));
}

/** The key of an `_id`: the same text for the `_id` values MongoDB holds equal. */
export function idKey(id: Json): string {
  return JSON.stringify(byValue(id));
}

/** A value in mongosh syntax on one line, as `query.format` writes it. */
function mongoshText(value: Json): string {
  return formattedValue(value, { kind: 'one-line' });
}

/** The seconds and the order of an oplog timestamp (`{ $timestamp: { t, i } }`). */
export function timestampOf(value: Json | undefined): { readonly t: number; readonly i: number } {
  const inner = objectOf(objectOf(value)['$timestamp']);
  return { t: numberOf(inner['t']) ?? 0, i: numberOf(inner['i']) ?? 0 };
}

/** A date of Extended JSON (`{ $date: { $numberLong: "…" } }`) in milliseconds since 1970. */
export function dateOf(value: Json | undefined): number | undefined {
  const inner = objectOf(value)['$date'];
  const milliseconds = typeof inner === 'string' ? Date.parse(inner) : numberOf(inner);
  return milliseconds === undefined || Number.isNaN(milliseconds) ? undefined : milliseconds;
}

/** What a command on `<database>.$cmd` did to the collection `<database>.<collection>`; `undefined` if nothing. */
function collectionCommand(entry: JsonObject, collection: string): CollectionCommand | undefined {
  const dot = collection.indexOf('.');
  const database = collection.slice(0, dot);
  const name = collection.slice(dot + 1);
  if (entry['ns'] !== `${database}.$cmd`) {
    return undefined;
  }
  const o = objectOf(entry['o']);
  if (o['drop'] === name) {
    return { kind: 'collection-dropped' };
  }
  if (o['dropDatabase'] !== undefined) {
    return { kind: 'database-dropped' };
  }
  if (o['renameCollection'] === collection) {
    return { kind: 'renamed-to', to: typeof o['to'] === 'string' ? o['to'] : '' };
  }
  if (o['to'] === collection) {
    const from = o['renameCollection'];
    return { kind: 'renamed-from', from: typeof from === 'string' ? from : '' };
  }
  return undefined;
}

/** Whether an insert, update or delete is on the collection and on the document whose `_id` has the key. */
function isOfDocument(operation: JsonObject, collection: string, key: string): boolean {
  const op = operation['op'];
  if ((op !== 'i' && op !== 'u' && op !== 'd') || operation['ns'] !== collection) {
    return false;
  }
  const id = op === 'u' ? objectOf(operation['o2'])['_id'] : objectOf(operation['o'])['_id'];
  return id !== undefined && idKey(id) === key;
}

/**
 * Whether the operations of an `applyOps` are a transaction: the entry has a session and is not one of the batched
 * writes of one command, whose operations carry a `stmtId` or whose entry is marked with `multiOpType`.
 */
function isTransaction(entry: JsonObject, inner: readonly JsonObject[]): boolean {
  if (entry['lsid'] === undefined || entry['multiOpType'] !== undefined) {
    return false;
  }
  return !inner.some((operation) => operation['stmtId'] !== undefined);
}

function isNonZeroTime(prevOpTime: Json | undefined): boolean {
  const { t, i } = timestampOf(objectOf(prevOpTime)['ts']);
  return t !== 0 || i !== 0;
}

/** The session and the transaction number of an entry, in mongosh syntax. */
function sessionOf(entry: JsonObject): Pick<DocumentWrite, 'session' | 'transactionNumber'> {
  const id = objectOf(entry['lsid'])['id'];
  const number = entry['txnNumber'];
  return {
    ...(id === undefined ? {} : { session: mongoshText(id) }),
    ...(number === undefined ? {} : { transactionNumber: mongoshText(number) }),
  };
}

/** What every write of an entry has: its timestamp and its wall clock time. */
function baseOf(entry: JsonObject): Pick<DocumentWrite, 't' | 'i' | 'wall'> {
  const wall = dateOf(entry['wall']);
  return { ...timestampOf(entry['ts']), ...(wall === undefined ? {} : { wall }) };
}

function operationOf(operation: JsonObject): Pick<DocumentWrite, 'op' | 'o' | 'o2'> {
  const o2 = operation['o2'];
  return {
    op: operation['op'] as DocumentWrite['op'],
    o: objectOf(operation['o']),
    ...(o2 === undefined ? {} : { o2: objectOf(o2) }),
  };
}

function applyOpsWrites(entry: JsonObject, collection: string, key: string): DocumentWrite[] {
  const o = objectOf(entry['o']);
  const inner = (o['applyOps'] as readonly Json[]).map(objectOf);
  const who = {
    group: isTransaction(entry, inner) ? ('transaction' as const) : ('batch' as const),
    ...(entry['partialTxn'] === true || isNonZeroTime(entry['prevOpTime']) ? { partial: true } : {}),
    ...(o['prepare'] === true ? { prepared: true } : {}),
    ...sessionOf(entry),
  };
  const base = baseOf(entry);
  return inner.flatMap((operation, position) =>
    isOfDocument(operation, collection, key)
      ? [
          {
            ...base,
            position,
            ...operationOf(operation),
            ...who,
            ...(entry['fromMigrate'] === true || operation['fromMigrate'] === true ? { migration: true } : {}),
          },
        ]
      : [],
  );
}

/**
 * Feature: history.document-writes — the writes of an oplog entry (canonical Extended JSON) to the document of the
 * collection `<database>.<collection>` whose `_id` has the key `key` ({@link idKey}).
 */
export function documentWrites(entry: Json, collection: string, key: string): readonly DocumentWrite[] {
  const object = objectOf(entry);
  if (object['op'] === 'c' && Array.isArray(objectOf(object['o'])['applyOps'])) {
    return applyOpsWrites(object, collection, key);
  }
  if (object['op'] === 'c') {
    const command = collectionCommand(object, collection);
    return command === undefined
      ? []
      : [{ ...baseOf(object), position: -1, op: 'c', o: objectOf(object['o']), command }];
  }
  if (!isOfDocument(object, collection, key)) {
    return [];
  }
  return [
    {
      ...baseOf(object),
      position: -1,
      ...operationOf(object),
      ...sessionOf(object),
      ...(object['fromMigrate'] === true ? { migration: true } : {}),
    },
  ];
}
