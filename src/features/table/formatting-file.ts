/**
 * Feature: table.formatting-file
 *
 * What a `.datardo-formatting.json` file holds: JSON with one group of formatting rules per scope and nothing of a
 * connection (no id, no name, no host), the names of the database and the collection only, to say where the rules
 * came from. How it is written, how it is read back without trusting it (Mongoster's `.mongoster-formatting.json`
 * too), and how the rules of a file are added to the rules of a scope. Nothing in it is run: a condition stays text.
 */
import type { Json } from '../../shared/engine-request';
import {
  formatScopes,
  isFormatScope,
  longestFormattingName,
  mostFormattingRules,
  readFormatRules,
  type FormatRule,
  type FormatScope,
} from '../../shared/formatting-rules';
import type { RulesByScope } from './format-scopes';
import { text } from './text';

/** The version of the file's form, in its `datardoFormatting` property. */
export const formattingFileVersion = 1;

/** The characters of a larger file are not read. */
export const largestFormattingFile = 1_000_000;

/** The end of the name of a formatting file. */
export const formattingFileSuffix = '.datardo-formatting.json';

/** A group of a formatting file: the rules of one scope, and where a database's or a collection's came from. */
export interface FormattingGroup {
  readonly scope: FormatScope;
  readonly database?: string;
  readonly collection?: string;
  readonly rules: readonly FormatRule[];
}

/** The groups of a file that can be used, and how many of its rules could not be read. */
export interface FormattingFile {
  readonly groups: readonly FormattingGroup[];
  readonly unreadable: number;
}

/** Why a text is not a formatting file: the reason, which `table.import-formatting` refuses with, and its message. */
export interface FormattingFileProblem {
  readonly reason: 'too-large' | 'not-json' | 'not-formatting' | 'newer';
  readonly message: string;
}

/** The widest scope first: a file reads from what applies everywhere to what applies to one collection. */
const fileOrder: readonly FormatScope[] = [...formatScopes].reverse();

/**
 * Feature: table.formatting-file
 *
 * The text of a formatting file for the chosen scopes of the rules that reach a collection: one group per chosen
 * scope that has rules, the widest first, as JSON indented by two spaces and ending with a line break.
 */
export function formattingFileText(
  rules: RulesByScope,
  scopes: readonly FormatScope[],
  place: { readonly database: string; readonly collection: string },
): string {
  const groups = fileOrder
    .filter((scope) => scopes.includes(scope) && rules[scope].length > 0)
    .map((scope) => ({
      scope,
      ...(scope === 'database' || scope === 'collection' ? { database: place.database } : {}),
      ...(scope === 'collection' ? { collection: place.collection } : {}),
      rules: rules[scope],
    }));
  return `${JSON.stringify({ datardoFormatting: formattingFileVersion, groups }, null, 2)}\n`;
}

type JsonRecord = { readonly [key: string]: Json };

function isRecord(value: Json | undefined): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function placeName(value: Json | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value.slice(0, longestFormattingName) : undefined;
}

/** The version of a file of Datardo or of Mongoster, or why it is not one. */
function versionOf(value: Json): number | FormattingFileProblem {
  const version = isRecord(value) ? (value['datardoFormatting'] ?? value['mongosterFormatting']) : undefined;
  if (!isRecord(value) || typeof version !== 'number' || !Array.isArray(value['groups'])) {
    return { reason: 'not-formatting', message: text.formattingFile.notFormatting };
  }
  return version > formattingFileVersion ? { reason: 'newer', message: text.formattingFile.newer } : version;
}

function groupsOf(entries: readonly Json[]): FormattingFile {
  const groups: FormattingGroup[] = [];
  let unreadable = 0;
  for (const entry of entries) {
    const listed = isRecord(entry) && Array.isArray(entry['rules']) ? (entry['rules'] as readonly Json[]) : [];
    const scope = isRecord(entry) ? entry['scope'] : undefined;
    if (!isRecord(entry) || !isFormatScope(scope)) {
      unreadable += listed.length;
      continue;
    }
    const read = readFormatRules(listed);
    unreadable += read.unreadable;
    const [database, collection] = [placeName(entry['database']), placeName(entry['collection'])];
    if (read.rules.length > 0) {
      groups.push({
        scope,
        ...(database === undefined ? {} : { database }),
        ...(collection === undefined ? {} : { collection }),
        rules: read.rules,
      });
    }
  }
  return { groups, unreadable };
}

/**
 * Feature: table.formatting-file
 *
 * The groups of a file's text, each with the rules it can use (`readFormatRules`), and how many could not be read; or
 * why the text is not a formatting file: over 1 MB, not JSON, not a file of formatting rules, of a later version. A
 * group of an unknown scope is dropped with its rules, counted.
 */
export function groupsOfFormattingFile(written: string): FormattingFile | FormattingFileProblem {
  if (written.length > largestFormattingFile) {
    return { reason: 'too-large', message: text.formattingFile.tooLarge };
  }
  let value: Json;
  try {
    value = JSON.parse(written) as Json;
  } catch (error: unknown) {
    // A text that is not JSON is the answer, with the parser's message.
    return { reason: 'not-json', message: text.formattingFile.notJson(error instanceof Error ? error.message : '') };
  }
  const version = versionOf(value);
  if (typeof version !== 'number') {
    return version;
  }
  return groupsOf((value as JsonRecord)['groups'] as readonly Json[]);
}

/** A value as text with its keys in order, so that two rules equal but for the order of their fields compare equal. */
function sortedText(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedText).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${sortedText(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameRule(first: FormatRule, second: FormatRule): boolean {
  const { id: _first, ...left } = first;
  const { id: _second, ...right } = second;
  return sortedText(left) === sortedText(right);
}

/** The rules of a scope after an import, and how many were added, were already there, did not fit. */
export interface ImportedRules {
  readonly rules: readonly FormatRule[];
  readonly added: number;
  readonly already: number;
  readonly over: number;
}

/**
 * Feature: table.formatting-file
 *
 * The rules of a group added after the rules already in a scope, each with a new id from `newId`: a rule equal to one
 * already there, all but its id, is skipped and counted; past 100 rules, the rest are counted as not fitting. Nothing
 * is replaced.
 */
export function rulesWithImported(
  existing: readonly FormatRule[],
  incoming: readonly FormatRule[],
  newId: () => string,
): ImportedRules {
  const rules = [...existing];
  let [added, already, over] = [0, 0, 0];
  for (const rule of incoming) {
    if (rules.some((each) => sameRule(each, rule))) {
      already += 1;
    } else if (rules.length >= mostFormattingRules) {
      over += 1;
    } else {
      rules.push({ ...rule, id: newId() });
      added += 1;
    }
  }
  return { rules, added, already, over };
}
