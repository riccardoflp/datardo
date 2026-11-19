/**
 * Feature: pubsub.oplog-event
 *
 * Tells whether a message is an event of redis-oplog, and which operation, collection and document it is about. It
 * reads back what `oplog.message` writes (Mongoster's `oplogMessage` and `idStringify`): the message
 * `{ "e": …, "d": { "_id": … }, "f": […] }` on the collection's channel, on a namespace's or on the document's.
 */
import type { OplogEvent, OplogLink } from './types';
import { textOf } from './types';

/** A Meteor id as the message holds it: a string, a finite number, or an ObjectId as its 24 hexadecimal digits. */
type MeteorId =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'object-id'; readonly hex: string };

const operations: Readonly<Record<string, OplogEvent['operation']>> = { i: 'insert', u: 'update', r: 'remove' };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function meteorId(id: unknown): MeteorId | undefined {
  if (typeof id === 'string') {
    return { kind: 'string', value: id };
  }
  if (typeof id === 'number' && Number.isFinite(id)) {
    return { kind: 'number', value: id };
  }
  if (isObject(id) && id['$type'] === 'oid' && typeof id['$value'] === 'string') {
    return /^[0-9a-fA-F]{24}$/u.test(id['$value']) ? { kind: 'object-id', hex: id['$value'] } : undefined;
  }
  return undefined;
}

/** The `_id` as `query.format` writes it: a string in double quotes, a number as it is, `ObjectId("…")`. */
function documentText(id: MeteorId): string {
  switch (id.kind) {
    case 'string':
      return JSON.stringify(id.value);
    case 'number':
      return String(id.value);
    case 'object-id':
      return `ObjectId("${id.hex}")`;
  }
}

/** The suffix of the document's channel: Meteor's `MongoID.idStringify`. */
function idSuffix(id: MeteorId): string {
  switch (id.kind) {
    case 'object-id':
      return id.hex;
    case 'number':
      return `~${JSON.stringify(id.value)}`;
    case 'string':
      return id.value !== '' && (/^[-~{]/u.test(id.value) || /^[0-9a-f]{24}$/u.test(id.value))
        ? `-${id.value}`
        : id.value;
  }
}

/** What the message says, when it is an event: its operation, its Meteor id and the fields of an update. */
interface EventMessage {
  readonly operation: OplogEvent['operation'];
  readonly id: MeteorId;
  readonly fields?: readonly string[];
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: the message is not an event, and is listed as any other.
    return undefined;
  }
}

function fieldsOf(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((field) => typeof field === 'string') ? value : undefined;
}

function eventMessage(message: Uint8Array): EventMessage | undefined {
  const text = textOf(message);
  if (text?.trimStart().startsWith('{') !== true) {
    return undefined;
  }
  const value = parsed(text);
  const operation = isObject(value) && typeof value['e'] === 'string' ? operations[value['e']] : undefined;
  const document = isObject(value) ? value['d'] : undefined;
  const id = isObject(document) ? meteorId(document['_id']) : undefined;
  if (!isObject(value) || operation === undefined || id === undefined) {
    return undefined;
  }
  const fields = operation === 'update' ? fieldsOf(value['f']) : undefined;
  return { operation, id, ...(fields === undefined ? {} : { fields }) };
}

/** The collection a channel is of, and which channel it is, from the channel without its prefix (rules 6 to 9). */
function channelOf(
  rest: string,
  id: MeteorId,
  link: OplogLink,
): Pick<OplogEvent, 'collection' | 'channelKind' | 'namespace'> {
  const ending = `::${idSuffix(id)}`;
  if (rest.length > ending.length && rest.endsWith(ending)) {
    return { collection: rest.slice(0, -ending.length), channelKind: 'document' };
  }
  const namespace = [...link.namespaces]
    .sort((first, second) => second.length - first.length)
    .find((each) => each !== '' && rest.startsWith(`${each}::`));
  return namespace === undefined
    ? { collection: rest, channelKind: 'collection' }
    : { collection: rest.slice(namespace.length + 2), channelKind: 'namespace', namespace };
}

/** Feature: pubsub.oplog-event — the event a message of `channel` is, or undefined when it is not one. */
export function oplogEvent(channel: Uint8Array, message: Uint8Array, link: OplogLink): OplogEvent | undefined {
  const name = textOf(channel);
  if (name?.startsWith(link.prefix) !== true) {
    return undefined;
  }
  const said = eventMessage(message);
  if (said === undefined) {
    return undefined;
  }
  return {
    operation: said.operation,
    ...channelOf(name.slice(link.prefix.length), said.id, link),
    document: documentText(said.id),
    ...(said.fields === undefined ? {} : { fields: said.fields }),
  };
}
