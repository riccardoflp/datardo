/**
 * Feature: table.format-field
 *
 * Which color a value of the field gets from a field rule (green and red for booleans, a place on a scale for numbers
 * and dates, a color per value with the values pinned to a color and the palette of the others), and what the rule's
 * legend shows for a page.
 */
import type { Json } from '../../shared/engine-request';
import { presetColors, type FieldMode, type FieldRule, type PresetColor } from '../../shared/formatting-rules';
import { formattedValue } from '../query/format';
import { bsonType, dateMilliseconds, isSubdocument, numberOf } from '../query/mongosh/ejson';
import { text } from './text';
import type { Document } from './types';

/** What a rule gives a row or a cell. */
export interface FormatPaint {
  readonly color: PresetColor;
  /** How strong the color is, from 0 to 1; absent: the usual share of a row or a cell. */
  readonly strength?: number;
  /** A scale between two presets: `share` of the second, from 0 to 1, mixed into the first. */
  readonly toward?: { readonly color: PresetColor; readonly share: number };
  /** A pinned value among the shades of its own color. */
  readonly outlined?: boolean;
}

/** The colors of the palette `all`: the presets but gray, which reads as no color. */
export const valueColors: readonly PresetColor[] = presetColors.filter((color) => color !== 'gray');

/** The strengths of the five shades of one color, from the faintest. */
export const shades: readonly number[] = [0.1, 0.325, 0.55, 0.775, 1];

/** The values a legend lists at most *(as in Mongoster)*; the others are still colored. */
export const mostLegendEntries = 60;

/** The strength of a scale between two colors, and of true and false. */
const flatStrength = 0.6;

/** A field rule on a page: `auto` decided, and the ends of a scale, the rule's own or the page's. */
export interface FieldOnPage {
  readonly mode: FieldMode;
  readonly min?: number;
  readonly max?: number;
  /** The values of the scale are dates, and its ends their milliseconds. */
  readonly dates?: boolean;
}

const numberTypes: ReadonlySet<string> = new Set(['int', 'long', 'double', 'decimal']);

function numberValue(value: Json): number | undefined {
  const number = numberTypes.has(bsonType(value)) ? numberOf(value) : undefined;
  return number !== undefined && Number.isFinite(number) ? number : undefined;
}

function dateValue(value: Json): number | undefined {
  const milliseconds = bsonType(value) === 'date' ? Number(dateMilliseconds(value)) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

/** What a scale places: a number, or a date as its milliseconds. */
export function scalarOf(value: Json): number | undefined {
  return numberValue(value) ?? dateValue(value);
}

/**
 * The values of a field in a document: through sub-documents and through arrays, one value per element, as the table
 * shows them once the array is expanded; an array that is the field's value is one value; missing and `null` are left
 * out.
 */
export function valuesOfField(document: Json, field: string): readonly Json[] {
  const found: Json[] = [];
  const walk = (value: Json, path: readonly string[]): void => {
    const [segment, ...rest] = path;
    if (segment === undefined) {
      if (value !== null) {
        found.push(value);
      }
    } else if (Array.isArray(value)) {
      (value as readonly Json[]).forEach((element) => {
        walk(element, path);
      });
    } else if (isSubdocument(value) && Object.hasOwn(value, segment)) {
      walk(value[segment] ?? null, rest);
    }
  };
  walk(document, field.split('.'));
  return found;
}

/** The mode `auto` takes for values: all booleans `boolean`, all numbers or all dates `scale`, else `values`. */
export function autoMode(values: readonly Json[]): FieldMode {
  if (values.length === 0) {
    return 'values';
  }
  if (values.every((value) => typeof value === 'boolean')) {
    return 'boolean';
  }
  const scale =
    values.every((value) => numberValue(value) !== undefined) ||
    values.every((value) => dateValue(value) !== undefined);
  return scale ? 'scale' : 'values';
}

/** A field rule on a page of documents: its mode, and the ends of its scale it does not have taken from the page. */
export function fieldOnPage(rule: FieldRule, documents: readonly Document[]): FieldOnPage {
  const values = documents.flatMap((document) => valuesOfField(document, rule.field));
  const mode = rule.mode === 'auto' ? autoMode(values) : rule.mode;
  if (mode !== 'scale') {
    return { mode };
  }
  const scalars = values.map(scalarOf).filter((each): each is number => each !== undefined);
  const dates =
    values.some((each) => dateValue(each) !== undefined) && !values.some((each) => numberValue(each) !== undefined);
  const min = rule.min ?? (scalars.length > 0 ? Math.min(...scalars) : undefined);
  const max = rule.max ?? (scalars.length > 0 ? Math.max(...scalars) : undefined);
  return {
    mode,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(dates ? { dates } : {}),
  };
}

/** FNV-1a of 32 bits over the UTF-16 code units of a text: the same color for the same value everywhere. */
export function hashOfText(written: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < written.length; at += 1) {
    hash ^= written.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The colors the values that are not pinned take: the shades of the palette's color, or the ten less the pinned ones'. */
export function paletteOf(rule: FieldRule): readonly FormatPaint[] {
  const palette = rule.palette;
  if (palette !== undefined && palette !== 'all') {
    return shades.map((strength) => ({ color: palette, strength }));
  }
  const taken = new Set((rule.pinned ?? []).map((pin) => pin.color));
  const free = valueColors.filter((color) => !taken.has(color));
  return (free.length > 0 ? free : valueColors).map((color) => ({ color }));
}

/** The text a value is known by in a rule and shown with in its legend: its mongosh syntax on one line. */
export function valueText(value: Json): string {
  return formattedValue(value, 'one-line');
}

function paintOfText(rule: FieldRule, written: string, palette: readonly FormatPaint[]): FormatPaint {
  const pin = rule.pinned?.find((each) => each.value === written);
  if (pin !== undefined) {
    return { color: pin.color, strength: 1, ...(pin.color === rule.palette ? { outlined: true } : {}) };
  }
  return palette[hashOfText(written) % palette.length] ?? { color: 'red' };
}

/** A place on a scale between two colors through yellow, the first and the last without a second color. */
function twoColorPaint(from: PresetColor, to: PresetColor, place: number): FormatPaint {
  const [color, toward, share] =
    place < 0.5 ? [from, 'yellow' as const, place * 2] : ['yellow' as const, to, (place - 0.5) * 2];
  if (share <= 0 || share >= 1) {
    return { color: share >= 1 ? toward : color, strength: flatStrength };
  }
  return { color, toward: { color: toward, share }, strength: flatStrength };
}

function scalePaint(rule: FieldRule, page: FieldOnPage, value: Json): FormatPaint | undefined {
  const scalar = scalarOf(value);
  const { min, max } = page;
  if (scalar === undefined || min === undefined || max === undefined) {
    return undefined;
  }
  const place = max > min ? Math.min(1, Math.max(0, (scalar - min) / (max - min))) : 1;
  const to = rule.scale?.to ?? 'blue';
  const from = rule.scale?.from;
  return from === undefined ? { color: to, strength: place } : twoColorPaint(from, to, place);
}

/**
 * Feature: table.format-field
 *
 * The color a field rule gives a value on a page, or none: for a missing or `null` value, a value of another type than
 * the mode's, a scale without ends.
 */
export function colorOfValue(rule: FieldRule, page: FieldOnPage, value: Json | undefined): FormatPaint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  switch (page.mode) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        return undefined;
      }
      return { color: value ? (rule.scale?.to ?? 'green') : (rule.scale?.from ?? 'red'), strength: flatStrength };
    case 'scale':
      return scalePaint(rule, page, value);
    case 'values':
      return paintOfText(rule, valueText(value), paletteOf(rule));
  }
}

