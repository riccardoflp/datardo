/**
 * Feature: table.format-table
 *
 * Which color each row and each cell of the page takes from the formatting rules: the first rule that gives one wins,
 * a cell's color over its row's. A condition rule gives its color to the documents its condition matches
 * (`table.match`); a field rule gives the color of the field's value (`table.format-field`).
 */
import type { Json } from '../../shared/engine-request';
import { isFieldRule, type FormatRule, type FormatRuleId, type PresetColor } from '../../shared/formatting-rules';
import { idOfTime, parsedValue } from '../query/parse';
import { isSubdocument } from '../query/mongosh/ejson';
import { colorOfValue, fieldOnPage, type FormatPaint } from './format-field';
import { matcherOfFilter, type Matcher } from './match';
import { mostElements, valueAt, type Cell } from './rows';
import { text } from './text';
import type { Document } from './types';

/** How a row or a cell is drawn: the preset's formatting token mixed into the surface of the table. */
export interface DrawnColor {
  /** The rule that gave the color, for the tooltip. */
  readonly rule: FormatRuleId;
  readonly color: PresetColor;
  /** The share of the token in the surface, in percent. */
  readonly percent: number;
  /** A scale between two presets: the share of the second mixed into the first, in percent, before the surface. */
  readonly toward?: { readonly color: PresetColor; readonly percent: number };
  /** A pinned value among the shades of its own color. */
  readonly outlined?: boolean;
}

/** The colors of one document: of its row, of its cells by column key, and of the cells of an expanded array's elements. */
export interface DocumentFormat {
  readonly row?: DrawnColor;
  readonly cells: ReadonlyMap<string, DrawnColor>;
  /** By column key, by the element's index; `undefined` for an element no rule colors. */
  readonly elements: ReadonlyMap<string, readonly (DrawnColor | undefined)[]>;
}

/** Why a rule colors nothing. */
export interface RuleProblem {
  readonly rule: FormatRuleId;
  readonly message: string;
}

/** The colors of a page, by document in the page's order, and the rules that cannot be used. */
export interface TableFormat {
  readonly documents: readonly DocumentFormat[];
  readonly problems: readonly RuleProblem[];
}

/** The shares of a color in the surface, in percent: a row is fainter than a cell, so that a cell reads on a row. */
export const formatShares = {
  row: { plain: 12, faintest: 4, strongest: 22 },
  cell: { plain: 28, faintest: 6, strongest: 45 },
} as const;

/** The share of a paint in the surface of a row or a cell, in percent. */
export function percentOf(paint: FormatPaint, target: 'row' | 'cell'): number {
  const { plain, faintest, strongest } = formatShares[target];
  if (paint.strength === undefined) {
    return plain;
  }
  return Math.round(faintest + (strongest - faintest) * Math.min(1, Math.max(0, paint.strength)));
}

/**
 * The condition of a rule made into a predicate, or why it cannot be: empty, not mongosh syntax (`query.parse`, with
 * `now` as the time of `ISODate()` and of `ObjectId()`), or refused by `table.match`.
 */
export function conditionOf(condition: string, now: number): Matcher {
  if (condition.trim() === '') {
    return { ok: false, message: text.match.empty };
  }
  const parsed = parsedValue(condition, now, () => idOfTime(now));
  return parsed.ok ? matcherOfFilter(parsed.value) : { ok: false, message: text.match.syntax(parsed.error.message) };
}

/** What a rule gives a document, or the document with an array replaced by one of its elements. */
type Painter = (document: Document) => FormatPaint | undefined;

/** A rule that can color, with what it gives. */
interface Usable {
  readonly rule: FormatRuleId;
  readonly paint: Painter;
}

function painterOf(rule: FormatRule, documents: readonly Document[], now: number): Painter | string {
  if (isFieldRule(rule)) {
    const page = fieldOnPage(rule, documents);
    const path = rule.field.split('.');
    return (document) => colorOfValue(rule, page, valueAt(document, path));
  }
  const matcher = conditionOf(rule.condition, now);
  const color = rule.color;
  return matcher.ok ? (document) => (matcher.matches(document) ? { color } : undefined) : matcher.message;
}

function fieldOf(rule: FormatRule): string | undefined {
  if (isFieldRule(rule)) {
    return rule.target === 'cell' ? rule.field : undefined;
  }
  return rule.field;
}

