/**
 * Feature: saved-query.read-folder
 *
 * Reads every saved query of a connection's queries folder and says which files it could not read. The main process
 * reads the files (`src/storage/queries-folder.ts`), within the limits of T5: at most 2,000 files, each up to 1 MB,
 * six levels of folders below the queries folder. It answers the app read `saved-query.read-folder` with
 * `{ folder, files: [{ file, size, text?, error? }] }`, or `null` for a connection with no queries folder; this
 * module parses each file (`saved-query.parse-file`) and keeps the limits again, so that a reply out of bounds is cut.
 *
 * A file is reported once: started with `args.reported`, the files and messages already reported, the result says
 * which are new (`fresh`) and what to remember for the next reading (`reported`). The main process watches the folder
 * and reads it again 250 ms after the last change.
 */
import type { Json } from '../../shared/engine-request';
import type { After, Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import { parsedQueryFile } from './parse-file';
import { text } from './text';
import { fieldsOf, type FolderSavedQuery } from './types';

/** How many files are read, the first in order of name, folder by folder (Mongoster's `MAX_FILES`). */
export const filesRead = 2000;

/** The largest file read, in bytes: 1 MB (Mongoster's `MAX_BYTES`). */
export const fileBytes = 1_000_000;

/** How long the folder waits after its last change before it is read again, in milliseconds (Mongoster's). */
export const readAgainAfterMs = 250;

/** The app read that the main process answers with the files of the queries folder. */
export const readFolderAction = 'saved-query.read-folder';

/** A file that could not be read, with its path inside the queries folder and why. */
export interface SkippedFile {
  readonly file: string;
  readonly message: string;
}

/** The saved queries of a queries folder, as read. */
export interface FolderQueries {
  /** The queries folder; absent for a connection that has none. */
  readonly folder?: string;
  /** The saved queries of every file read well, in the order of the files. */
  readonly queries: readonly FolderSavedQuery[];
  /** The files skipped, with their messages. */
  readonly skipped: readonly SkippedFile[];
  /** The skipped files not reported yet, or reported with another message: the warning names these. */
  readonly fresh: readonly SkippedFile[];
  /** What to give as `args.reported` at the next reading. */
  readonly reported: Readonly<Record<string, string>>;
  /** Every `.json` file of the folder, read well or not: the paths a new file must not take. */
  readonly files: readonly string[];
}

/** A folder with no saved query. */
export const noFolderQueries: FolderQueries = { queries: [], skipped: [], fresh: [], reported: {}, files: [] };

function isSafePath(file: string): boolean {
  return file !== '' && !file.split('/').some((part) => part === '' || part === '.' || part === '..');
}

type FileRead = { readonly query: FolderSavedQuery } | { readonly skipped: SkippedFile };

function fileRead(value: unknown): FileRead | undefined {
  const fields = fieldsOf(value);
  const { file, size, error } = fields;
  if (typeof file !== 'string' || !isSafePath(file)) {
    return undefined;
  }
  if (typeof error === 'string') {
    return { skipped: { file, message: error } };
  }
  const content = fields['text'];
  if ((typeof size === 'number' && size > fileBytes) || typeof content !== 'string' || content.length > fileBytes) {
    return { skipped: { file, message: text.file.tooLarge } };
  }
  const parsed = parsedQueryFile(content);
  return parsed.ok
    ? { query: { place: 'folder', ...parsed.query, file } }
    : { skipped: { file, message: parsed.message } };
}

function reportedOf(value: unknown): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(fieldsOf(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** The saved queries of what the main process read, with the files already reported. */
export function folderQueriesOf(reading: unknown, reported: unknown = {}): FolderQueries {
  const fields = fieldsOf(reading);
  const folder = fields['folder'];
  const files = Array.isArray(fields['files']) ? (fields['files'] as readonly unknown[]).slice(0, filesRead) : [];
  const read = files.flatMap((each) => {
    const result = fileRead(each);
    return result === undefined ? [] : [result];
  });
  const queries = read.flatMap((each) => ('query' in each ? [each.query] : []));
  const skipped = read.flatMap((each) => ('skipped' in each ? [each.skipped] : []));
  const before = reportedOf(reported);
  return {
    ...(typeof folder === 'string' ? { folder } : {}),
    queries,
    skipped,
    fresh: skipped.filter((each) => before[each.file] !== each.message),
    reported: Object.fromEntries(skipped.map((each) => [each.file, each.message])),
    files: [...queries.map((each) => each.file), ...skipped.map((each) => each.file)],
  };
}

/**
 * The warning about the files not reported yet: one notification, naming the first of them, with **Reveal file** for
 * it (`saved-query.reveal-file`); none when every file was read or already reported.
 */
export function skippedWarning(fresh: readonly SkippedFile[], connection: ConnectionId): After | undefined {
  const [first] = fresh;
  if (first === undefined) {
    return undefined;
  }
  return {
    kind: 'notify',
    level: 'warning',
    text:
      fresh.length === 1
        ? text.folder.skippedOne(first.file, first.message)
        : text.folder.skippedMany(fresh.length, first.file, first.message),
    actions: [
      {
        label: text.folder.revealFile,
        element: 'saved-query.reveal-file@notification',
        feature: featureId('saved-query.reveal-file'),
        target: { kind: 'connection', connection },
        args: { connection, file: first.file },
      },
    ],
  };
}

/** The queries folder of a connection, when it has one. */
export function queriesFolderOf(context: Context, connection: string): string | undefined {
  const folder = context.state.connections.saved.find((each) => each.id === connection)?.queriesFolder?.trim();
  return folder === undefined || folder === '' ? undefined : folder;
}

/** The connection a read is about: `args.connection`, or the connection of the target. */
function connectionArg(context: Context, args: Json): string | undefined {
  const named = fieldsOf(args)['connection'];
  if (typeof named === 'string') {
    return named;
  }
  return 'connection' in context.target ? context.target.connection : undefined;
}

/**
 * Asks the main process for the files of the connection's queries folder, or of `args.queriesFolder`, the folder just
 * chosen for it (`saved-query.choose-folder` within a save); nothing for a connection without one.
 */
export function request(context: Context, args: Json): ReadRequest {
  const connection = connectionArg(context, args) ?? null;
  const chosen = fieldsOf(args)['queriesFolder'];
  const folder =
    typeof chosen === 'string' ? chosen : connection === null ? undefined : queriesFolderOf(context, connection);
  return { kind: 'app', action: readFolderAction, args: { connection, queriesFolder: folder ?? null } };
}

/** The saved queries of the reply; `args.reported` holds the files already reported. */
export function parse(replies: readonly unknown[], args: Json): FolderQueries {
  const [reading] = replies;
  return reading === null || reading === undefined
    ? noFolderQueries
    : folderQueriesOf(reading, fieldsOf(args)['reported']);
}

/** The warning about the files not reported yet, when the read was started on its own (not by another feature). */
export function after(result: unknown, context: Context): readonly After[] {
  const connection = 'connection' in context.target ? context.target.connection : undefined;
  const fresh = (result as FolderQueries | undefined)?.fresh ?? [];
  const warning = connection === undefined ? undefined : skippedWarning(fresh, connection);
  return warning === undefined ? [] : [warning];
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('saved-query.read-folder'), request, parse, after };
