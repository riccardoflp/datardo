/**
 * Feature: watch.event-summary
 *
 * Reads from a change event, as canonical Extended JSON, what its line of the list shows: its number, time, type,
 * collection, `_id` and **changes**, the fields an update set, removed and truncated, the documents before and after
 * when it has them, and its resume token. The change event itself is kept as it came.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../aggregate/mongosh/format';
import { dateOf, timestampOf } from '../history/document-writes';
import { isRecord, numberOf, objectOf, type JsonObject } from '../history/types';
import { summaryText } from './text';
import type { TruncatedArray, WatchEvent } from './types';

/** The characters of a document under **changes**, before `…`. */
export const summaryMost = 200;

/** A value in mongosh syntax on one line. */
export function oneLine(value: Json): string {
  return formattedValue(value, { kind: 'one-line' });
}

/** The text cut after 200 characters, with `…`. */
export function cut(text: string): string {
  return text.length > summaryMost ? `${text.slice(0, summaryMost)}…` : text;
}

/** The time: `wallTime`, the seconds of `clusterTime`, or the moment it was received. */
function timeOf(change: JsonObject, receivedAt: number): number {
  const wall = dateOf(change['wallTime']);
  if (wall !== undefined) {
    return wall;
  }
  return change['clusterTime'] === undefined ? receivedAt : timestampOf(change['clusterTime']).t * 1000;
}

/** `<db>.<coll>`, or only the database. */
export function namespaceOf(ns: Json | undefined): string {
  const { db, coll } = objectOf(ns);
  const database = typeof db === 'string' ? db : '';
  return typeof coll === 'string' ? `${database}.${coll}` : database;
}

function truncatedOf(value: Json | undefined): readonly TruncatedArray[] {
  const list = Array.isArray(value) ? (value as readonly Json[]) : [];
  return list.map((each) => {
    const { field, newSize } = objectOf(each);
    return { field: typeof field === 'string' ? field : '', size: numberOf(newSize) ?? 0 };
  });
}

function textsOf(value: Json | undefined): readonly string[] {
  return Array.isArray(value) ? (value as readonly Json[]).filter((each) => typeof each === 'string') : [];
}

/** The update's parts: the fields set with their values, removed and truncated; none for another change event. */
function updateOf(change: JsonObject): Pick<WatchEvent, 'updated' | 'removed' | 'truncated'> {
  const description = change['updateDescription'];
  if (!isRecord(description)) {
    return {};
  }
  return {
    updated: objectOf(description['updatedFields']),
    removed: textsOf(description['removedFields']),
    truncated: truncatedOf(description['truncatedArrays']),
  };
}

function changesOf(change: JsonObject, type: string, update: Pick<WatchEvent, 'updated' | 'removed' | 'truncated'>) {
  if (type === 'update') {
    const parts = [
      Object.keys(update.updated ?? {}).join(', '),
      (update.removed ?? []).join(', '),
      (update.truncated ?? []).map((each) => each.field).join(', '),
    ];
    const texts = [
      summaryText.set(parts[0] ?? ''),
      summaryText.unset(parts[1] ?? ''),
      summaryText.truncated(parts[2] ?? ''),
    ];
    return texts.filter((_text, index) => parts[index] !== '').join(' · ');
  }
  if ((type === 'insert' || type === 'replace') && isRecord(change['fullDocument'])) {
    return cut(oneLine(change['fullDocument']));
  }
  if (type === 'rename' && change['to'] !== undefined) {
    return summaryText.renamed(namespaceOf(change['to']));
  }
  return '';
}

/** Feature: watch.event-summary — the line of a change event, numbered in the page, received at `receivedAt`. */
export function eventSummary(change: Json, number: number, receivedAt = 0): WatchEvent {
  const event = objectOf(change);
  const type = typeof event['operationType'] === 'string' ? event['operationType'] : '';
  const key = objectOf(event['documentKey']);
  const update = updateOf(event);
  const after = event['fullDocument'];
  const before = event['fullDocumentBeforeChange'];
  return {
    number,
    time: timeOf(event, receivedAt),
    type,
    namespace: namespaceOf(event['ns']),
    id: key['_id'] === undefined ? '' : oneLine(key['_id']),
    changes: changesOf(event, type, update),
    ...update,
    ...(isRecord(after) ? { after } : {}),
    ...(isRecord(before) ? { before } : {}),
    ...(event['_id'] === undefined ? {} : { token: event['_id'] }),
    event,
  };
}
