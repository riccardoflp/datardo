/**
 * Feature: transfer.export
 *
 * Writes what the table shows, the documents of a collection or view, or the selected rows to a JSON, JSON Lines or
 * CSV file. The plan writes one file, with the writer `transfer.export` of the main process, which reads the
 * documents in batches of 1,000 with the request of {@link exportRequest} and writes them with
 * {@link exportPieces}; a scheduled task writes its exports with the same writer (`task.run`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import type { After, Answers, Context, Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { chosenPath, dialogArgs, nothing, pathRead, pathStep } from './ask/choose-path';
import { nothingToDo } from '../task/types';
import type { ConnectionId } from '../../shared/ids';
import { write } from '../backup/folder-layout';
import type { ExportFormat } from '../task/types';
import { csvTable, plainColumns, toCsv, type CsvColumn } from './csv-write';
import { exportText as text } from './text';
import { batchSize, isPlainObject, isWrapper } from './types';
import { canonical } from './values/canonical';
import { readMongosh } from './values/mongosh';

/**
 * What an export is started with (`answers.args`): from the toolbar, the query or the pipeline the table shows, its
 * page and its columns; from a selection, the `_id`s of the rows; from the tree, nothing.
 */
export interface ExportSource {
  /** The query's texts in mongosh syntax; empty when there is none. */
  readonly filter?: string;
  readonly projection?: string;
  readonly sort?: string;
  /** The stages of the pipeline up to the one shown, each in mongosh syntax. */
  readonly pipeline?: readonly string[];
  /** The page the table shows, from the toolbar: its first and last document, counted from 1. */
  readonly page?: { readonly first: number; readonly last: number };
  /** The number of results, when it is known. */
  readonly count?: number;
  /** The `_id`s of the selected rows, as canonical Extended JSON. */
  readonly ids?: readonly Json[];
  /** The columns the table shows, for CSV. */
  readonly columns?: readonly CsvColumn[];
}

/** What the writer `transfer.export` is given, also by `task.run` (which gives only the first eight). */
export interface ExportWriterArgs {
  readonly task: string | null;
  readonly connection: ConnectionId;
  readonly database: string | null;
  readonly collection: string | null;
  readonly format: ExportFormat;
  readonly filter: string;
  readonly projection: string;
  readonly batchSize: number;
  readonly sort?: string;
  readonly pipeline?: readonly string[];
  readonly skip?: number;
  readonly limit?: number;
  readonly ids?: readonly Json[];
  readonly columns?: readonly CsvColumn[];
}

const extensions: Readonly<Record<ExportFormat, string>> = { json: 'json', jsonl: 'jsonl', csv: 'csv' };

/** The read of the save dialog of an export. */
export const fileReadId = 'transfer.export:file';

/** `transfer.export:file`: the system's save dialog, which answers the path, or null when it was closed. */
export const fileRead = pathRead(fileReadId, 'transfer.choose-path');

/** How the writer of an export ended: what it wrote, or that it was cancelled, or its error. */
export type ExportEnded =
  | { readonly kind: 'done'; readonly documents: number; readonly path: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: string };

/**
 * The notification that ends an export, which its writer sends: *Exported \<n\> documents to \<file name\>.* with
 * **Open** and **Reveal**, *Export cancelled.*, or *Export failed: \<error\>*.
 */
export function exportMessage(args: ExportWriterArgs, ended: ExportEnded): Extract<After, { kind: 'notify' }> {
  if (ended.kind === 'cancelled') {
    return { kind: 'notify', level: 'info', text: text.cancelled };
  }
  if (ended.kind === 'failed') {
    return { kind: 'notify', level: 'error', text: text.failed(ended.error) };
  }
  const name = ended.path.split(/[\\/]/u).pop() ?? ended.path;
  const target = {
    kind: 'collection',
    connection: args.connection,
    database: args.database ?? '',
    collection: args.collection ?? '',
  } as const;
  const feature = featureId('transfer.export');
  return {
    kind: 'notify',
    level: 'success',
    text: text.done(ended.documents, name),
    actions: [
      { label: text.open, feature, target, args: { open: ended.path } },
      { label: text.reveal, feature, target, args: { reveal: ended.path } },
    ],
  };
}

