/**
 * Feature: search.match
 *
 * The values of one document in which the text is found (and, with **Field names**, the field names), each with the
 * text around it, as the page lists them. Every field is visited in the order of the document, to any depth: the
 * fields of sub-documents with their dotted path, the elements of arrays with their index. Ported from Mongoster's
 * `src/search.ts › matchDocument`, `leafOf`, `sameNumber`, `hit`.
 */
import type { Json } from '../../shared/engine-request';
import { isJsonObject, wrapperType, type JsonObject } from '../query/mongosh/ejson';
import { formattedValue } from '../query/format';
import { leafOf, shortestIdPart, type Leaf } from './model/leaf';
import type { Wanted } from './text';
import type { MatchKind, SearchMatch, SearchResult } from './types';

/** The matches of a document that are kept; the others are counted (rule 6). */
export const keptMatches = 5;

/** The characters shown before and after a match (rule 5). */
export const aroundMatch = 40;

/** The longest matched text shown before it is cut with `…` (rule 5). */
export const longestMatch = 120;

type Looking = Extract<Wanted, { readonly kind: 'wanted' }>;

/** The matches found so far: the first 5 kept, all counted. */
interface Found {
  readonly kept: SearchMatch[];
  count: number;
}

/** New lines and tabs as one space, so that a match is shown on one line. */
function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/gu, ' ');
}

function matchOf(path: string, kind: MatchKind, value: string, where: readonly [number, number]): SearchMatch {
  const [start, end] = where;
  const from = Math.max(0, start - aroundMatch);
  const to = Math.min(value.length, end + aroundMatch);
  const matched = value.slice(start, end);
  return {
    path,
    kind,
    before: (from > 0 ? '…' : '') + oneLine(value.slice(from, start)),
    match: oneLine(matched.length > longestMatch ? `${matched.slice(0, longestMatch)}…` : matched),
    after: oneLine(value.slice(end, to)) + (to < value.length ? '…' : ''),
  };
}

function found(pattern: RegExp, value: string): readonly [number, number] | undefined {
  const match = pattern.exec(value);
  return match === null ? undefined : [match.index, match.index + match[0].length];
}

/** Rule 3: the same text, or two finite numbers of the same value: `42` is `NumberLong(42)` and `42.0`. */
function isSameValue(value: string, whole: string): boolean {
  if (value === whole) {
    return true;
  }
  const left = Number(value);
  const right = Number(whole);
  return whole.trim() !== '' && Number.isFinite(left) && Number.isFinite(right) && left === right;
}

/** Where the text is found in a value, as its type says (the table of the card, rules 3 and 4). */
function foundInLeaf(value: Leaf, looking: Looking): readonly [number, number] | undefined {
  const { whole } = looking;
  if (value.whole && whole !== undefined) {
    return isSameValue(value.text, whole) ? [0, value.text.length] : undefined;
  }
  const tooShort = whole !== undefined && whole.length < shortestIdPart && whole.toLowerCase() !== value.text;
  if (value.idLike && tooShort) {
    return undefined;
  }
  return found(value.anyCase ? looking.anyCase : looking.pattern, value.text);
}

function add(into: Found, match: () => SearchMatch): void {
  into.count += 1;
  if (into.kept.length < keptMatches) {
    into.kept.push(match());
  }
}

function isSubdocument(value: Json): value is JsonObject {
  return isJsonObject(value) && wrapperType(value) === undefined;
}

function joined(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}

interface Walk {
  readonly looking: Looking;
  readonly fieldNames: boolean;
  readonly into: Found;
}

function visitFields(document: JsonObject, path: string, walk: Walk): void {
  for (const [name, item] of Object.entries(document)) {
    const at = joined(path, name);
    const inName = walk.fieldNames ? found(walk.looking.pattern, name) : undefined;
    if (inName !== undefined) {
      add(walk.into, () => matchOf(at, 'field-name', name, inName));
    }
    visit(item, at, walk);
  }
}

function visit(value: Json, path: string, walk: Walk): void {
  if (Array.isArray(value)) {
    (value as readonly Json[]).forEach((item, index) => {
      visit(item, joined(path, String(index)), walk);
    });
    return;
  }
  if (isSubdocument(value)) {
    visitFields(value, path, walk);
    return;
  }
  const leaf = leafOf(value);
  const where = leaf === undefined ? undefined : foundInLeaf(leaf, walk.looking);
  if (leaf !== undefined && where !== undefined) {
    add(walk.into, () => matchOf(path, leaf.kind, leaf.text, where));
  }
}

/**
 * Feature: search.match — the matches of a document, with its `_id`; `undefined` when it has none. A `wanted` that is
 * an error finds nothing.
 */
export function matches(document: JsonObject, wanted: Wanted, fieldNames: boolean): SearchResult | undefined {
  if (wanted.kind !== 'wanted') {
    return undefined;
  }
  const into: Found = { kept: [], count: 0 };
  visitFields(document, '', { looking: wanted, fieldNames, into });
  if (into.count === 0) {
    return undefined;
  }
  const id = document['_id'] ?? null;
  return { id, idText: formattedValue(id, 'one-line'), matches: into.kept, more: into.count - into.kept.length };
}
