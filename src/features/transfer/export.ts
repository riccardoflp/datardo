/**
 * Feature: transfer.export
 *
 * Writes what the table shows, the documents of a collection or view, or the selected rows to a JSON, JSON Lines or
 * CSV file. The plan writes one file, with the writer `transfer.export` of the main process, which reads the
 * documents in batches of 1,000 with the request of {@link exportRequest} and writes them with
 * {@link exportPieces}; a scheduled task writes its exports with the same writer (`task.run`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { ask, noDanger, refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { nothingToDo } from '../task/types';
import type { ConnectionId } from '../../shared/ids';
import { write } from '../backup/folder-layout';
import type { ExportFormat } from '../task/types';
import { csvTable, plainColumns, toCsv, type CsvColumn } from './csv-write';
import { exportText as text } from './text';
import { answerText, batchSize, isPlainObject, isWrapper } from './types';
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

/**
 * Feature: transfer.export — on a collection or view, with what the table shows in `answers.args`: the format, which
 * results from the toolbar, the file; then one `write` of the file.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  if (target.kind !== 'collection') {
    return nothingToDo(text.planTitle(''), text.cannotUndo);
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
  const file = answerText(answers['file']);
  if (file === '') {
    const title = text.title(target.collection);
    const proposed = `${target.collection}.${extensions[format]}`;
    return ask({ title, button: text.save, fields: [{ kind: 'text', key: 'file', label: title, default: proposed }] });
  }
  const args: ExportWriterArgs = {
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
    ...(scope === 'page' && source.page !== undefined
      ? { skip: source.page.first - 1, limit: source.page.last - source.page.first + 1 }
      : {}),
    ...(source.ids === undefined ? {} : { ids: source.ids }),
    ...(source.columns === undefined ? {} : { columns: source.columns }),
  };
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
