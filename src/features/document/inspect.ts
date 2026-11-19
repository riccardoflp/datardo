/**
 * Feature: document.inspect
 *
 * The document of the selected row in the inspector island, as a tree and as mongosh text, with what can be done with
 * it: the header `orders · 65f1…a2c`, the buttons, the document (open down to three levels), **Go from here** and
 * **History**. In **Aggregate** it has the document and **Copy as** only; on a read-only connection or a view nothing
 * can be edited, duplicated or deleted from it.
 */
import type { Json } from '../../shared/engine-request';
import { text } from './text';
import { isRecord, type JsonRecord } from './types';
import { documentText, isDocumentValue, oneLineText } from './write/values';

/** The deepest level of the tree that is open unless the user opens more: three levels, from 0. */
export const openLevels = 3;

/** What is selected in the table. `row` counts from 0 in the page, `page` from 1. */
export type InspectSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'several'; readonly count: number }
  | {
      readonly kind: 'one';
      readonly document: JsonRecord;
      readonly page: number;
      readonly pageSize: number;
      readonly row: number;
      /** Whether the row is the first, or the last, of the page of results. */
      readonly first: boolean;
      readonly last: boolean;
    };

/** How the tree is folded: as it opens (three levels), all open, or all folded; `toggled` flips single lines. */
export type Folding = 'levels' | 'all-open' | 'all-folded';

/** The state the inspector is drawn from. */
export interface InspectState {
  readonly selection: InspectSelection;
  readonly collection: string;
  /** Whether the table shows the result of a query or of a pipeline. */
  readonly source: 'find' | 'aggregate';
  readonly readOnly: boolean;
  readonly view: boolean;
  readonly mode: 'tree' | 'text';
  readonly folding: Folding;
  /** The field paths whose line was opened or folded by hand. */
  readonly toggled: readonly string[];
  /** Whether the document has references to follow (`relation.follow`). */
  readonly references: boolean;
}

/** A control of the inspector: its text, the feature it starts and the identifier of its place. */
export interface InspectControl {
  readonly label: string;
  readonly enabled: boolean;
  readonly feature?: string;
  readonly element?: string;
  readonly tooltip?: string;
  /** **Open in a tab** opens the document read-only on a read-only connection or a view. */
  readonly readOnly?: boolean;
}

/** One line of the tree: a field or an element, its value on one line, or what it holds when it is folded. */
export interface TreeLine {
  /** The field path, `items.2.qty`. */
  readonly path: string;
  readonly depth: number;
  /** The name of the field, or the position of the element. */
  readonly name: string;
  readonly value: string;
  /** For a sub-document or an array: whether it is open. */
  readonly open?: boolean;
  /** Whether a double click or `F2` edits the value there (`document.inline-edit`). */
  readonly editable: boolean;
}

/** The controls every line of the tree carries. */
export const lineControls = {
  edit: { feature: 'document.inline-edit', element: 'document.inline-edit@inspector' },
  copyValue: { label: text.copy.value, feature: 'document.copy-value', element: 'document.copy-value@inspector' },
  copyPath: { label: text.copy.path, feature: 'document.copy-path', element: 'document.copy-path@inspector' },
} as const;

/** What the inspector shows. */
export type InspectView =
  | { readonly kind: 'nothing'; readonly text: string }
  | { readonly kind: 'several'; readonly text: string }
  | {
      readonly kind: 'document';
      readonly header: string;
      readonly tooltip: string;
      readonly buttons: readonly InspectControl[];
      /** The entries of the `…` menu. */
      readonly menu: readonly InspectControl[];
      readonly mode: 'tree' | 'text';
      readonly lines: readonly TreeLine[];
      readonly text: string;
      readonly goFromHere?: InspectControl;
      readonly history?: InspectControl;
    };

/** The `_id` of the header: an `ObjectId` by its hexadecimal digits cut in the middle, `65f1…a2c`. */
export function headerId(id: Json): string {
  const hex = isRecord(id) ? id['$oid'] : undefined;
  if (typeof hex === 'string') {
    return `${hex.slice(0, 4)}…${hex.slice(-3)}`;
  }
  const whole = Array.from(oneLineText(id));
  return whole.length <= 24 ? whole.join('') : `${whole.slice(0, 12).join('')}…${whole.slice(-8).join('')}`;
}

function isOpen(state: InspectState, path: string, depth: number): boolean {
  const byFolding = state.folding === 'all-open' || (state.folding === 'levels' && depth < openLevels);
  return state.toggled.includes(path) ? !byFolding : byFolding;
}

