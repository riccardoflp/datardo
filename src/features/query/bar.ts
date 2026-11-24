/**
 * Feature: query.bar
 *
 * The part of a collection tab where a query is typed and run, with the buttons that act on that query: above the
 * table in rows, or in the query pane at its right one under the other (`query.position`).
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
  /** The Codicon before its name (D23); the mode switch has none. */
  readonly icon?: string;
  /** It shows its icon alone while the main island is narrower than 900 px (**Queries**). */
  readonly iconAloneWhenNarrow?: boolean;
}

/** An entry of the mode menu. */
export interface ModeEntry {
  readonly mode: QueryMode;
  readonly label: string;
  readonly tip: string;
  readonly ticked: boolean;
}

/** What the bar shows, each part in the order of `Tab` above the table. */
export interface BarView {
  readonly mode: {
    readonly label: string;
    readonly name: string;
    readonly element: string;
    readonly entries: readonly ModeEntry[];
  };
  /** The five fields; none in Aggregate, where the pipeline editor takes their place. */
  readonly fields: readonly BarField[];
  /** The run button, which reads **Cancel** while a query runs, and **Reset**; none in Aggregate. */
  readonly run: readonly BarButton[];
  /** The toggle of the query's place (`query.position`): its icon alone, its tooltip its name. */
  readonly toggle: BarButton;
  /** **Builder**, **Queries**, **Explain** and **Code** in Find; **Queries** alone in Aggregate. */
  readonly tools: readonly BarButton[];
  /** **Update many…** and **Delete many…**, apart: in Find, on a collection that can be changed. */
  readonly writes: readonly BarButton[];
  readonly builderOpen: boolean;
  /** The pipeline editor of the aggregate area is shown in place of the fields. */
  readonly pipeline: boolean;
  /** The bar is in the query pane at the right of the table: its controls one under the other. */
  readonly side: boolean;
  readonly errorLine?: ErrorLine;
}

/** Where the bar is drawn and what its toggle says (`query.position`). */
export interface BarPlace {
  readonly side: boolean;
  readonly pressed: boolean;
  readonly tip: string;
}

/** What the bar is drawn from: the tab's query, and whether a query of the tab is running. */
export interface BarState {
  readonly query: QueryState;
  readonly running: boolean;
  /** The section the bar is in: only the Documents section has **Explain**, **Code** and the writes. */
  readonly section?: 'documents' | 'schema' | 'chart';
  /** The collection can be changed: not a view, not through a read-only connection. */
  readonly writable?: boolean;
  /** Where the query is; above the table when not given. */
  readonly place?: BarPlace;
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

/** A button whose name is its text. */
function button(label: string, tip: string, element: string, icon: string): BarButton {
  return { label, name: label, tip, element, icon };
}

/** The run button: **Find**, or **Cancel** in the same place while a query runs. */
function runButton(running: boolean): BarButton {
  return running
    ? { label: text.bar.cancel, name: text.bar.cancel, element: 'runner.cancel@list', icon: 'debug-stop' }
    : { ...button(text.bar.run, text.bar.runTip, 'query.run@query-bar', 'play'), name: text.bar.runName };
}

/** **Queries**, which opens the recent and saved queries of the collection (the saved-query area's). */
const queriesButton: BarButton = {
  ...button(text.bar.queries, text.bar.queriesTip, 'saved-query.show@query-bar', 'history'),
  iconAloneWhenNarrow: true,
};

/** The query above the table, as chosen: the toggle not pressed. */
const above: BarPlace = { side: false, pressed: false, tip: text.position.toRight };

function toggleOf(place: BarPlace): BarButton {
  return {
    label: '',
    name: place.tip,
    tip: place.tip,
    element: 'query.position@query-bar',
    pressed: place.pressed,
    icon: 'layout-sidebar-right',
  };
}

function isDocuments(state: BarState): boolean {
  return (state.section ?? 'documents') === 'documents';
}

function toolsOf(state: BarState): readonly BarButton[] {
  const builder: BarButton = {
    ...button(text.bar.builder, text.bar.builderTip, 'query.builder@query-bar', 'list-filter'),
    pressed: state.query.builderOpen,
  };
  const explainAndCode = [
    button(text.bar.explain, text.bar.explainTip, 'explain.show@query-bar', 'telescope'),
    button(text.bar.code, text.bar.codeTip, 'codegen.show@query-bar', 'code'),
  ];
  return [builder, queriesButton, ...(isDocuments(state) ? explainAndCode : [])];
}

function writesOf(state: BarState): readonly BarButton[] {
  if (!isDocuments(state) || state.writable !== true) {
    return [];
  }
  return [
    button(text.bar.updateMany, text.bar.updateManyTip, 'document.update-many@query-bar', 'edit'),
    button(text.bar.deleteMany, text.bar.deleteManyTip, 'document.delete-many@query-bar', 'trash'),
  ];
}

/**
 * Feature: query.bar
 *
 * The bar of a collection tab. In Find: the mode switch, **Filter**, the run button (**Cancel** while a query runs)
 * and **Reset**, the toggle of the query's place; **Builder**, **Queries**, **Explain**, **Code**, and apart **Update
 * many…** and **Delete many…** on a collection that can be changed; the builder when open; **Sort**, **Project**,
 * **Skip**, **Limit**; the error line. In Aggregate the mode switch, **Queries** and the toggle, the pipeline editor
 * taking the place of the rest. The Schema and Chart sections have neither **Explain**, **Code** nor the writes.
 */
export function view(state: BarState): BarView {
  const { query } = state;
  const find = query.mode === 'find';
  const place = state.place ?? above;
  const reset = button(text.bar.reset, text.bar.resetTip, 'query.reset@query-bar', 'discard');
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
    run: find ? [runButton(state.running), reset] : [],
    toggle: toggleOf(place),
    tools: find ? toolsOf(state) : [queriesButton],
    writes: find ? writesOf(state) : [],
    builderOpen: find && query.builderOpen,
    pipeline: !find,
    side: place.side,
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