/** A copy of a document whose array at `path` is replaced by its element at `index`. */
export function withElement(document: Document, path: readonly string[], index: number): Document {
  const [segment, ...rest] = path;
  if (segment === undefined || !Object.hasOwn(document, segment)) {
    return document;
  }
  const inner = document[segment] ?? null;
  if (rest.length === 0) {
    return { ...document, [segment]: Array.isArray(inner) ? ((inner as readonly Json[])[index] ?? null) : inner };
  }
  return isSubdocument(inner) ? { ...document, [segment]: withElement(inner, rest, index) } : document;
}

function firstColor(rules: readonly Usable[], document: Document, target: 'row' | 'cell'): DrawnColor | undefined {
  for (const { rule, paint } of rules) {
    const painted = paint(document);
    if (painted !== undefined) {
      const { color, toward, outlined } = painted;
      return {
        rule,
        color,
        percent: percentOf(painted, target),
        ...(toward === undefined ? {} : { toward: { color: toward.color, percent: Math.round(toward.share * 100) } }),
        ...(outlined === true ? { outlined } : {}),
      };
    }
  }
  return undefined;
}

/** The path of the first array on the way to a field in a document, the field itself included, if there is one. */
function arrayOnTheWay(document: Document, path: readonly string[]): readonly string[] | undefined {
  for (let length = 1; length <= path.length; length += 1) {
    const prefix = path.slice(0, length);
    const value = valueAt(document, prefix);
    if (Array.isArray(value)) {
      return prefix;
    }
    if (!isSubdocument(value)) {
      return undefined;
    }
  }
  return undefined;
}

function elementColors(
  rules: readonly Usable[],
  document: Document,
  array: readonly string[],
): (DrawnColor | undefined)[] {
  const elements = valueAt(document, array) as readonly Json[];
  return elements
    .slice(0, mostElements)
    .map((_element, index) => firstColor(rules, withElement(document, array, index), 'cell'));
}

function documentFormat(
  rows: readonly Usable[],
  cells: ReadonlyMap<string, readonly Usable[]>,
  document: Document,
): DocumentFormat {
  const row = firstColor(rows, document, 'row');
  const cellColors = new Map<string, DrawnColor>();
  const elements = new Map<string, readonly (DrawnColor | undefined)[]>();
  for (const [field, rules] of cells) {
    const array = arrayOnTheWay(document, field.split('.'));
    const own = firstColor(rules, document, 'cell');
    if (own !== undefined) {
      cellColors.set(field, own);
    }
    if (array !== undefined) {
      elements.set(field, elementColors(rules, document, array));
    }
  }
  return { ...(row === undefined ? {} : { row }), cells: cellColors, elements };
}

/**
 * Feature: table.format-table
 *
 * The colors of a page from the rules that reach the collection, in the order they are tried: for each document the
 * color of its row and of its cells, each with the rule that gave it, and why each rule that cannot be used colors
 * nothing. Hidden, nothing is colored. `now` is the time of `ISODate()` in a condition: the time the page was read.
 */
export function tableFormat(
  rules: readonly FormatRule[],
  documents: readonly Document[],
  hidden: boolean,
  now: number,
): TableFormat {
  const problems: RuleProblem[] = [];
  const rows: Usable[] = [];
  const cells = new Map<string, Usable[]>();
  for (const rule of rules) {
    const paint = painterOf(rule, documents, now);
    if (typeof paint === 'string') {
      problems.push({ rule: rule.id, message: paint });
    } else if (rule.enabled !== false) {
      const field = fieldOf(rule);
      const usable: Usable = { rule: rule.id, paint };
      if (field === undefined) {
        rows.push(usable);
      } else {
        cells.set(field, [...(cells.get(field) ?? []), usable]);
      }
    }
  }
  const noColor: DocumentFormat = { cells: new Map(), elements: new Map() };
  const colored = documents.map((document) => (hidden ? noColor : documentFormat(rows, cells, document)));
  return { documents: colored, problems };
}

/**
 * The color of a cell of `table.rows` itself, over its row's: an element's by its index, none for the cell of the
 * elements left out and for a cell that fills a group.
 */
export function colorOfCell(format: DocumentFormat, cell: Cell): DrawnColor | undefined {
  if (cell.content.kind === 'more' || cell.content.kind === 'filler') {
    return undefined;
  }
  return cell.element === undefined
    ? format.cells.get(cell.column)
    : format.elements.get(cell.column)?.[cell.element.index];
}
