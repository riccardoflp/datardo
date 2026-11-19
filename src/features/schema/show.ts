/**
 * Feature: schema.show
 *
 * The Schema section of a collection tab: the line of the analysis and **Sample** in its toolbar, then the fields of
 * the sample in a table, one row per field, with the nested fields under the field they belong to. `view` says what
 * the section shows from its state; `plan` is what Go to starts: the active collection tab shows its Schema section.
 * The fields that are expanded and the size of the sample are kept with the tab, so `view` gives each control the
 * list of expanded fields it leads to.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { activeTabOf } from '../../shared/state/tabs';
import { groupThousands } from '../../shared/text-units';
import { sampleSizes, type SampleResult } from './sample';
import { share } from './share';
import { text } from './text';
import { nestedFields, type FieldSummary, type SchemaSummary } from './types';
import { typesCell, valuesCell, type TypesCell, type TypeValues } from './view/cells';

export type { FilterControl, TypeValues, TypesCell, ValuesContent } from './view/cells';

/** The section's tab name, as `tab.activate` takes it. */
export const schemaSection = 'schema';

/** What the section is drawn from: what the tab keeps, and the last analysis. */
export interface SchemaSectionState {
  /** The size chosen in **Sample**. */
  readonly size: number;
  /** The labels of the fields whose nested fields are shown. */
  readonly expanded: readonly string[];
  /** Whether a sample is read now. */
  readonly running: boolean;
  readonly result?: SampleResult;
  /** The message of the server's error of the last analysis. */
  readonly error?: string;
  /** Whether the filter of the query bar is not valid: it is marked, and the previous table stays. */
  readonly invalidFilter: boolean;
  /** Whether the last analysis was cancelled. */
  readonly cancelled: boolean;
  /** Whether the tab is of a view, which has no validation rules. */
  readonly view: boolean;
}

/** One row of the table. */
export interface SchemaRow {
  /** How many fields it is nested in. */
  readonly depth: number;
  /** The name shown: the field's own name, or the label for a field of the documents. */
  readonly name: string;
  /** The whole path, shown on hover: `items[].sku`. */
  readonly label: string;
  /** Present when it has nested fields: whether they are shown, and the expanded fields a click leads to. */
  readonly toggle?: { readonly expanded: boolean; readonly next: readonly string[] };
  /** *(500+ fields)* after the name. */
  readonly moreFields?: string;
  readonly present: { readonly part: number; readonly share: string; readonly hint: string };
  readonly types: TypesCell;
  readonly values: readonly TypeValues[];
}

/** What the Schema section shows. */
export interface SchemaSectionView {
  readonly toolbar: {
    readonly line: string;
    readonly sample: {
      readonly label: string;
      readonly hint: string;
      readonly sizes: readonly { readonly size: number; readonly label: string; readonly chosen: boolean }[];
      readonly element: 'schema.sample@toolbar';
    };
    /** Not on a view. Its card names no place in this toolbar, so it carries no element. */
    readonly validationRules?: { readonly label: string };
    readonly generate: {
      readonly label: string;
      readonly enabled: boolean;
      readonly element: 'transfer.generate@toolbar';
    };
    readonly expandAll: { readonly label: string; readonly next: readonly string[] };
    readonly collapseAll: { readonly label: string; readonly next: readonly string[] };
  };
  /** The button of the query bar while the section is shown. */
  readonly queryBarButton: { readonly label: string; readonly element: 'schema.sample@query-bar' };
  readonly invalidFilter: boolean;
  /** The text shown in place of the table, or above the table that stays. */
  readonly message?: string;
  readonly cancelled?: { readonly text: string; readonly runAgain: string; readonly element: 'schema.sample@toolbar' };
  readonly columns: readonly string[];
  readonly rows: readonly SchemaRow[];
  /** Whether the rows are those of the previous analysis while a sample is read. */
  readonly dimmed: boolean;
  readonly note?: string;
}

/** The line of an analysis: *Random sample of 1,000 out of 52,310 documents · 84 ms* or *All 4 documents · 12 ms*. */
export function analysisLine(result: SampleResult): string {
  const { analyzed } = result.summary;
  const what = result.outOf > analyzed ? text.line.sample(analyzed, result.outOf) : text.line.all(analyzed);
  return `${what} · ${text.line.time(result.milliseconds)}`;
}

