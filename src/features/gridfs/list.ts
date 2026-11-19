/**
 * Feature: gridfs.list
 *
 * A page of the files of a bucket, sent together: `db.fs.files.find(<filter>).sort({ uploadDate: -1, _id: -1
 * }).skip(0).limit(100)` and `db.fs.files.aggregate([{ $match: <filter> }, { $group: { _id: null, n: { $sum: 1 },
 * bytes: { $sum: "$length" } } }])`, the number of files that match and their bytes. The sort is by `filename`,
 * `length` or `uploadDate`, then by `_id` in the same direction, so that files with the same value keep one order
 * from page to page. Started with `{ connection, database, bucket, filter, sort, descending, page }`, `page` counting
 * from 0; a filter that cannot be read is refused with its message (`/filter`), which the page shows in place of the
 * table.
 *
 * `gridfs.list:file`, read by the features that act on one file, is the files document of an `_id`, or `null` when
 * the file no longer exists. Ported from Mongoster's `load` and `toFile`.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { numberOf } from '../document/write/values';
import { filesFilter } from './filter';
import { bucketRequest, fileOf, isRecord, textOf, type BucketRef, type GridFile, type JsonRecord } from './types';

/** A page has 100 files. */
export const pageFiles = 100;

/** What the files are sorted by. */
export type SortField = 'filename' | 'length' | 'uploadDate';

/** The sort of the page: by a column, descending or not. The page starts with the newest first. */
export interface FilesSort {
  readonly field: SortField;
  readonly descending: boolean;
}

/** The sort a page starts with: **Uploaded**, the newest first. */
export const startingSort: FilesSort = { field: 'uploadDate', descending: true };

/** What a page of files is read with. */
export interface ListArgs extends BucketRef {
  readonly filter: string;
  readonly sort: FilesSort;
  /** The page, counting from 0. */
  readonly page: number;
}

/** What the read returns: the files of the page, and the number and the bytes of all those that match. */
export interface FilesPage {
  readonly files: readonly GridFile[];
  readonly total: number;
  readonly bytes: number;
}

function sortFieldOf(value: Json | undefined): SortField {
  return value === 'filename' || value === 'length' ? value : 'uploadDate';
}

/** The arguments as the read takes them. */
export function listArgs(args: Json): ListArgs {
  const fields: JsonRecord = isRecord(args) ? args : {};
  const page = typeof fields['page'] === 'number' ? Math.max(0, Math.floor(fields['page'])) : 0;
  const sortField = sortFieldOf(fields['sort']);
  return {
    connection: connectionId(textOf(fields, 'connection') ?? ''),
    database: textOf(fields, 'database') ?? '',
    bucket: textOf(fields, 'bucket') ?? '',
    filter: textOf(fields, 'filter') ?? '',
    sort: {
      field: sortField,
      descending: typeof fields['descending'] === 'boolean' ? fields['descending'] : sortField !== 'filename',
    },
    page,
  };
}

/** The arguments of a read, as the page sends them. */
export function listArgsJson(args: ListArgs): Json {
  return {
    connection: args.connection,
    database: args.database,
    bucket: args.bucket,
    filter: args.filter,
    sort: args.sort.field,
    descending: args.sort.descending,
    page: args.page,
  };
}

/** `{ uploadDate: -1, _id: -1 }`: the column, then `_id` in the same direction. */
export function sortDocument(sort: FilesSort): Json {
  const direction = { $numberInt: sort.descending ? '-1' : '1' };
  return { [sort.field]: direction, _id: direction };
}

/** The pipeline that counts the files that match and sums their bytes. */
export function totalsPipeline(filter: Json): Json {
  return [{ $match: filter }, { $group: { _id: null, n: { $sum: { $numberInt: '1' } }, bytes: { $sum: '$length' } } }];
}

/** Feature: gridfs.list — the `find` of the page and the `aggregate` of the totals, with the same filter. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const asked = listArgs(args);
  const filter = filesFilter(asked.filter, context.now);
  if (!filter.ok) {
    return refuse('gridfs.list/filter', filter.message);
  }
  const options = {
    sort: sortDocument(asked.sort),
    skip: { $numberInt: String(asked.page * pageFiles) },
    limit: { $numberInt: String(pageFiles) },
  };
  return {
    kind: 'engine',
    requests: [
      {
        connection: asked.connection,
        request: bucketRequest(asked, 'files', {
          method: 'find',
          arguments: [filter.filter, options],
          limit: pageFiles,
        }),
      },
      {
        connection: asked.connection,
        request: bucketRequest(asked, 'files', { method: 'aggregate', arguments: [totalsPipeline(filter.filter)] }),
      },
    ],
  };
}

function documentsOf(reply: unknown): readonly JsonRecord[] {
  return Array.isArray(reply) ? (reply as readonly unknown[]).filter(isRecord) : [];
}

/** Feature: gridfs.list — the files of the page, and the number and the bytes of all that match; 0 and 0 for none. */
export function parse(replies: readonly unknown[]): FilesPage {
  const [files, totals] = replies;
  const [group] = documentsOf(totals);
  return {
    files: documentsOf(files).map(fileOf),
    total: numberOf(group?.['n']) ?? 0,
    bytes: numberOf(group?.['bytes']) ?? 0,
  };
}

/** The last page that has files, counting from 0: the page shown when one beyond the end is asked for. */
export function lastPage(total: number): number {
  return Math.max(0, Math.ceil(total / pageFiles) - 1);
}

/** The page to read again when the one read is beyond the end (files were deleted meanwhile); `undefined` otherwise. */
export function pageToReadAgain(page: number, read: FilesPage): number | undefined {
  return read.files.length === 0 && page > 0 && read.total > 0 ? Math.min(page, lastPage(read.total)) : undefined;
}

/** The identifier of the read of one file by its `_id`. */
export const fileReadId = 'gridfs.list:file';

/** The arguments of the read of one file. */
export function fileReadArgs(place: BucketRef, id: Json): Json {
  return { connection: place.connection, database: place.database, bucket: place.bucket, id };
}

/** `gridfs.list:file`: `db.fs.files.findOne({ _id: … })`, the file, or `null` when it no longer exists. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json): ReadRequest => {
    const asked = listArgs(args);
    const id = isRecord(args) ? (args['id'] ?? null) : null;
    return {
      kind: 'engine',
      requests: [
        {
          connection: asked.connection,
          request: bucketRequest(asked, 'files', { method: 'findOne', arguments: [{ _id: id }] }),
        },
      ],
    };
  },
  parse: (replies): GridFile | null => {
    const [reply] = replies;
    return isRecord(reply) ? fileOf(reply) : null;
  },
};

/** The file a read of `gridfs.list:file` answered, under `key` of a feature's answers; `null` when it is gone. */
export function readFileOf(value: unknown): GridFile | null {
  return isRecord(value) && isRecord(value['document']) ? fileOf(value['document']) : null;
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('gridfs.list'), request, parse };