/** A value of a legend: its text, how many values of the page are it, its color, whether it is pinned. */
export interface LegendEntry {
  readonly text: string;
  readonly count: number;
  readonly paint: FormatPaint;
  readonly pinned: boolean;
}

/** What a field rule shows of itself for a page: its values with their colors, or the ends of its scale. */
export interface Legend extends FieldOnPage {
  /** The pinned values first, then the page's by how many there are: 60 at most; none for a scale. */
  readonly entries: readonly LegendEntry[];
  /** How many colors the values that are not pinned share. */
  readonly colors: number;
  /** Said when the page has more values that are not pinned than colors. */
  readonly repeats?: string;
}

function countsOf(rule: FieldRule, documents: readonly Document[], mode: FieldMode): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of documents.flatMap((document) => valuesOfField(document, rule.field))) {
    if (mode !== 'boolean' || typeof value === 'boolean') {
      const written = valueText(value);
      counts.set(written, (counts.get(written) ?? 0) + 1);
    }
  }
  return counts;
}

function valuesLegend(rule: FieldRule, page: FieldOnPage, counts: Map<string, number>): Legend {
  const palette = paletteOf(rule);
  const pins = rule.pinned ?? [];
  const entry = (written: string, pinned: boolean): LegendEntry => ({
    text: written,
    count: counts.get(written) ?? 0,
    paint: paintOfText(rule, written, palette),
    pinned,
  });
  const others = [...counts]
    .filter(([written]) => !pins.some((pin) => pin.value === written))
    .sort((first, second) => second[1] - first[1] || (first[0] < second[0] ? -1 : first[0] > second[0] ? 1 : 0))
    .map(([written]) => entry(written, false));
  const entries = [...pins.map((pin) => entry(pin.value, true)), ...others].slice(0, mostLegendEntries);
  const repeats = others.length > palette.length ? { repeats: text.legend.repeats(rule.field, others.length) } : {};
  return { ...page, entries, colors: palette.length, ...repeats };
}

/**
 * Feature: table.format-field
 *
 * The legend of a field rule for a page: for `values`, the pinned values first, then the page's by how many rows have
 * each; for `boolean`, `true` then `false`; for `scale`, its two ends and whether they are dates.
 */
export function legendOfRule(rule: FieldRule, documents: readonly Document[]): Legend {
  const page = fieldOnPage(rule, documents);
  if (page.mode === 'scale') {
    return { ...page, entries: [], colors: 0 };
  }
  const counts = countsOf(rule, documents, page.mode);
  if (page.mode === 'values') {
    return valuesLegend(rule, page, counts);
  }
  const entries = [true, false].map((value) => ({
    text: String(value),
    count: counts.get(String(value)) ?? 0,
    paint: colorOfValue(rule, page, value) ?? { color: value ? 'green' : 'red' },
    pinned: false,
  }));
  return { ...page, entries, colors: 2 };
}