/** The texts of the source that are not empty, read: the first that does not parse gives its error. */
function parseProblem(source: ExportSource, parse: (text: string) => Json): string | undefined {
  const texts = [source.filter, source.projection, source.sort, ...(source.pipeline ?? [])];
  for (const each of texts) {
    try {
      if (each !== undefined && each.trim() !== '') {
        parse(each);
      }
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

/** A text of mongosh syntax as canonical Extended JSON: the stand-in for `query.parse`. */
export function parseQueryText(source: string): Json {
  return canonical(readMongosh(source));
}

/** The stage that writes, when the pipeline ends with `$out` or `$merge`. */
export function writingStage(pipeline: readonly string[] | undefined): string | undefined {
  const last = pipeline?.[pipeline.length - 1]?.trim() ?? '';
  const stage = /^\{\s*["']?\$(out|merge)["']?\s*:/u.exec(last)?.[1];
  return stage === undefined ? undefined : `$${stage}`;
}

/** **Open** or **Reveal** of the notification of an export: the file it wrote, `args.open` or `args.reveal`. */
function shownFile(answers: Answers): { readonly what: 'open' | 'reveal'; readonly path: string } | undefined {
  const args = answers['args'];
  if (!isPlainObject(args)) {
    return undefined;
  }
  const open = args['open'];
  const reveal = args['reveal'];
  if (typeof open === 'string' && open !== '') {
    return { what: 'open', path: open };
  }
  return typeof reveal === 'string' && reveal !== '' ? { what: 'reveal', path: reveal } : undefined;
}

function sourceOf(answers: Answers): ExportSource {
  const args = answers['args'];
  return isPlainObject(args) ? args : {};
}

function pickFormat(collection: string): Outcome {
  const title = text.title(collection);
  const choices = (['json', 'jsonl', 'csv'] as const).map((value) => ({ value, ...text.formats[value] }));
  return ask({ title, button: text.choose, fields: [{ kind: 'pick-one', key: 'format', label: title, choices }] });
}

function pickScope(collection: string, format: ExportFormat, source: ExportSource): Outcome {
  const title = text.scopeTitle(collection, text.formats[format].label);
  const page = source.page ?? { first: 1, last: 1 };
  const choices = [
    { value: 'all', label: text.allResults(source.count) },
    { value: 'page', label: text.currentPage(page.first, page.last) },
  ];
  return ask({ title, button: text.choose, fields: [{ kind: 'pick-one', key: 'scope', label: title, choices }] });
}

/** What the writer of an export is given: the collection, the format, the read, and the page when only it is wanted. */
function writerArgs(
  target: Extract<Context['target'], { kind: 'collection' }>,
  format: ExportFormat,
  source: ExportSource,
  pageOnly: boolean,
): ExportWriterArgs {
  return {
    task: null,
    connection: target.connection,
    database: target.database,
    collection: target.collection,
    format,
    filter: source.filter ?? '',
    projection: source.projection ?? '',
    batchSize,
    ...(source.sort === undefined ? {} : { sort: source.sort }),
    ...(source.pipeline === undefined ? {} : { pipeline: source.pipeline }),
    ...(pageOnly && source.page !== undefined
      ? { skip: source.page.first - 1, limit: source.page.last - source.page.first + 1 }
      : {}),
    ...(source.ids === undefined ? {} : { ids: source.ids }),
    ...(source.columns === undefined ? {} : { columns: source.columns }),
  };
}

/**
 * Feature: transfer.export — on a collection or view, with what the table shows in `answers.args`: the format, which
 * results from the toolbar, the file; then one `write` of the file.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  if (target.kind !== 'collection') {
    return nothingToDo(text.planTitle(''), text.cannotUndo);
  }
  const shown = shownFile(answers);
  if (shown !== undefined) {
    return run({
      ...nothing(text.planTitle(target.collection), text.cannotUndo),
      steps: [pathStep(shown.what, shown.path)],
    });
  }
  const source = sourceOf(answers);
  const stage = writingStage(source.pipeline);
  if (stage !== undefined) {
    return refuse('transfer.export/writes', text.writes(stage));
  }
  const problem = parseProblem(source, parseQueryText);
  if (problem !== undefined) {
    return refuse('transfer.export/invalid-query', text.invalid(problem));
  }
  const format = answers['format'];
  if (format !== 'json' && format !== 'jsonl' && format !== 'csv') {
    return pickFormat(target.collection);
  }
  const scope = answers['scope'];
  if (source.page !== undefined && scope !== 'all' && scope !== 'page') {
    return pickScope(target.collection, format, source);
  }
  const file = chosenPath(answers['file']);
  if (file === undefined) {
    const title = text.title(target.collection);
    const name = `${target.collection}.${extensions[format]}`;
    const filters = [{ name: text.formats[format].label, extensions: [extensions[format]] }];
    return needRead('file', fileReadId, dialogArgs({ mode: 'save', title, button: text.save, name, filters }));
  }
  if (file === null) {
    return run(nothing(text.planTitle(target.collection), text.cannotUndo));
  }
  const args = writerArgs(target, format, source, scope === 'page');
  return run({
    title: text.planTitle(target.collection),
    steps: [write(file, 'transfer.export', args as unknown as Json)],
    danger: noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [],
  });
}

function parsedOr(source: string | undefined, parse: (text: string) => Json, otherwise: Json): Json {
  return source === undefined || source.trim() === '' ? otherwise : parse(source);
}

/**
 * The read of an export, which the writer runs in batches of 1,000: `find(<filter>, { projection, sort, skip, limit
 * })`, the filter replaced by `{ _id: { $in: [<ids>] } }` for a selection; or `aggregate([<stages>, { $match } of the
 * selection, { $skip }, { $limit }], { allowDiskUse: true })`. `parse` is `query.parse`.
 */
export function exportRequest(args: ExportWriterArgs, parse: (text: string) => Json = parseQueryText): MongoRequest {
  const on = { engine: 'mongodb', database: args.database ?? '', collection: args.collection ?? '' } as const;
  const selection: Json = args.ids === undefined ? null : { _id: { $in: [...args.ids] } };
  const skip: Json = args.skip === undefined ? null : { $numberInt: String(args.skip) };
  const limit: Json = args.limit === undefined ? null : { $numberInt: String(args.limit) };
  if (args.pipeline !== undefined) {
    const stages: Json[] = [
      ...args.pipeline.map((stage) => parse(stage)),
      ...(selection === null ? [] : [{ $match: selection }]),
      ...(skip === null ? [] : [{ $skip: skip }]),
      ...(limit === null ? [] : [{ $limit: limit }]),
    ];
    return { ...on, method: 'aggregate', arguments: [stages, { allowDiskUse: true }] };
  }
  const options = Object.fromEntries(
    Object.entries({
      projection: parsedOr(args.projection, parse, null),
      sort: parsedOr(args.sort, parse, null),
      skip,
      limit,
    }).filter(([, value]) => value !== null),
  );
  const filter = selection ?? parsedOr(args.filter, parse, {});
  return { ...on, method: 'find', arguments: [filter, options] };
}

const largestSafe = 2 ** 53;

/** A value of canonical Extended JSON as relaxed Extended JSON, as a JSON export writes it. */
export function relaxed(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(relaxed);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  if (isWrapper(value)) {
    return relaxedWrapper(value);
  }
  return Object.fromEntries(Object.entries(value as Readonly<Record<string, Json>>).map(([k, v]) => [k, relaxed(v)]));
}

function relaxedWrapper(wrapper: Readonly<Record<string, Json>>): Json {
  const [key, inner] = Object.entries(wrapper)[0] ?? ['', null];
  const number = Number(inner);
  switch (key) {
    case '$numberInt':
      return number;
    case '$numberDouble':
      return Number.isFinite(number) ? number : wrapper;
    case '$numberLong':
      return Math.abs(number) < largestSafe ? number : wrapper;
    case '$date': {
      const milliseconds = Number(isPlainObject(inner) ? inner['$numberLong'] : Number.NaN);
      const year = Number.isFinite(milliseconds) ? new Date(milliseconds).getUTCFullYear() : 0;
      return year >= 1970 && year <= 9999 ? { $date: new Date(milliseconds).toISOString() } : wrapper;
    }
    default:
      return wrapper;
  }
}

/** The text of the documents of a JSON or JSON Lines export, the first being document `index` of the file (from 0). */
export function exportPieces(format: 'json' | 'jsonl', documents: readonly Json[], index: number): string {
  if (format === 'jsonl') {
    return documents.map((document) => `${JSON.stringify(document)}\n`).join('');
  }
  return documents
    .map((document, at) => {
      const body = JSON.stringify(relaxed(document), null, 2).replaceAll('\n', '\n  ');
      return `${index + at === 0 ? '[\n  ' : ',\n  '}${body}`;
    })
    .join('');
}

/** How a JSON export starts when it has no document yet, and how it ends after `count` documents. */
export function exportEnd(format: 'json' | 'jsonl', count: number): string {
  if (format === 'jsonl') {
    return '';
  }
  return count === 0 ? '[]\n' : '\n]\n';
}

/** The text of a CSV export: the byte order mark, then the table of `transfer.csv-write`. */
export function csvExport(documents: readonly Json[], columns?: readonly CsvColumn[]): string {
  const rows = documents.flatMap((document) => {
    const row = relaxed(document);
    return isPlainObject(row) ? [row] : [];
  });
  return `\uFEFF${toCsv(csvTable(rows, columns ?? plainColumns(rows)))}`;
}
