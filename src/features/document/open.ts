/**
 * Feature: document.open
 *
 * The document tab: one document in Datardo's editor, in mongosh syntax indented by two spaces (`query.format`), to read
 * it with all the room of the main island and change it as a whole. Its toolbar has **Save** (`document.save`), which
 * reads **Insert** on a new document (`document.insert-from-tab`), **Revert**, **History** and **Copy as**. The state
 * of the connection is read as it is now: a connection made read-only makes its open document tabs read-only at once.
 */
import type { Json } from '../../shared/engine-request';
import { emptyDocumentText } from './insert-template';
import { text } from './text';
import { namespaceText, type DocumentPlace } from './types';
import { documentText, oneLineText } from './write/values';

/** The longest title of a document tab, in characters. */
export const longestTabTitle = 60;

/** What the tab has of its document: being read, read, gone, failed, or a new document that is not read. */
export type DocumentLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly document: Json }
  | { readonly kind: 'gone' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'new' };

/** The state of a document tab. */
export interface DocumentTabState {
  /** The collection, with its connection as it is now. */
  readonly place: DocumentPlace;
  /** The `_id`, as canonical Extended JSON; absent for a new document. */
  readonly id?: Json;
  /** `n` of **New document n**, for a new document. */
  readonly number?: number;
  readonly load: DocumentLoad;
  /** The text of the editor. */
  readonly text: string;
  /** The text as it was loaded, or as the new document's tab opened. */
  readonly loadedText: string;
  /** Whether the undo history is off for the connection (`undo.note`). */
  readonly undoOff: boolean;
}

/** A control of the tab: its text, the feature it starts and the identifier of its place, and whether it can be used. */
export interface TabControl {
  readonly label: string;
  readonly enabled: boolean;
  readonly feature?: string;
  readonly element?: string;
  readonly tooltip?: string;
  readonly key?: string;
}

/** What the tab shows in place of the editor, or the editor. */
export type DocumentTabBody =
  | { readonly kind: 'loading'; readonly text: string }
  | { readonly kind: 'gone'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string; readonly retry: string }
  | { readonly kind: 'editor'; readonly text: string; readonly editable: boolean };

/** What the document tab shows. */
export interface DocumentTabView {
  readonly title: string;
  /** Whether the text differs from what was loaded: a `●` before the title, and closing asks first. */
  readonly unsaved: boolean;
  /** The path of the scope bar: connection, database, collection, `_id`. */
  readonly path: readonly string[];
  readonly save: TabControl;
  /** **Revert**, with the question it asks when there are unsaved changes. */
  readonly revert: TabControl & { readonly confirm?: { readonly text: string; readonly button: string } };
  readonly history: TabControl;
  readonly copyAs: TabControl;
  /** The **Read-only** mark, with its reason as its tooltip. */
  readonly readOnly?: { readonly label: string; readonly tooltip: string };
  /** The line of `undo.note` beside **Save**, when the undo history is off. */
  readonly undoLine?: string;
  readonly body: DocumentTabBody;
}

/** The text of a document as the tab shows it: mongosh syntax, indented by two spaces. */
export function documentTabText(document: Json): string {
  return documentText(document);
}

/** The text a new document's tab opens with: the insert dialog's, or the empty document. */
export function newDocumentText(initial?: string): string {
  return initial === undefined || initial.trim() === '' ? emptyDocumentText : initial;
}

/** The title of a document tab: the `_id` in mongosh syntax cut at 60 characters, or **New document n**. */
export function tabTitle(id: Json | undefined, number: number): string {
  if (id === undefined) {
    return text.open.newDocument(number);
  }
  const characters = Array.from(oneLineText(id));
  return characters.length <= longestTabTitle
    ? characters.join('')
    : `${characters.slice(0, longestTabTitle - 1).join('')}…`;
}

function readOnlyReason(place: DocumentPlace): string | undefined {
  if (place.readOnly) {
    return text.refusals.readOnly(place.connectionName);
  }
  return place.view ? text.refusals.view : undefined;
}

function bodyOf(state: DocumentTabState, editable: boolean): DocumentTabBody {
  switch (state.load.kind) {
    case 'loading':
      return { kind: 'loading', text: text.open.loading };
    case 'gone':
      return { kind: 'gone', text: text.open.gone(namespaceText(state.place)) };
    case 'error':
      return { kind: 'error', text: state.load.message, retry: text.open.retry };
    case 'loaded':
    case 'new':
      return { kind: 'editor', text: state.text, editable };
  }
}

function saveControl(state: DocumentTabState, writable: boolean, unsaved: boolean): TabControl {
  if (state.id === undefined) {
    const insert = { feature: 'document.insert-from-tab', element: 'document.insert-from-tab@toolbar' };
    return { label: text.open.insert, enabled: writable, ...insert, key: 'Ctrl+S' };
  }
  const enabled = writable && unsaved && state.load.kind === 'loaded';
  return { label: text.open.save, enabled, feature: 'document.save', element: 'document.save@toolbar', key: 'Ctrl+S' };
}

function historyControl(state: DocumentTabState): TabControl {
  const control = { label: text.open.history, feature: 'history.show', element: 'history.show@toolbar' };
  if (state.id === undefined) {
    return { ...control, enabled: false, tooltip: text.open.noHistory };
  }
  return { ...control, enabled: !state.place.view };
}

/** Feature: document.open — what the document tab shows, in its state. */
export function view(state: DocumentTabState): DocumentTabView {
  const reason = readOnlyReason(state.place);
  const writable = reason === undefined;
  const unsaved = state.text !== state.loadedText;
  const shownId = state.id === undefined ? text.open.newDocument(state.number ?? 1) : oneLineText(state.id);
  const revertable = writable && state.id !== undefined && state.load.kind === 'loaded';
  return {
    title: tabTitle(state.id, state.number ?? 1),
    unsaved,
    path: [state.place.connectionName, state.place.database, state.place.collection, shownId],
    save: saveControl(state, writable, unsaved),
    revert: {
      label: text.open.revert,
      enabled: revertable,
      ...(unsaved ? { confirm: { text: text.open.discard(shownId), button: text.open.discardButton } } : {}),
    },
    history: historyControl(state),
    copyAs: { label: text.open.copyAs, enabled: state.load.kind === 'loaded', feature: 'table.copy-as' },
    ...(reason === undefined ? {} : { readOnly: { label: text.open.readOnlyMark, tooltip: reason } }),
    ...(state.undoOff && writable ? { undoLine: text.undo.off } : {}),
    body: bodyOf(state, writable),
  };
}