function entriesOf(value: Json): readonly (readonly [string, Json])[] | undefined {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map((item, index) => [String(index), item] as const);
  }
  return isDocumentValue(value) ? Object.entries(value) : undefined;
}

interface Walk {
  readonly state: InspectState;
  readonly editable: boolean;
  readonly lines: TreeLine[];
}

function walk(walked: Walk, value: Json, parent: string, depth: number): void {
  for (const [name, item] of entriesOf(value) ?? []) {
    const path = parent === '' ? name : `${parent}.${name}`;
    const editable = walked.editable && path !== '_id' && !path.startsWith('_id.');
    const children = entriesOf(item);
    if (children === undefined) {
      walked.lines.push({ path, depth, name, value: oneLineText(item), editable });
      continue;
    }
    const open = isOpen(walked.state, path, depth);
    const summary = Array.isArray(item) ? text.inspect.items(children.length) : text.inspect.fields(children.length);
    walked.lines.push({ path, depth, name, value: summary, open, editable });
    if (open) {
      walk(walked, item, path, depth + 1);
    }
  }
}

/** The lines of the tree of a document, open as the state says. */
export function treeLines(state: InspectState, document: JsonRecord, editable: boolean): readonly TreeLine[] {
  const lines: TreeLine[] = [];
  walk({ state, editable, lines }, document, '', 0);
  return lines;
}

function buttons(
  state: InspectState,
  selection: Extract<InspectSelection, { kind: 'one' }>,
  hasId: boolean,
): InspectControl[] {
  const copyAs = {
    label: text.inspect.copyAs,
    enabled: true,
    feature: 'table.copy-as',
    element: 'table.copy-as@inspector',
  };
  if (state.source === 'aggregate') {
    return [copyAs];
  }
  const noId = hasId ? {} : { tooltip: text.inspect.noId };
  return [
    { label: text.inspect.previous, enabled: !selection.first },
    { label: text.inspect.next, enabled: !selection.last },
    { label: text.inspect.expandAll, enabled: true },
    { label: text.inspect.collapseAll, enabled: true },
    copyAs,
    {
      label: text.inspect.openInTab,
      enabled: hasId,
      feature: 'document.open',
      element: 'document.open@inspector',
      ...noId,
      ...(state.readOnly || state.view ? { readOnly: true } : {}),
    },
  ];
}

function menu(state: InspectState, hasId: boolean): InspectControl[] {
  if (state.source === 'aggregate' || state.readOnly || state.view) {
    return [];
  }
  const duplicate = {
    label: text.inspect.duplicate,
    enabled: hasId,
    feature: 'document.duplicate',
    element: 'document.duplicate@inspector',
    tooltip: hasId ? text.duplicate.tooltip : text.inspect.noId,
  };
  const remove = {
    label: text.inspect.delete,
    enabled: hasId,
    feature: 'document.delete',
    element: 'document.delete@inspector',
  };
  return [duplicate, hasId ? remove : { ...remove, tooltip: text.inspect.noId }];
}

function history(state: InspectState, hasId: boolean): { readonly history?: InspectControl } {
  if (state.source === 'aggregate' || state.view) {
    return {};
  }
  const control = {
    label: text.inspect.history,
    enabled: hasId,
    feature: 'history.show',
    element: 'history.show@inspector',
  };
  return { history: hasId ? control : { ...control, tooltip: text.inspect.noId } };
}

/** Feature: document.inspect — what the inspector shows for the selection of the table. */
export function view(state: InspectState): InspectView {
  const selection = state.selection;
  if (selection.kind === 'none') {
    return { kind: 'nothing', text: text.inspect.nothing };
  }
  if (selection.kind === 'several') {
    return { kind: 'several', text: text.inspect.several(selection.count) };
  }
  const document = selection.document;
  const id = document['_id'];
  const hasId = id !== undefined;
  const shownId = id === undefined ? '' : oneLineText(id);
  const position = (selection.page - 1) * selection.pageSize + selection.row + 1;
  const editable = state.source === 'find' && !state.readOnly && !state.view && hasId;
  const goFromHere = {
    label: text.inspect.goFromHere,
    enabled: true,
    feature: 'relation.follow',
    element: 'relation.follow@inspector',
  };
  return {
    kind: 'document',
    header: id === undefined ? state.collection : `${state.collection} · ${headerId(id)}`,
    tooltip: text.inspect.tooltip(position, shownId),
    buttons: buttons(state, selection, hasId),
    menu: menu(state, hasId),
    mode: state.mode,
    lines: treeLines(state, document, editable),
    text: documentText(document),
    ...(state.source === 'find' && state.references ? { goFromHere } : {}),
    ...history(state, hasId),
  };
}
