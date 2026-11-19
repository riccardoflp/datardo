/**
 * Feature: saved-query.file-format
 *
 * The text of a file of the queries folder: JSON that reads well and gives small differences in git, byte for byte
 * what Mongoster 0.8.0 writes for the same query (its `serializeProjectQuery`, its decision D15). The fields are in a
 * fixed order; the texts are the mongosh the user typed, never parsed or formatted; a text of several lines is an
 * array of lines. Nothing in it belongs to one machine: no connection string, no identifier, no time.
 */
import type { QueryFile, QueryText } from './types';

type FileValue = string | readonly string[];

/** A text of one line as a string, of several lines as an array of lines, whatever line breaks it had. */
export function textValue(text: string): FileValue {
  const lines = text.replace(/\r\n?/gu, '\n');
  return lines.includes('\n') ? lines.split('\n') : lines;
}

function queryFields(query: QueryText): Readonly<Record<string, unknown>> {
  if (query.kind === 'pipeline') {
    return {
      pipeline: query.stages.map((stage) => ({
        stage: stage.name.trim(),
        body: textValue(stage.body.trim()),
        ...(stage.enabled ? {} : { enabled: false }),
      })),
    };
  }
  const texts = Object.entries({ filter: query.filter, sort: query.sort, projection: query.projection })
    .map(([field, text]) => [field, text.trim()] as const)
    .filter(([, text]) => text !== '');
  return texts.length === 0
    ? { filter: '{}' }
    : Object.fromEntries(texts.map(([field, text]) => [field, textValue(text)]));
}

/** Feature: saved-query.file-format — the text of the file of a saved query, ending with one line break. */
export function queryFileText(query: QueryFile): string {
  const description = query.description?.trim() ?? '';
  const connection = query.connection?.trim() ?? '';
  const file = {
    name: query.name,
    ...(description === '' ? {} : { description: textValue(description) }),
    ...(connection === '' ? {} : { connection }),
    database: query.database,
    collection: query.collection,
    ...queryFields(query.query),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
