/**
 * Feature: undo.writes-of — which recorded operations wrote one document between two times, and what each did to it:
 * the document history uses it to say that a write in the oplog was made by Datardo.
 */
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { DocumentRecord, OperationRecords, UndoEntry } from './types';
import { sameValueKey } from './types';

/** What an operation did to the document. */
export type WriteKind = 'inserted' | 'updated' | 'deleted';

/** One of Datardo's writes to the document. */
export interface DatardoWrite {
  readonly title: string;
  readonly time: number;
  readonly kind: WriteKind;
}

/** The collection of a connection the document is in. */
export interface DocumentPlace {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
}

/** The records of the operations' files, by operation; an operation whose file can't be read is not listed. */
export type RecordsByOperation = Readonly<Record<string, OperationRecords | undefined>>;

function isOnPlace(entry: UndoEntry, place: DocumentPlace): boolean {
  return (
    entry.engine === 'mongodb' &&
    entry.connection === place.connection &&
    entry.database === place.database &&
    entry.collection === place.collection
  );
}

function documentIn(records: OperationRecords | undefined, key: string): DocumentRecord | undefined {
  return records?.kind === 'documents' ? records.docs.find((each) => sameValueKey(each.id) === key) : undefined;
}

function kindOf(record: DocumentRecord, through: 'own' | 'undo'): WriteKind {
  if (record.before === null) {
    return through === 'own' ? 'inserted' : 'deleted';
  }
  if (record.after === null) {
    return through === 'own' ? 'deleted' : 'inserted';
  }
  return 'updated';
}

/**
 * Feature: undo.writes-of. An operation not undone is read from its own records; an undone one from its undo, where
 * the document went the other way; one whose undo was undone too, or whose file can't be read, is left out. The `_id`
 * is compared with its type.
 */
export function writesOf(
  history: { readonly operations: readonly UndoEntry[]; readonly records: RecordsByOperation },
  place: DocumentPlace,
  id: Json,
  range: { readonly from: number; readonly to: number },
): readonly DatardoWrite[] {
  const { operations, records } = history;
  const key = sameValueKey(id);
  return operations.flatMap((entry): readonly DatardoWrite[] => {
    if (!isOnPlace(entry, place) || entry.time < range.from || entry.time > range.to) {
      return [];
    }
    const source =
      entry.undone === undefined
        ? entry
        : operations.find((each) => each.undoOf === entry.id && each.undone === undefined && each.size > 0);
    if (source === undefined) {
      return [];
    }
    const record = documentIn(records[source.id], key);
    return record === undefined
      ? []
      : [{ title: entry.title, time: entry.time, kind: kindOf(record, source === entry ? 'own' : 'undo') }];
  });
}
