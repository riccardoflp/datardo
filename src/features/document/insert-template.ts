/**
 * Feature: document.insert-template
 *
 * Starts the insert dialog from a document shaped like most of the collection's: the top-level fields that at least
 * half of the sampled documents have, but `_id`, each with an empty value of its most frequent type.
 */
import { keyText } from '../aggregate/mongosh/format';

/** A field of the collection's sample, as `query.autocomplete` gives it. */
export interface SampledField {
  /** The field path: `name`, `address.city`. */
  readonly path: string;
  /** The type names of its values, the most frequent first: `string`, `int`, `date`, `objectId`. */
  readonly types: readonly string[];
  /** The share of the sampled documents that have it, from 0 to 1. */
  readonly share: number;
}

/** The most fields a template has (Mongoster's 30). */
export const templateMostFields = 30;

/** The share of the documents a field must be in to be in the template. */
export const templateLeastShare = 0.5;

/** The empty value of each type, in mongosh syntax; `ISODate()` is the time of the insert. */
const emptyValues: Readonly<Record<string, string>> = {
  string: '""',
  int: '0',
  double: '0',
  long: '0',
  decimal: '0',
  bool: 'false',
  date: 'ISODate()',
  object: '{}',
  array: '[]',
};

/** The empty document: `{`, an indented empty line, `}`. */
export const emptyDocumentText = '{\n  \n}';

/**
 * Feature: document.insert-template
 *
 * The text of the template, one field per line: `{ name: "", age: 0, createdAt: ISODate() }` written on several
 * lines, or the empty document when no field is in half of the documents.
 */
export function templateText(fields: readonly SampledField[]): string {
  const chosen = fields
    .filter((field) => !field.path.includes('.') && field.path !== '_id' && field.share >= templateLeastShare)
    .slice(0, templateMostFields);
  if (chosen.length === 0) {
    return emptyDocumentText;
  }
  const lines = chosen.map((field) => `  ${keyText(field.path)}: ${emptyValues[field.types[0] ?? ''] ?? 'null'}`);
  return `{\n${lines.join(',\n')}\n}`;
}
