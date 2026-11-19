/**
 * Feature: transfer.import-files
 *
 * How the text of an import file becomes documents: CSV when its name ends with `.csv`, otherwise one array of
 * documents or one document per line, each read as JSON first and in mongosh syntax second. The values keep the types
 * Extended JSON gives them. The text is read with limits on its size and its depth (R14.4), and nothing in it runs.
 */
import { csvToDocuments, parseCsv } from './csv-read';
import { importText } from './text';
import { isPlainObject, type JsonDocument } from './types';
import { canonical } from './values/canonical';
import { readMongosh } from './values/mongosh';

/** The largest import file read, in characters (R14.4; Datardo's choice). */
export const largestImport = 256 * 1024 * 1024;

/** The text, read as JSON, then in mongosh syntax; the JSON error when both fail. */
function readValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (jsonError) {
    try {
      return readMongosh(text);
    } catch {
      throw jsonError instanceof Error ? jsonError : new Error(String(jsonError));
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The values of a JSON Lines text: one per line that is not blank, or the whole text as one document. */
function readLines(text: string): unknown[] {
  const lines = text.split(/\r\n|\n|\r/u);
  const values: unknown[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      continue;
    }
    try {
      values.push(readValue(line));
    } catch (error) {
      if (values.length > 0) {
        throw new Error(importText.line(index + 1, messageOf(error)));
      }
      return [readWhole(text, index + 1, error)];
    }
  }
  return values;
}

/** The whole text as one document written on several lines; when it is not, the error of its first line. */
function readWhole(text: string, line: number, lineError: unknown): unknown {
  try {
    return readValue(text);
  } catch {
    throw new Error(importText.line(line, messageOf(lineError)));
  }
}

/** The values as documents of canonical Extended JSON: every one an object. */
function documentsOf(values: readonly unknown[]): JsonDocument[] {
  return values.map((value, index) => {
    if (!isPlainObject(value)) {
      throw new Error(importText.notAnObject(index + 1));
    }
    return canonical(value) as JsonDocument;
  });
}

/**
 * The documents of an import file, as canonical Extended JSON, or an error whose message the import shows after
 * *Can't import \<file\>:*.
 */
export function parseImport(text: string, fileName: string): JsonDocument[] {
  if (text.length > largestImport) {
    throw new Error(importText.tooLarge('256 MB'));
  }
  if (fileName.toLowerCase().endsWith('.csv')) {
    return documentsOf(csvToDocuments(parseCsv(text)));
  }
  const trimmed = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
  if (trimmed === '') {
    return [];
  }
  if (trimmed.startsWith('[')) {
    const value = readValue(trimmed);
    if (!Array.isArray(value)) {
      throw new Error(importText.expectedArray);
    }
    return documentsOf(value);
  }
  return documentsOf(readLines(trimmed));
}
