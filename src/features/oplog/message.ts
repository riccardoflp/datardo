/**
 * Feature: oplog.message — what is sent for one document changed: the message redis-oplog expects, on the collection's
 * channel, on its namespaces and on the document's dedicated channel.
 */
import type { Json } from '../../shared/engine-request';
import type { OplogEvent, OplogSettings } from './types';

/** An `_id` as Meteor reads it: a string, a number, or an `ObjectId` as `{ $type: 'oid', $value }`. */
export type MeteorId = string | number | { readonly $type: 'oid'; readonly $value: string };

/** The channels of an event and its message. */
export interface OplogMessage {
  readonly channels: readonly string[];
  readonly message: string;
}

const largest = BigInt(Number.MAX_SAFE_INTEGER);

function finite(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

function typedId(fields: Readonly<Record<string, unknown>>): MeteorId | undefined {
  const keys = Object.keys(fields);
  if (keys.length !== 1) {
    return undefined;
  }
  const [key] = keys;
  const value = fields[key ?? ''];
  if (typeof value !== 'string') {
    return undefined;
  }
  switch (key) {
    case '$oid':
      return /^[0-9a-f]{24}$/iu.test(value) ? { $type: 'oid', $value: value.toLowerCase() } : undefined;
    case '$numberInt':
    case '$numberDouble':
      return finite(Number(value));
    case '$numberLong': {
      if (!/^-?\d+$/u.test(value)) {
        return undefined;
      }
      const big = BigInt(value);
      return big <= largest && big >= -largest ? Number(big) : undefined;
    }
    case undefined:
    default:
      return undefined;
  }
}

/**
 * The Meteor id of an `_id` given as canonical EJSON: a string, or a finite number, as it is; an `Int32` or a `Double`
 * as a number; a `Long` as a number when it is a safe integer; an `ObjectId` as `{ $type: 'oid', $value }`. Any other
 * `_id` has none.
 */
export function meteorId(id: Json): MeteorId | undefined {
  if (typeof id === 'string') {
    return id;
  }
  if (typeof id === 'number') {
    return finite(id);
  }
  if (typeof id !== 'object' || id === null || Array.isArray(id)) {
    return undefined;
  }
  return typedId(id as Readonly<Record<string, unknown>>);
}

/** Meteor's `MongoID.idStringify`: the suffix of the document's dedicated channel. */
export function idStringify(id: MeteorId): string {
  if (typeof id === 'object') {
    return id.$value;
  }
  if (typeof id === 'string') {
    return id !== '' && (/^[-~{]/u.test(id) || /^[0-9a-f]{24}$/u.test(id)) ? `-${id}` : id;
  }
  return `~${JSON.stringify(id)}`;
}

/**
 * Feature: oplog.message. The channels, in order: the collection's, one per namespace, the document's; the prefix
 * before each. Nothing when the `_id` can't be a Meteor id.
 */
export function oplogMessage(settings: OplogSettings, collection: string, event: OplogEvent): OplogMessage | undefined {
  const id = meteorId(event.id);
  if (id === undefined) {
    return undefined;
  }
  const channels = [
    collection,
    ...settings.namespaces.map((namespace) => `${namespace}::${collection}`),
    `${collection}::${idStringify(id)}`,
  ];
  const message = event.e === 'u' ? { e: 'u', d: { _id: id }, f: event.fields } : { e: event.e, d: { _id: id } };
  return { channels: channels.map((channel) => `${settings.prefix}${channel}`), message: JSON.stringify(message) };
}
