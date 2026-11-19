/**
 * Feature: schema.analyze
 *
 * From documents, given as canonical Extended JSON with their BSON types, to what the Schema section shows: for each
 * field, in the order in which the names first appear, how many documents have it, its types, their values or ranges,
 * the lengths and elements of its arrays, and its nested fields.
 *
 * The analysis is pure and runs anywhere. On a sample of 10,000 documents it runs on a worker thread of the main
 * process (architecture, "Processes and threads"), which uses {@link startAnalysis}: it adds the documents in batches
 * of {@link analysisBatch}, checks between two batches whether it was cancelled, and takes the summary at the end.
 * {@link schemaSummary} is the same in one call.
 */
import type { Json } from '../../shared/engine-request';
import { byCount, typeDetails } from './analysis/details';
import { FieldTally, type TypeTally } from './analysis/tally';
import { boundValue, ranges, type HistogramType } from './histogram';
import {
  isJsonDocument,
  valueTypes,
  wrapperKey,
  type FieldSummary,
  type SchemaSummary,
  type TypeSummary,
} from './types';

/** How the analysis is asked for. */
export interface AnalyzeOptions {
  /** Adds the details of each type, for `transfer.generate`. */
  readonly details?: boolean;
}

/** An analysis in progress: documents are added in batches, and the summary is taken of what was added. */
export interface SchemaAnalysis {
  /** Adds documents; a value that is not a document is skipped and not counted. */
  readonly add: (documents: readonly Json[]) => void;
  /** The summary of the documents added so far. */
  readonly summary: () => SchemaSummary;
}

/** The documents a worker adds at once, between two checks for cancellation (Datardo's choice). */
export const analysisBatch = 500;

/** The most frequent values given for a type without ranges. */
export const mostFrequent = 10;

/** With at most this many distinct values, a number or a date has its values rather than ranges. */
export const fewDistinct = 10;

const histogramTypes: ReadonlySet<string> = new Set(['int', 'long', 'double', 'decimal', 'date']);

function tenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function arraySummary(tally: TypeTally, path: string, label: string, details: boolean): TypeSummary {
  const { lengths } = tally;
  let [smallest, largest, sum] = [Number.POSITIVE_INFINITY, 0, 0];
  for (const length of lengths) {
    smallest = Math.min(smallest, length);
    largest = Math.max(largest, length);
    sum += length;
  }
  const summary: TypeSummary = {
    type: tally.type,
    count: tally.count,
    lengths: { smallest, largest, average: tenths(sum / lengths.length) },
  };
  const elements = tally.elements;
  return elements === undefined || elements.count === 0
    ? summary
    : {
        ...summary,
        elements: fieldSummary(elements, { name: '[]', path, label: `${label}[]`, of: tally.count }, details),
      };
}

/** The ranges, or the most frequent values, of a type whose values are counted. */
function valuesSummary(tally: TypeTally): Pick<TypeSummary, 'ranges' | 'values'> {
  const few = !tally.more && tally.values.size <= fewDistinct;
  const spread =
    tally.smallest !== undefined && tally.largest !== undefined && tally.smallest.number < tally.largest.number;
  if (histogramTypes.has(tally.type) && !few && spread && tally.numbers.length > 0) {
    const type = tally.type as HistogramType;
    const found = ranges(tally.numbers, type);
    if (found.length > 0) {
      return {
        ranges: found.map((range) => ({
          from: boundValue(range.from, type),
          to: boundValue(range.to, type),
          count: range.count,
        })),
      };
    }
  }
  return { values: byCount(tally.values.values()).slice(0, mostFrequent) };
}

function typeSummary(tally: TypeTally, path: string, label: string, details: boolean): TypeSummary {
  const withDetails = (summary: TypeSummary): TypeSummary =>
    details ? { ...summary, details: typeDetails(tally) } : summary;
  if (tally.type === 'array') {
    return withDetails(arraySummary(tally, path, label, details));
  }
  if (!valueTypes.has(tally.type)) {
    return withDetails({ type: tally.type, count: tally.count });
  }
  const { smallest, largest } = tally;
  return withDetails({
    type: tally.type,
    count: tally.count,
    distinct: tally.values.size,
    ...(tally.more ? { more: true } : {}),
    ...(smallest === undefined || largest === undefined ? {} : { smallest: smallest.value, largest: largest.value }),
    ...valuesSummary(tally),
  });
}

/** Where a field is: its name, path and label, and what its presence is counted of. */
interface FieldPlace {
  readonly name: string;
  readonly path: string;
  readonly label: string;
  readonly of: number;
}

function childrenOf(tally: FieldTally, path: string, label: string, details: boolean): readonly FieldSummary[] {
  return [...tally.fields].map(([name, field]) =>
    fieldSummary(
      field,
      {
        name,
        path: path === '' ? name : `${path}.${name}`,
        label: label === '' ? name : `${label}.${name}`,
        of: tally.objects,
      },
      details,
    ),
  );
}

function fieldSummary(tally: FieldTally, place: FieldPlace, details: boolean): FieldSummary {
  const types = [...tally.types.values()]
    .sort((a, b) => b.count - a.count)
    .map((type) => typeSummary(type, place.path, place.label, details));
  return {
    ...place,
    count: tally.count,
    types,
    ...(tally.fields.size > 0 ? { fields: childrenOf(tally, place.path, place.label, details) } : {}),
    ...(tally.moreFields ? { moreFields: true } : {}),
  };
}

/** Starts an analysis, to which documents are added in batches. */
export function startAnalysis(options: AnalyzeOptions = {}): SchemaAnalysis {
  const root = new FieldTally();
  const details = options.details === true;
  return {
    add: (documents) => {
      for (const document of documents) {
        if (isJsonDocument(document) && wrapperKey(document) === undefined) {
          root.addObject(document);
        }
      }
    },
    summary: () => ({
      analyzed: root.objects,
      fields: childrenOf(root, '', '', details),
      ...(root.moreFields ? { moreFields: true } : {}),
    }),
  };
}

/** Feature: schema.analyze — the summary of a sample of documents. */
export function schemaSummary(documents: readonly Json[], options: AnalyzeOptions = {}): SchemaSummary {
  const analysis = startAnalysis(options);
  analysis.add(documents);
  return analysis.summary();
}
