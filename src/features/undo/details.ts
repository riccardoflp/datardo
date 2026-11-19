/**
 * Feature: undo.details — expanding a row of the **Undo history** page shows, for each document or key of the
 * operation, how it is now and how it will be after the undo.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { mongoshValue } from '../../shared/mongosh-value';
import { savedConnection } from '../../shared/state/connections';
import { sizeText } from '../task/show';
import type { DocumentNow, KeyNow } from './changed-since';
import { changedSince, nowByRecord, recordKey } from './changed-since';
import type { OperationRead } from './reads/operation';
import { operationArgs, operationRead, operationReadOf } from './reads/operation';
import { entryById, undoOf } from './state/history';
import { detailsText, revertText } from './text';
import type { DocumentRecord, KeyImage, KeyRecord, UndoEntry } from './types';
import { base64Bytes, fieldsOf, keyNameText, operationId, sameValueKey, unitOf } from './types';

/** At most 100 documents or keys are shown. */
export const detailsShown = 100;

/** A row of the table of a document: a field, its value now and after the undo; `—` when missing on one side. */
export interface FieldRow {
  readonly field: string;
  readonly now: string;
  readonly after: string;
  readonly nowTooltip?: string;
  readonly afterTooltip?: string;
}

/** A key's cell: its type, the size of its dump and its expiry, or `—` when it is missing on that side. */
export interface KeyCell {
  readonly text: string;
  readonly tooltip?: string;
}

/** One document or key of the box. */
export interface DetailItem {
  /** The `_id` in mongosh syntax, or the key's name. */
  readonly name: string;
  /** `updated: the undo restores it`. */
  readonly what: string;
  readonly changedSince: boolean;
  /** *Already as it was: the undo changes nothing.* or *Already deleted.* */
  readonly note?: string;
  readonly fields?: readonly FieldRow[];
  readonly key?: { readonly now: KeyCell; readonly after: KeyCell };
}

/** What the expanded row shows. */
export type DetailsBox =
  | { readonly kind: 'loading'; readonly text: string }
  | { readonly kind: 'refused'; readonly text: string }
  | {
      readonly kind: 'shown';
      /** *First 100 of 2,500 documents.* */
      readonly first?: string;
      /** *3 documents changed after the operation: undoing overwrites those changes too.* */
      readonly changed?: string;
      readonly items: readonly DetailItem[];
    };

/** The box while the reads run. */
export const loadingBox: DetailsBox = { kind: 'loading', text: detailsText.loading };

/** Feature: undo.details. `args.operation` is the operation; the refusals are shown in the box. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const id = fieldsOf(args)['operation'];
  const entry = typeof id === 'string' ? entryById(undoOf(context.state), operationId(id)) : undefined;
  if (entry === undefined) {
    return refuse('undo.details/gone', revertText.gone);
  }
  if (entry.undone !== undefined) {
    return refuse('undo.details/already-undone', revertText.alreadyUndone);
  }
  if (savedConnection(context.state.connections, entry.connection) === undefined) {
    return refuse('undo.details/no-connection', revertText.noConnection(entry.connectionName));
  }
  return { kind: 'app', action: operationRead, args: operationArgs(entry.id, detailsShown) };
}

/** Feature: undo.details. The file's first 100 records and how they are now. */
export function parse(replies: readonly unknown[]): OperationRead | undefined {
  return operationReadOf(replies[0]);
}

function isPlainDocument(value: unknown): value is Readonly<Record<string, Json>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !Object.keys(value).some((key) => key.startsWith('$'))
  );
}

/** The fields of two documents compared in order and by type, nested documents by their paths. */
export function fieldRows(now: Json, after: Json, path = ''): readonly FieldRow[] {
  if (!isPlainDocument(now) || !isPlainDocument(after)) {
    return [];
  }
  const fields = [...new Set([...Object.keys(now), ...Object.keys(after)])];
  return fields.flatMap((field): readonly FieldRow[] => {
    const name = path === '' ? field : `${path}.${field}`;
    const left = now[field];
    const right = after[field];
    if (left !== undefined && right !== undefined && isPlainDocument(left) && isPlainDocument(right)) {
      return fieldRows(left, right, name);
    }
    if (sameValueKey(left) === sameValueKey(right)) {
      return [];
    }
    return [row(name, left, right)];
  });
}

