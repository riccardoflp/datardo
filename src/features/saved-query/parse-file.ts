/**
 * Feature: saved-query.parse-file
 *
 * Reads one file of the queries folder, or says what is wrong with it, as Mongoster's `parseProjectQuery` does: each
 * message completes *Datardo skipped the saved query <file>:*. The texts are not parsed as mongosh here: a filter that
 * is not valid mongosh is listed, and refused when it runs. Fields the format does not name are ignored. The file
 * comes from outside (T5): its size is limited before it is read (`saved-query.read-folder`), and only the fields of
 * the format are looked at.
 */
import { text } from './text';
import type { QueryFile, QueryText, Stage } from './types';

/** A saved query read from its file, or the message that says why it is not one. */
export type ParsedQueryFile =
  { readonly ok: true; readonly query: QueryFile } | { readonly ok: false; readonly message: string };

type Fields = Readonly<Record<string, unknown>>;

/** Why a file is not a saved query; caught in {@link parsedQueryFile} and turned into its message. */
class FileProblem extends Error {}

function lines(fields: Fields, field: string, where = ''): string {
  const value = fields[field];
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.every((line) => typeof line === 'string')) {
    return value.join('\n');
  }
  throw new FileProblem(text.file.notLines(field, where));
}

function required(fields: Fields, field: string): string {
  const value = fields[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FileProblem(text.file.missing(field));
  }
  return value.trim();
}

function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stageOf(value: unknown, index: number): Stage {
  const number = index + 1;
  const where = text.file.ofStage(number);
  if (!isObject(value)) {
    throw new FileProblem(text.file.stageNotObject(number));
  }
  const name = typeof value['stage'] === 'string' ? value['stage'].trim() : '';
  if (!/^\$\w+$/u.test(name)) {
    throw new FileProblem(text.file.stageName(where));
  }
  const enabled = value['enabled'];
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new FileProblem(text.file.enabled(where));
  }
  return { name, body: lines(value, 'body', where), enabled: enabled !== false };
}

function queryOf(fields: Fields): QueryText {
  const find = {
    kind: 'find' as const,
    filter: lines(fields, 'filter'),
    sort: lines(fields, 'sort'),
    projection: lines(fields, 'projection'),
  };
  const pipeline = fields['pipeline'];
  if (pipeline === undefined) {
    return find;
  }
  if (find.filter.trim() !== '' || find.sort.trim() !== '' || find.projection.trim() !== '') {
    throw new FileProblem(text.file.both);
  }
  if (!Array.isArray(pipeline)) {
    throw new FileProblem(text.file.pipelineNotArray);
  }
  return { kind: 'pipeline', stages: (pipeline as readonly unknown[]).map(stageOf) };
}

function connectionOf(fields: Fields): string | undefined {
  const connection = fields['connection'];
  if (connection === undefined || connection === null) {
    return undefined;
  }
  if (typeof connection !== 'string') {
    throw new FileProblem(text.file.connection);
  }
  return connection.trim() === '' ? undefined : connection.trim();
}

function queryFileOf(fields: Fields): QueryFile {
  const name = required(fields, 'name');
  const database = required(fields, 'database');
  const collection = required(fields, 'collection');
  const description = lines(fields, 'description').trim();
  const connection = connectionOf(fields);
  return {
    name,
    ...(description === '' ? {} : { description }),
    ...(connection === undefined ? {} : { connection }),
    database,
    collection,
    query: queryOf(fields),
  };
}

function jsonOf(file: string): unknown {
  try {
    return JSON.parse(file.replace(/^\u{FEFF}/u, '')) as unknown;
  } catch (error: unknown) {
    throw new FileProblem(text.file.notJson(error instanceof Error ? error.message : String(error)));
  }
}

/** Feature: saved-query.parse-file — the saved query of a file's text, or what is wrong with it. */
export function parsedQueryFile(file: string): ParsedQueryFile {
  try {
    const value = jsonOf(file);
    if (!isObject(value)) {
      throw new FileProblem(text.file.notObject);
    }
    return { ok: true, query: queryFileOf(value) };
  } catch (error: unknown) {
    if (error instanceof FileProblem) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
