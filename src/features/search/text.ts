/**
 * Feature: search.text
 *
 * What the typed text looks for: the text of the search row, with the mode and **Match case**, turned into a pattern,
 * the same pattern without regard to case, and, in **Contains** mode, the whole text compared with numbers and
 * booleans as whole values. Ported from Mongoster's `src/search.ts › needleOf`, `unwrap`, `escapeRe`.
 *
 * The module also holds the words of the Search documents page (R10.1): the area's text module and the card share the
 * name `text`.
 */
import { groupThousands } from '../../shared/text-units';
import type { SearchMode } from './types';

/** What a text looks for, or why it cannot be searched. */
export type Wanted =
  | {
      readonly kind: 'wanted';
      readonly mode: SearchMode;
      /** Matched anywhere in a value. */
      readonly pattern: RegExp;
      /** The same pattern with `i`, for ObjectIds, UUIDs and dates, whatever **Match case** says. */
      readonly anyCase: RegExp;
      /** **Contains** only: the text, compared with numbers and booleans as a whole value. */
      readonly whole?: string;
    }
  | { readonly kind: 'error'; readonly message: string };

/** The words of the Search documents page, word for word as its cards write them. */
export const text = {
  blank: 'Type something to search.',
  title: 'Search documents',
  placeholder: {
    contains: 'Text, _id, number or date to find in any field  —  Enter searches',
    regex: '^mario|rossi$  or  /^ma/i  —  Enter searches',
  },
  mode: {
    label: 'Mode',
    contains: 'Contains',
    regex: 'Regex',
    tooltip:
      'Contains: the text anywhere in a value (an _id, a number or a date as a whole); Regex: a regular expression',
  },
  search: 'Search',
  stop: 'Stop',
  scope: {
    in: 'In',
    everyDatabase: 'Every database',
    collections: 'Collections',
    allCollections: 'All collections',
    view: 'view',
  },
  options: {
    matchCase: 'Match case',
    fieldNames: 'Field names',
    fieldNamesTooltip: 'Also find the text in field names',
    views: 'Views',
    viewsTooltip: 'Views usually show documents of a collection already searched',
    read: 'Read',
    perCollection: 'per collection',
    limits: {
      0: 'every document',
      1000: 'the first 1,000',
      10000: 'the first 10,000',
      100000: 'the first 100,000',
    },
  },
  summary: {
    listing: 'Listing the collections…',
    reading: (read: number, total: number) => `${groupThousands(read)} of ${countOf(total, 'collection')} read`,
    collections: (total: number) => countOf(total, 'collection'),
    stopped: (total: number, read: number) => `${countOf(total, 'collection')} (${groupThousands(read)} read)`,
    documentsRead: (read: number) => `${countOf(read, 'document')} read`,
    found: (documents: number, collections: number) =>
      `${countOf(documents, 'document')} found in ${countOf(collections, 'collection')}`,
    notReadable: (count: number) => `${groupThousands(count)} not readable`,
    seconds: (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} s`,
    separator: ' · ',
    states: { listing: 'searching…', searching: 'searching…', stopped: 'stopped', done: 'done', error: 'error' },
  },
  group: {
    documents: (count: number) => countOf(count, 'document'),
    reading: (read: number, estimate: number | undefined) =>
      estimate === undefined
        ? `reading… ${groupThousands(read)}`
        : `reading… ${groupThousands(read)} / ${groupThousands(estimate)}`,
    firstRead: (limit: number) => `first ${groupThousands(limit)} read`,
    openInCollection: 'Open in collection',
    openTooltip: (namespace: string) =>
      `Open ${namespace} filtered on the matching documents (up to ${groupThousands(1000)})`,
    moreDocuments: (count: number) => `+${groupThousands(count)} more ${count === 1 ? 'document' : 'documents'} — `,
    copyId: 'Copy _id',
    openDocument: 'Open document',
    moreMatches: (count: number) =>
      `+${groupThousands(count)} more ${count === 1 ? 'match' : 'matches'} in this document`,
  },
  kinds: {
    string: '',
    number: 'number',
    boolean: 'boolean',
    date: 'date',
    objectId: 'ObjectId',
    uuid: 'UUID',
    regex: 'regex',
    code: 'code',
    'field-name': 'field name',
  },
  empty: {
    done: (typed: string) => `No document contains “${typed}”.`,
    stopped: (typed: string) => `No document contains “${typed}” in the collections read.`,
  },
  progress: (typed: string, connection: string) => `Searching “${typed}” in ${connection}`,
  open: {
    title: (namespace: string) => `Open ${namespace} with the documents found`,
    step: (namespace: string, filter: string) => `open ${namespace} with the filter ${filter}`,
    more: (collection: string, kept: number, found: number) =>
      `${collection}: the filter has the first ${groupThousands(kept)} of ${groupThousands(found)} matching documents.`,
    nothingWritten: 'Nothing is written; closing the tab is enough.',
  },
  copy: {
    title: 'Copy _id',
    step: (id: string) => `copy ${id} to the clipboard`,
    copied: 'Copied to the clipboard',
    nothingWritten: 'Nothing is written to a deployment.',
  },
  show: {
    openStep: 'open the Search documents page',
    scopeStep: (scope: string) => `set the scope of the search to ${scope}`,
    startStep: (typed: string) => `search “${typed}”`,
    nothingWritten: 'Nothing is written; closing the tab is enough.',
  },
  commands: { show: 'Search documents' },
} as const;

/** `1 collection`, `14 collections`, `12,400 documents`. */
function countOf(count: number, noun: string): string {
  return `${groupThousands(count)} ${count === 1 ? noun : `${noun}s`}`;
}

/** The mongosh helpers whose value is unwrapped in **Contains** mode: `ObjectId("…")`, `NumberLong(42)`. */
const helperCall =
  /^(?:new\s+)?(?:ObjectId|ISODate|Date|UUID|NumberLong|NumberInt|NumberDecimal|Long|Int32|Double|Decimal128)\(\s*(['"]?)(.*?)\1\s*\)$/isu;

/** A text between two `"` or two `'`. */
const quoted = /^(['"])(.*)\1$/su;

/** The value inside a mongosh helper or quotes, or the text itself. */
function unwrapped(typed: string): string {
  const call = helperCall.exec(typed);
  if (call !== null) {
    return call[2] ?? '';
  }
  const inQuotes = quoted.exec(typed);
  return inQuotes === null ? typed : (inQuotes[2] ?? '');
}

/** The text with every character a regular expression gives a meaning to escaped: `a.b` finds `a.b` only. */
function escaped(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** A text written as `/source/flags`. */
const regexLiteral = /^\/(.+)\/([a-z]*)$/su;

/** The regular expression, or the message of the error the engine gives for it. */
function compiled(source: string, flags: string): RegExp | string {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function regexWanted(typed: string, matchCase: boolean): Wanted {
  const literal = regexLiteral.exec(typed);
  const source = literal === null ? typed : (literal[1] ?? '');
  const typedFlags = (literal === null ? '' : (literal[2] ?? '')).replace(/[gy]/gu, '');
  const flags = matchCase || typedFlags.includes('i') ? typedFlags : `${typedFlags}i`;
  const pattern = compiled(source, flags);
  if (typeof pattern === 'string') {
    // The message names the flags the user typed, not the `i` Datardo adds: */([/: Unterminated character class*.
    const own = compiled(source, typedFlags);
    return { kind: 'error', message: typeof own === 'string' ? own : pattern };
  }
  const anyCase = flags.includes('i') ? pattern : compiled(source, `${flags}i`);
  return typeof anyCase === 'string'
    ? { kind: 'error', message: anyCase }
    : { kind: 'wanted', mode: 'regex', pattern, anyCase };
}

/** Feature: search.text — what the typed text looks for, in a mode, with or without **Match case**. */
export function wanted(typed: string, mode: SearchMode, matchCase: boolean): Wanted {
  const trimmed = typed.trim();
  if (trimmed === '') {
    return { kind: 'error', message: text.blank };
  }
  if (mode === 'regex') {
    return regexWanted(trimmed, matchCase);
  }
  const literal = unwrapped(trimmed);
  if (literal === '') {
    return { kind: 'error', message: text.blank };
  }
  return {
    kind: 'wanted',
    mode,
    pattern: new RegExp(escaped(literal), matchCase ? 'u' : 'iu'),
    anyCase: new RegExp(escaped(literal), 'iu'),
    whole: literal,
  };
}