function row(field: string, now: Json | undefined, after: Json | undefined): FieldRow {
  return {
    field,
    now: now === undefined ? detailsText.missing : mongoshValue(now),
    after: after === undefined ? detailsText.missing : mongoshValue(after),
    ...(now === undefined ? { nowTooltip: detailsText.missingNow } : {}),
    ...(after === undefined ? { afterTooltip: detailsText.missingAfter } : {}),
  };
}

function documentWhat(record: DocumentRecord): string {
  if (record.before === null) {
    return detailsText.inserted;
  }
  return record.after === null ? detailsText.deleted : detailsText.updated;
}

function documentItem(record: DocumentRecord, now: DocumentNow | undefined, changed: boolean): DetailItem {
  const current = now?.document;
  const note =
    record.before === null
      ? current === undefined
        ? detailsText.alreadyDeleted
        : undefined
      : current !== undefined && sameValueKey(current) === sameValueKey(record.before)
        ? detailsText.alreadyAsItWas
        : undefined;
  const fields =
    current === undefined || record.before === null
      ? [row(detailsText.wholeDocument, current, record.before ?? undefined)]
      : fieldRows(current, record.before);
  return {
    name: mongoshValue(record.id),
    what: documentWhat(record),
    changedSince: changed,
    ...(note === undefined ? {} : { note }),
    fields: current === undefined && record.before === null ? [] : fields,
  };
}

/** `string · 1.2 KB · no expiry`, or `—` for a key missing on that side. */
export function keyCell(image: KeyImage | undefined, side: 'now' | 'after'): KeyCell {
  if (image === undefined) {
    return {
      text: detailsText.missing,
      tooltip: side === 'now' ? detailsText.missingNow : detailsText.missingAfter,
    };
  }
  const expiry = image.pttl < 0 ? detailsText.noExpiry : detailsText.expiresIn(Math.round(image.pttl / 1000));
  return { text: `${image.type} · ${sizeText(base64Bytes(image.dump))} · ${expiry}` };
}

function keyWhat(record: KeyRecord): string {
  if (record.before === null) {
    return detailsText.created;
  }
  return record.after === null ? detailsText.deletedKey : detailsText.changed;
}

function keyItem(record: KeyRecord, now: KeyNow | undefined, changed: boolean): DetailItem {
  const asItWas =
    record.before !== null &&
    now !== undefined &&
    now.image.dump === record.before.dump &&
    now.image.pttl < 0 === record.before.pttl < 0;
  const note =
    record.before === null && now === undefined
      ? detailsText.alreadyDeleted
      : asItWas
        ? detailsText.alreadyAsItWas
        : undefined;
  return {
    name: keyNameText(record.key),
    what: keyWhat(record),
    changedSince: changed,
    ...(note === undefined ? {} : { note }),
    key: { now: keyCell(now?.image, 'now'), after: keyCell(record.before ?? undefined, 'after') },
  };
}

/** What the expanded row shows from the read: the documents or keys, what the undo does to each, what changed since. */
export function detailsBox(entry: UndoEntry, read: OperationRead | undefined): DetailsBox {
  if (read === undefined) {
    return loadingBox;
  }
  if (read.kind === 'missing') {
    return { kind: 'refused', text: revertText.gone };
  }
  const unit = unitOf(entry.engine);
  const found = changedSince(read.records, read.current);
  const changed = new Set(found.changed);
  const now = nowByRecord(read.current);
  const items =
    read.records.kind === 'documents'
      ? read.records.docs.map((record) =>
          documentItem(record, now.get(recordKey(record)) as DocumentNow | undefined, changed.has(recordKey(record))),
        )
      : read.records.keys.map((record) =>
          keyItem(record, now.get(recordKey(record)) as KeyNow | undefined, changed.has(recordKey(record))),
        );
  const shown = items.slice(0, detailsShown);
  return {
    kind: 'shown',
    ...(read.total > shown.length ? { first: detailsText.firstOf(shown.length, read.total, unit) } : {}),
    ...(changed.size > 0 ? { changed: detailsText.someChanged(changed.size, unit) } : {}),
    items: shown,
  };
}
