/**
 * What makes a CodeMirror view a mongosh editor of Datardo: the history (`Ctrl+Z`), the keys of the list of
 * suggestions and of running, the colors of `query.highlight`, one line or several, the accessible name and state,
 * and the calls back to the component that holds it.
 */
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import {
  Annotation,
  EditorState,
  Prec,
  Transaction,
  type AnnotationType,
  type ChangeSpec,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView, keymap, placeholder, type Command, type KeyBinding } from '@codemirror/view';
import { view as listView } from '../../../features/query/autocomplete';
import { closeList, listField, listOf, openList, pressListKey } from './completion-state';
import { syntaxColors } from './syntax-colors';

/** Marks the transaction that puts a text given from outside (reset, drop, builder): it does not call `onChange`. */
export const fromOutside = Annotation.define<boolean>();

/** What the editor tells the component that holds it; read when called, so the latest ones are used. */
export interface EditorCallbacks {
  readonly onChange: (text: string) => void;
  readonly onRun: () => void;
  readonly onFocus: () => void;
  /** The list of suggestions changed, or moved with the cursor. */
  readonly onList: (view: EditorView) => void;
}

/** What can change while the editor lives. */
export interface EditorOptions {
  readonly label: string;
  readonly placeholder: string;
  readonly multiline: boolean;
  readonly maxHeight: number | undefined;
  readonly invalid: boolean;
  /** The text can be read and selected, not typed in (a document tab on a read-only connection). */
  readonly readOnly?: boolean;
  /** The class of the placeholder's text. */
  readonly placeholderClass: string;
}

/** An annotation of a transaction, to give again to the one that replaces it. */
function kept<T>(tr: Transaction, type: AnnotationType<T>): readonly Annotation<T>[] {
  const value = tr.annotation(type);
  return value === undefined ? [] : [type.of(value)];
}

/** The transaction as a spec, with its newlines made spaces: same lengths, so the positions stay right. */
function onOneLine(tr: Transaction): TransactionSpec {
  const changes: ChangeSpec[] = [];
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    changes.push({ from: fromA, to: toA, insert: tr.newDoc.sliceString(fromB, toB, ' ') });
  });
  const annotations = [
    ...kept(tr, Transaction.userEvent),
    ...kept(tr, Transaction.addToHistory),
    ...kept(tr, fromOutside),
  ];
  return {
    changes,
    ...(tr.selection === undefined ? {} : { selection: tr.selection }),
    effects: tr.effects,
    annotations,
    scrollIntoView: tr.scrollIntoView,
  };
}

/** An editor of one line: a pasted or typed line break becomes a space. */
const oneLine = EditorState.transactionFilter.of((tr) =>
  !tr.docChanged || tr.newDoc.lines === 1 ? tr : onOneLine(tr),
);

function runKeys(callbacks: () => EditorCallbacks, multiline: boolean): readonly KeyBinding[] {
  const run: Command = (view) => {
    closeList(view);
    callbacks().onRun();
    return true;
  };
  const enter: Command = (view) => (multiline ? false : run(view));
  return [
    { key: 'Mod-Enter', run },
    { key: 'Ctrl-Enter', run },
    { key: 'Enter', run: enter },
  ];
}

/** The keys of the list come first, so that `Enter` and `Tab` insert a suggestion while it is open. */
const listKeys: readonly KeyBinding[] = [
  { key: 'Ctrl-Space', run: openList },
  { key: 'ArrowDown', run: pressListKey('ArrowDown') },
  { key: 'ArrowUp', run: pressListKey('ArrowUp') },
  { key: 'PageDown', run: pressListKey('PageDown') },
  { key: 'PageUp', run: pressListKey('PageUp') },
  { key: 'Enter', run: pressListKey('Enter') },
  { key: 'Tab', run: pressListKey('Tab') },
  { key: 'Escape', run: pressListKey('Escape') },
  { key: 'ArrowLeft', run: pressListKey('ArrowLeft') },
  { key: 'ArrowRight', run: pressListKey('ArrowRight') },
  { key: 'Home', run: pressListKey('Home') },
  { key: 'End', run: pressListKey('End') },
];

/** The extensions that follow the options: rebuilt in their compartment when one changes. */
export function optionExtensions(options: EditorOptions, callbacks: () => EditorCallbacks): Extension {
  const shown = document.createElement('span');
  shown.className = options.placeholderClass;
  shown.textContent = options.placeholder;
  return [
    Prec.highest(keymap.of([...listKeys, ...runKeys(callbacks, options.multiline)])),
    placeholder(shown),
    EditorView.contentAttributes.of({
      'aria-label': options.label,
      // Already reached with `Tab`; said outright, so that the scroller of a long line is seen as reachable (R10.5).
      tabindex: '0',
      'aria-multiline': options.multiline ? 'true' : 'false',
      ...(options.invalid ? { 'aria-invalid': 'true' } : {}),
    }),
    EditorView.editorAttributes.of(
      options.maxHeight === undefined ? {} : { style: `max-height: ${String(options.maxHeight)}px` },
    ),
    options.multiline ? EditorView.lineWrapping : oneLine,
    options.readOnly === true
      ? [EditorState.readOnly.of(true), EditorView.contentAttributes.of({ 'aria-readonly': 'true' })]
      : [],
  ];
}

/** The attributes that tell a screen reader about the list: which list the editor controls, and its active line. */
function listAttributes(listId: string): Extension {
  return EditorView.contentAttributes.compute([listField], (state) => {
    const shown = listView(listOf(state));
    if (shown === undefined) {
      return { 'aria-autocomplete': 'list' };
    }
    return {
      'aria-autocomplete': 'list',
      'aria-haspopup': 'listbox',
      'aria-controls': listId,
      ...(shown.active === undefined ? {} : { 'aria-activedescendant': `${listId}-${shown.active}` }),
    };
  });
}

function listeners(callbacks: () => EditorCallbacks): Extension {
  return [
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromOutside) === true)) {
        callbacks().onChange(update.state.doc.toString());
      }
      const list = listOf(update.state);
      const moved = update.docChanged || update.geometryChanged || update.viewportChanged || update.selectionSet;
      if (list !== listOf(update.startState) || (list.open && moved)) {
        callbacks().onList(update.view);
      }
    }),
    EditorView.domEventHandlers({
      focus: () => {
        callbacks().onFocus();
        return false;
      },
      blur: (_event, view) => {
        closeList(view);
        return false;
      },
      mousedown: (_event, view) => {
        closeList(view);
        return false;
      },
    }),
  ];
}

/** The look of the editor's insides, from the tokens; the frame, the focus and the colors are the component's style. */
const editorTheme = EditorView.theme({
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-family-code)', lineHeight: 'var(--line-height)', overflow: 'auto' },
  '&.cm-editor .cm-content': { caretColor: 'var(--color-text)', padding: 'var(--space-1) 0' },
  '.cm-content:focus-visible': { outline: 'none' },
  '.cm-line': { padding: '0 var(--space-2)' },
});

/** The extensions that stay for the life of the editor. */
export function baseExtensions(listId: string, callbacks: () => EditorCallbacks): Extension {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    syntaxColors,
    listAttributes(listId),
    listeners(callbacks),
    editorTheme,
  ];
}