/** The labels of every field that has nested fields, at every level. */
export function expandableLabels(fields: readonly FieldSummary[]): readonly string[] {
  return fields.flatMap((field) => {
    const nested = nestedFields(field);
    return nested.length === 0 ? [] : [field.label, ...expandableLabels(nested)];
  });
}

function presentOf(field: FieldSummary): SchemaRow['present'] {
  return {
    part: field.of === 0 ? 0 : field.count / field.of,
    share: share(field.count, field.of),
    hint: field.count < field.of ? text.present.some(field.count, field.of) : text.present.all(field.of),
  };
}

function shownName(field: FieldSummary, parent: string | undefined): string {
  return parent === undefined
    ? field.label
    : field.label.slice(parent.length).replace(/^\[\]/u, '').replace(/^\./u, '');
}

function rowsOf(
  fields: readonly FieldSummary[],
  expanded: readonly string[],
  depth: number,
  parent?: string,
): SchemaRow[] {
  return fields.flatMap((field) => {
    const nested = nestedFields(field);
    const open = expanded.includes(field.label);
    const next = open ? expanded.filter((label) => label !== field.label) : [...expanded, field.label];
    const row: SchemaRow = {
      depth,
      name: shownName(field, parent),
      label: field.label,
      ...(nested.length === 0 ? {} : { toggle: { expanded: open, next } }),
      ...(field.moreFields === true ? { moreFields: text.moreFields } : {}),
      present: presentOf(field),
      types: typesCell(field),
      values: valuesCell(field),
    };
    return open ? [row, ...rowsOf(nested, expanded, depth + 1, field.label)] : [row];
  });
}

function messageOf(state: SchemaSectionState, summary: SchemaSummary | undefined): string | undefined {
  if (state.invalidFilter) {
    return text.refusals.invalidFilter;
  }
  if (state.error !== undefined) {
    return state.error;
  }
  return summary !== undefined && summary.analyzed === 0 && !state.running ? text.states.noDocuments : undefined;
}

function lineOf(state: SchemaSectionState): string {
  if (state.running) {
    return text.analyzing;
  }
  return state.result === undefined ? '' : analysisLine(state.result);
}

/** Feature: schema.show — what the Schema section shows. */
export function view(state: SchemaSectionState): SchemaSectionView {
  const summary = state.result?.summary;
  const message = messageOf(state, summary);
  const tableReplaced = state.error !== undefined && !state.invalidFilter;
  const fields = tableReplaced || summary === undefined ? [] : summary.fields;
  return {
    toolbar: {
      line: lineOf(state),
      sample: {
        ...text.sample,
        sizes: sampleSizes.map((size) => ({ size, label: groupThousands(size), chosen: size === state.size })),
        element: 'schema.sample@toolbar',
      },
      ...(state.view ? {} : { validationRules: { label: text.validationRules } }),
      generate: {
        label: text.generate,
        enabled: summary !== undefined && summary.analyzed > 0,
        element: 'transfer.generate@toolbar',
      },
      expandAll: { label: text.expandAll, next: expandableLabels(summary?.fields ?? []) },
      collapseAll: { label: text.collapseAll, next: [] },
    },
    queryBarButton: { label: text.analyze, element: 'schema.sample@query-bar' },
    invalidFilter: state.invalidFilter,
    ...(message === undefined ? {} : { message }),
    ...(state.cancelled && !state.running
      ? { cancelled: { text: text.states.cancelled, runAgain: text.states.runAgain, element: 'schema.sample@toolbar' } }
      : {}),
    columns: [text.columns.field, text.columns.present, text.columns.types, text.columns.values],
    rows: rowsOf(fields, state.expanded, 0),
    dimmed: state.running,
    ...(summary?.moreFields === true && !tableReplaced ? { note: text.tooManyFields } : {}),
  };
}

/** Feature: schema.show — Go to's **Schema**: the active collection tab shows its Schema section. */
export function plan(context: Context, _answers: Answers): Outcome {
  const tab = activeTabOf(context.state.tabs);
  const empty = { danger: noDanger, undo: { cannot: text.nothingRecorded }, publishes: false, after: [] };
  if (tab?.shows.kind !== 'collection') {
    return run({ title: text.section, steps: [], ...empty });
  }
  const { collection } = tab.shows;
  return run({
    title: text.show.plan(collection),
    steps: [
      {
        kind: 'app',
        text: text.show.step(collection),
        action: 'tab.activate',
        args: { tab: tab.id, section: schemaSection },
      },
    ],
    ...empty,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('schema.show'), plan };
