/**
 * The cells of a row of the Schema section (`schema.show`): the types of a field and what is shown of each type's
 * values: a histogram, the most frequent values, *all distinct, e.g.*, the lengths and elements of arrays, the fields
 * of objects. Each control that filters carries the click `schema.filter-from-value` is started with.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../aggregate/mongosh/format';
import type { SchemaClick } from '../filter-from-value';
import { share } from '../share';
import { text } from '../text';
import { isJsonDocument, numberTypes, type BsonType, type FieldSummary, type TypeSummary } from '../types';

/** A control of the table that adds a condition to the filter. */
export interface FilterControl {
  readonly element: 'schema.filter-from-value@table';
  readonly path: string;
  readonly click: SchemaClick;
}

/** A type of a field: its part of the bar (with several types), its name and share, and its explanation. */
export interface TypeChip {
  readonly type: BsonType;
  /** `double 50%` with several types; the name alone with one. */
  readonly label: string;
  /** The part of the values of the field that have it, from 0 to 1. */
  readonly part: number;
  readonly hint: string;
  readonly filter: FilterControl;
}

/** The types of a field: the bar divided by type when there are several, and the names. */
export interface TypesCell {
  readonly bar: boolean;
  readonly chips: readonly TypeChip[];
}

/** One bar of a histogram, the tallest at full height. */
export interface HistogramBar {
  readonly height: number;
  readonly count: number;
  readonly hint: string;
  /** An empty range cannot be clicked. */
  readonly filter?: FilterControl;
}

/** A value shown, with its share of the values of its type unless all are distinct. */
export interface ValueChip {
  readonly text: string;
  readonly share?: string;
  readonly hint?: string;
  readonly filter: FilterControl;
}

/** What is shown of the values of one type. */
export type ValuesContent =
  | {
      readonly kind: 'histogram';
      readonly bars: readonly HistogramBar[];
      readonly smallest: string;
      readonly largest: string;
    }
  | { readonly kind: 'values'; readonly values: readonly ValueChip[]; readonly more?: string }
  | { readonly kind: 'all-distinct'; readonly label: string; readonly values: readonly ValueChip[] }
  | { readonly kind: 'array'; readonly lengths: string; readonly elements?: ElementsCell }
  | { readonly kind: 'object'; readonly fields: string };

/** The values of one type, under its name when the field shows several. */
export interface TypeValues {
  readonly type?: BsonType;
  readonly content: ValuesContent;
}

/** The elements of an array: their types and values, as for a field. */
export interface ElementsCell {
  readonly types: TypesCell;
  readonly values: readonly TypeValues[];
}

/** A date as the Schema section writes it: the day at midnight UTC, else with the time. */
export function dateText(milliseconds: number): string {
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return String(milliseconds);
  }
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z')
    ? iso.slice(0, 10)
    : iso
        .replace('T', ' ')
        .replace(/:00\.000Z$|\.000Z$/u, '')
        .replace(/Z$/u, '');
}

/** A value as the Schema section writes it: numbers as numbers, dates short, any other value in mongosh syntax. */
export function valueText(value: Json, type: BsonType): string {
  const inner = isJsonDocument(value) ? Object.values(value)[0] : undefined;
  if (numberTypes.has(type) && typeof inner === 'string') {
    return type === 'double' ? String(Number(inner)) : inner;
  }
  if (type === 'date' && isJsonDocument(inner)) {
    return dateText(Number(inner['$numberLong']));
  }
  return formattedValue(value, { kind: 'one-line' });
}

function filterOf(path: string, click: SchemaClick): FilterControl {
  return { element: 'schema.filter-from-value@table', path, click };
}

/** The types of a field. */
export function typesCell(field: FieldSummary): TypesCell {
  const several = field.types.length > 1;
  return {
    bar: several,
    chips: field.types.map((type) => ({
      type: type.type,
      label: several ? `${type.type} ${share(type.count, field.count)}` : type.type,
      part: field.count === 0 ? 0 : type.count / field.count,
      hint: text.typeHint(field.path, type.type),
      filter: filterOf(field.path, { kind: 'type', type: type.type }),
    })),
  };
}

function histogram(field: FieldSummary, type: TypeSummary): ValuesContent {
  const ranges = type.ranges ?? [];
  const tallest = Math.max(1, ...ranges.map((range) => range.count));
  const bars = ranges.map((range): HistogramBar => {
    const bar = {
      height: range.count / tallest,
      count: range.count,
      hint: text.rangeHint(valueText(range.from, type.type), valueText(range.to, type.type), range.count),
    };
    return range.count === 0
      ? bar
      : { ...bar, filter: filterOf(field.path, { kind: 'range', from: range.from, to: range.to }) };
  });
  const bound = (value: Json | undefined): string => (value === undefined ? '' : valueText(value, type.type));
  return { kind: 'histogram', bars, smallest: bound(type.smallest), largest: bound(type.largest) };
}

function frequentValues(field: FieldSummary, type: TypeSummary): ValuesContent {
  const values = type.values ?? [];
  const distinct = type.distinct ?? values.length;
  const chip = (value: Json): Pick<ValueChip, 'text' | 'filter'> => ({
    text: valueText(value, type.type),
    filter: filterOf(field.path, { kind: 'value', value }),
  });
  if (type.more !== true && distinct === type.count && type.count > 1) {
    return {
      kind: 'all-distinct',
      label: text.allDistinct,
      values: values.slice(0, 3).map((each) => chip(each.value)),
    };
  }
  const shown = values.map((each) => ({
    ...chip(each.value),
    share: share(each.count, type.count),
    hint: text.valueHint(formattedValue(each.value, { kind: 'one-line' }), each.count, type.count),
  }));
  const more = distinct - shown.length;
  return more > 0 || type.more === true
    ? { kind: 'values', values: shown, more: text.more(Math.max(more, 0), type.more === true) }
    : { kind: 'values', values: shown };
}

function contentOf(field: FieldSummary, type: TypeSummary): ValuesContent | undefined {
  if (type.ranges !== undefined) {
    return histogram(field, type);
  }
  if (type.values !== undefined) {
    return frequentValues(field, type);
  }
  if (type.lengths !== undefined) {
    const { smallest, largest, average } = type.lengths;
    const lengths = text.lengths(smallest, largest, average);
    return type.elements === undefined
      ? { kind: 'array', lengths }
      : { kind: 'array', lengths, elements: elementsCell(type.elements) };
  }
  const fields = field.fields?.length ?? 0;
  return type.type === 'object' && fields > 0 ? { kind: 'object', fields: text.objectFields(fields) } : undefined;
}

/** What is shown of the values of each type of a field that has something to show. */
export function valuesCell(field: FieldSummary): readonly TypeValues[] {
  const shown = field.types.flatMap((type) => {
    const content = contentOf(field, type);
    return content === undefined ? [] : [{ type: type.type, content }];
  });
  return shown.length > 1 ? shown : shown.map(({ content }) => ({ content }));
}

function elementsCell(elements: FieldSummary): ElementsCell {
  return { types: typesCell(elements), values: valuesCell(elements) };
}
