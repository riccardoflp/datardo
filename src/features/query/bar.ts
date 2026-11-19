/**
 * Feature: query.bar
 *
 * The row of the Documents section where a query is typed and run: the mode switch, **Filter**, **Sort**, **Project**,
 * **Skip**, **Limit**, **Builder**, **Queries**, **Reset** and the run button; under it the builder when open, then the
 * error line.
 */
import { text } from './text';
import type { ErrorLine, QueryField, QueryMode, QueryState } from './types';

/** How high **Filter** grows with its text before it scrolls, in px. */
export const filterMostHeight = 240;

/** A field of the bar. */
export interface BarField {
  readonly field: QueryField;
  /** The name a screen reader says, and the label. */
  readonly label: string;
  readonly placeholder: string;
  readonly text: string;
  /** Outlined as invalid: the query was run with it at fault, and it was not edited since. */
  readonly invalid: boolean;
  /** **Filter** is an editor of several lines; the others stay one line. */
  readonly multiline: boolean;
  /** **Skip** and **Limit** take digits only; the others are Datardo's editor, with colors and suggestions. */
  readonly digitsOnly: boolean;
  /** `Enter` runs the query here; in **Filter** it adds a line. */
  readonly enterRuns: boolean;
}

/** A button of the bar. */
export interface BarButton {
  readonly label: string;
  /** The name a screen reader says. */
  readonly name: string;
  readonly tip?: string;
  readonly element: string;
  readonly pressed?: boolean;
}

/** An entry of the mode menu. */
export interface ModeEntry {
  readonly mode: QueryMode;
  readonly label: string;
  readonly tip: string;
  readonly ticked: boolean;
}

/** What the bar shows. */
export interface BarView {
  readonly mode: {
    readonly label: string;
    readonly name: string;
    readonly element: string;
    readonly entries: readonly ModeEntry[];
  };
  /** The five fields, in the order of `Tab`; none in Aggregate, where the pipeline editor takes their place. */
  readonly fields: readonly BarField[];
  /** **Builder**, **Queries**, **Reset** and the run button in Find; **Queries** alone in Aggregate. */
  readonly buttons: readonly BarButton[];
  readonly builderOpen: boolean;
  /** The pipeline editor of the aggregate area is shown in place of the fields. */
  readonly pipeline: boolean;
  readonly errorLine?: ErrorLine;
}

/** What the bar is drawn from: the tab's query, and whether a query of the tab is running. */
export interface BarState {
  readonly query: QueryState;
  readonly running: boolean;
}

const placeholders: Readonly<Record<QueryField, string>> = {
  filter: text.bar.filterPlaceholder,
  sort: text.bar.sortPlaceholder,
  project: text.bar.projectPlaceholder,
  skip: text.bar.skipPlaceholder,
  limit: text.bar.limitPlaceholder,
};

const labels: Readonly<Record<QueryField, string>> = {
  filter: text.bar.filter,
  sort: text.bar.sort,
  project: text.bar.project,
  skip: text.bar.skip,
  limit: text.bar.limit,
};

function fieldOf(query: QueryState, field: QueryField): BarField {
  return {
    field,
    label: labels[field],
    placeholder: placeholders[field],
    text: query.texts[field],
    invalid: query.invalid.includes(field),
    multiline: field === 'filter',
    digitsOnly: field === 'skip' || field === 'limit',
    enterRuns: field !== 'filter',
  };
}

function runButton(running: boolean): BarButton {
  return running
    ? { label: text.bar.cancel, name: text.bar.cancel, element: 'runner.cancel@list' }
    : { label: text.bar.run, name: text.bar.runName, tip: text.bar.runTip, element: 'query.run@query-bar' };
}

/** **Queries**, which opens the recent and saved queries of the collection (the saved-query area's). */
const queriesButton: BarButton = {
  label: text.bar.queries,
  name: text.bar.queries,
  element: 'saved-query.show@query-bar',
};

/**
 * Feature: query.bar
 *
 * The bar of a collection tab: in Find the mode switch, the five fields with their texts and outlines, **Builder**,
 * **Queries**, **Reset** and the run button, which reads **Cancel** while a query runs; in Aggregate the mode switch
 * and **Queries**, the pipeline editor taking the fields' place. The error line shows the last message.
 */
export function view(state: BarState): BarView {
  const { query } = state;
  const find = query.mode === 'find';
  const builder: BarButton = {
    label: text.bar.builder,
    name: text.bar.builder,
    tip: text.bar.builderTip,
    element: 'query.builder@query-bar',
    pressed: query.builderOpen,
  };
  const reset: BarButton = {
    label: text.bar.reset,
    name: text.bar.reset,
    tip: text.bar.resetTip,
    element: 'query.reset@query-bar',
  };
  return {
    mode: {
      label: find ? text.bar.find : text.bar.aggregate,
      name: text.bar.mode,
      element: 'query.mode@query-bar',
      entries: [
        { mode: 'find', label: text.bar.find, tip: text.bar.findTip, ticked: find },
        { mode: 'aggregate', label: text.bar.aggregate, tip: text.bar.aggregateTip, ticked: !find },
      ],
    },
    fields: find ? (['filter', 'sort', 'project', 'skip', 'limit'] as const).map((field) => fieldOf(query, field)) : [],
    buttons: find ? [builder, queriesButton, reset, runButton(state.running)] : [queriesButton],
    builderOpen: find && query.builderOpen,
    pipeline: !find,
    ...(query.error === undefined ? {} : { errorLine: query.error }),
  };
}

/** The state after a field is edited: its new text, and its outline gone. */
export function edited(query: QueryState, field: QueryField, written: string): QueryState {
  return {
    ...query,
    texts: { ...query.texts, [field]: written },
    invalid: query.invalid.filter((each) => each !== field),
  };
}

/** What `Enter` does in a field: run the query, or add a line in **Filter**; the list of suggestions takes it when open. */
export function enterIn(field: QueryField, suggestionsOpen: boolean): 'insert-suggestion' | 'run' | 'new-line' {
  if (suggestionsOpen) {
    return 'insert-suggestion';
  }
  return field === 'filter' ? 'new-line' : 'run';
}

/** What a field keeps of a text typed or pasted: **Skip** and **Limit** keep its digits only. */
export function typedIn(field: QueryField, written: string): string {
  return field === 'skip' || field === 'limit' ? written.replace(/\D/g, '') : written;
}
