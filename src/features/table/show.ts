/**
 * Feature: table.show
 *
 * The Documents section of a collection tab: the toolbar, the query bar, the selection bar, the table and the paging
 * row; its states, from loading to an error; the count of the page on the status line.
 */
import { countWritten } from '../query/count';
import { view as columnsView } from './columns';
import { view as pagingView, type PagingState } from './paging';
import { text } from './text';
import { canWrite, type ColumnLayout, type ColumnNode, type TableTarget } from './types';

/** Where the read of the documents is. */
export type ShowPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'running' }
  | { readonly kind: 'shown' }
  /** The last read failed; `notConnected` when the connection is not connected. */
  | { readonly kind: 'failed'; readonly notConnected: boolean };

/** What the section is drawn from. */
export interface ShowState {
  readonly target: TableTarget;
  readonly phase: ShowPhase;
  /** Whether rows are shown, from this read or from the one before it. */
  readonly hasRows: boolean;
  /** Whether the query as run is empty: no filter in Find, no stage in Aggregate. */
  readonly emptyQuery: boolean;
  readonly columns: readonly ColumnNode[];
  readonly layout: ColumnLayout;
  readonly paging: PagingState;
  /** How long the server took for the documents, in ms. */
  readonly milliseconds?: number;
  /** How many rows are selected. */
  readonly selected: number;
}

/** A button of the toolbar. */
export interface ToolbarButton {
  readonly label: string;
  readonly element: string;
  readonly tip?: string;
}

/** A mark at the right end of the toolbar. */
export interface ToolbarMark {
  readonly label: string;
  readonly tip: string;
}

/** What is shown in place of the table, or the table. */
export type ShowBody =
  | { readonly kind: 'table'; readonly dimmed: boolean }
  | { readonly kind: 'message'; readonly text: string; readonly buttons: readonly ToolbarButton[] };

/** What the section shows. */
export interface ShowView {
  readonly toolbar: { readonly buttons: readonly ToolbarButton[]; readonly marks: readonly ToolbarMark[] };
  /** The pipeline editor of the aggregate area in place of the fields of the bar. */
  readonly pipeline: boolean;
  /** The selection bar, while more than one row is selected; its place is kept so that the table does not move. */
  readonly selectionBar: boolean;
  readonly body: ShowBody;
  readonly paging: boolean;
  /** `50 of 1,204 documents · 38 ms`, while the tab is active and documents are shown. */
  readonly statusLine?: string;
}

function toolbarButtons(state: ShowState): readonly ToolbarButton[] {
  const writes = canWrite(state.target);
  const columns = columnsView({ columns: state.columns, layout: state.layout, search: '' }).button;
  return [
    { label: text.show.refresh, element: 'table.refresh@toolbar' },
    columns,
    ...(writes
      ? [
          { label: text.show.insert, tip: text.show.insertTip, element: 'document.insert@toolbar' },
          { label: text.show.updateMany, element: 'document.update-many@toolbar' },
          { label: text.show.deleteMany, element: 'document.delete-many@toolbar' },
        ]
      : []),
    { label: text.show.export, tip: text.show.exportTip, element: 'transfer.export@toolbar' },
    { label: text.show.explain, element: 'explain.show@query-bar' },
    { label: text.show.code, element: 'codegen.show@query-bar' },
    ...(state.target.view ? [] : [{ label: text.show.watch, tip: text.show.watchTip, element: 'watch.show@toolbar' }]),
  ];
}

function marks(target: TableTarget): readonly ToolbarMark[] {
  return [
    ...(target.view ? [{ label: text.show.view, tip: text.show.viewTip }] : []),
    ...(target.timeSeries === true ? [{ label: text.show.timeSeries, tip: text.show.timeSeriesTip }] : []),
    ...(target.readOnly ? [{ label: text.show.readOnly, tip: text.show.readOnlyTip }] : []),
  ];
}

function emptyBody(state: ShowState): ShowBody {
  if (state.target.mode === 'aggregate') {
    return { kind: 'message', text: text.show.emptyOutput, buttons: [] };
  }
  if (state.emptyQuery) {
    const insert = canWrite(state.target)
      ? [{ label: text.show.insert, tip: text.show.insertTip, element: 'document.insert@empty-state' }]
      : [];
    return { kind: 'message', text: text.show.empty, buttons: insert };
  }
  return {
    kind: 'message',
    text: text.show.noMatch,
    buttons: [{ label: text.show.reset, element: 'query.reset@empty-state' }],
  };
}

function body(state: ShowState): ShowBody {
  const { phase } = state;
  if (phase.kind === 'loading' && !state.hasRows) {
    return { kind: 'message', text: text.show.loading, buttons: [] };
  }
  if (phase.kind === 'failed' && !state.hasRows) {
    const reconnect = phase.notConnected ? [{ label: text.show.reconnect, element: 'connection.connect@toolbar' }] : [];
    return {
      kind: 'message',
      text: text.show.failed,
      buttons: [{ label: text.show.runAgain, element: 'query.run@query-bar' }, ...reconnect],
    };
  }
  if (phase.kind === 'shown' && state.paging.received === 0) {
    return emptyBody(state);
  }
  return { kind: 'table', dimmed: phase.kind === 'running' || phase.kind === 'loading' };
}

/**
 * Feature: table.show
 *
 * The toolbar (**Refresh**, **Columns**, the buttons of other areas, those that write only on a collection that can
 * be changed, and the marks **view**, **time series**, **read-only**), the selection bar, the table or the message of
 * its state, the paging row, and the status line `50 of 1,204 documents · 38 ms`.
 */
export function view(state: ShowState): ShowView {
  const shown = body(state);
  const total = pagingView(state.paging).total.text;
  const status =
    shown.kind === 'table' && state.milliseconds !== undefined
      ? text.show.status(countWritten(state.paging.received), total, state.milliseconds)
      : undefined;
  return {
    toolbar: { buttons: toolbarButtons(state), marks: marks(state.target) },
    pipeline: state.target.mode === 'aggregate',
    selectionBar: state.selected > 1,
    body: shown,
    paging: shown.kind === 'table',
    ...(status === undefined ? {} : { statusLine: status }),
  };
}
