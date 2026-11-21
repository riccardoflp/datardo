/**
 * The CodeMirror view behind a mongosh editor: made when the component is drawn first and destroyed with it, kept in
 * step with the props (the text given from outside, the options, the fields, the requests for the focus), and the
 * list of suggestions to draw, measured under the cursor.
 */
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { view as listView, type AutocompleteView } from '../../../features/query/autocomplete';
import type { FieldHint } from '../../../features/query/field-hints';
import type { TextKind } from '../../../features/query/suggestions';
import { listOf, setSource, suggestionList } from './completion-state';
import {
  baseExtensions,
  fromOutside,
  optionExtensions,
  type EditorCallbacks,
  type EditorOptions,
} from './editor-extensions';
import styles from './editor.module.css';
import type { ListAnchor } from './suggestion-list';

/** What the view is made from and kept in step with: the props of the editor. */
export interface EditorInputs {
  readonly label: string;
  readonly placeholder: string;
  readonly text: string;
  readonly kind: TextKind;
  readonly fields: readonly FieldHint[];
  readonly multiline: boolean;
  readonly maxHeight?: number;
  readonly invalid: boolean;
  readonly readOnly?: boolean;
  readonly focusRequest?: number;
  readonly onChange: (text: string) => void;
  readonly onRun: () => void;
  readonly onNeedFields?: () => void;
}

/** The list of suggestions as it is drawn: its View and where. */
export interface ShownList {
  readonly shown: AutocompleteView;
  readonly anchor: ListAnchor;
}

/** The options are swapped in this compartment when the props change. */
const optionsSlot = new Compartment();

/** Reads the list and where it goes: under the start of what it completes. Only in a measure phase. */
function measuredList(view: EditorView): ShownList | undefined {
  const list = listOf(view.state);
  const shown = listView(list);
  if (shown === undefined) {
    return undefined;
  }
  const coords = view.coordsAtPos(list.suggestions?.from ?? view.state.selection.main.head);
  return coords === null ? undefined : { shown, anchor: { left: coords.left, top: coords.top, bottom: coords.bottom } };
}

/** The view, the callbacks it calls (always with the latest props), and the list to draw. */
function useViewParts(inputs: EditorInputs) {
  const latestRef = useRef(inputs);
  useLayoutEffect(() => {
    latestRef.current = inputs;
  });
  const viewRef = useRef<EditorView | undefined>(undefined);
  const askedRef = useRef(false);
  const [list, setList] = useState<ShownList | undefined>(undefined);
  const callbacks = useCallback(
    (): EditorCallbacks => ({
      onChange: (text) => {
        latestRef.current.onChange(text);
      },
      onRun: () => {
        latestRef.current.onRun();
      },
      onFocus: () => {
        if (!askedRef.current) {
          askedRef.current = true;
          latestRef.current.onNeedFields?.();
        }
      },
      onList: (editor) => {
        editor.requestMeasure({ key: setList, read: measuredList, write: setList });
      },
    }),
    [],
  );
  return { latestRef, viewRef, callbacks, list };
}

/** The class of the placeholder's text. */
const placeholderClass = styles.placeholder ?? '';

function optionsOf(inputs: EditorInputs): EditorOptions {
  return {
    label: inputs.label,
    placeholder: inputs.placeholder,
    multiline: inputs.multiline,
    maxHeight: inputs.maxHeight,
    invalid: inputs.invalid,
    readOnly: inputs.readOnly === true,
    placeholderClass,
  };
}

/** The text an editor of one line shows: its line breaks are spaces. */
function shownText(text: string, multiline: boolean): string {
  return multiline ? text : text.replace(/\r\n|\r|\n/g, ' ');
}

/** Replaces the text when it changes from outside (reset, drop, builder), the cursor at its end. */
function useOutsideText(viewRef: React.RefObject<EditorView | undefined>, text: string, multiline: boolean): void {
  useEffect(() => {
    const editor = viewRef.current;
    const wanted = shownText(text, multiline);
    if (editor === undefined || editor.state.doc.toString() === wanted) {
      return;
    }
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: wanted },
      selection: { anchor: editor.state.toText(wanted).length },
      annotations: fromOutside.of(true),
    });
  }, [viewRef, text, multiline]);
}

/** Focuses the editor with its text selected each time `focusRequest` changes to a number above 0 (`Ctrl+F`). */
function useFocusRequest(viewRef: React.RefObject<EditorView | undefined>, focusRequest: number | undefined): void {
  const [first] = useState(focusRequest);
  useEffect(() => {
    const editor = viewRef.current;
    if (editor === undefined || focusRequest === undefined || focusRequest <= 0 || focusRequest === first) {
      return;
    }
    editor.focus();
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
  }, [viewRef, focusRequest, first]);
}

/**
 * Makes the CodeMirror view of a mongosh editor inside `parentRef` and keeps it in step with the props; gives the list of
 * suggestions to draw and the view, for a click on a suggestion.
 */
export function useMongoshEditor(
  parentRef: React.RefObject<HTMLDivElement | null>,
  inputs: EditorInputs,
  listId: string,
): { readonly viewRef: React.RefObject<EditorView | undefined>; readonly list: ShownList | undefined } {
  const { latestRef, viewRef, callbacks, list } = useViewParts(inputs);
  useLayoutEffect(() => {
    const host = parentRef.current;
    if (host === null) {
      return undefined;
    }
    const first = latestRef.current;
    const state = EditorState.create({
      doc: shownText(first.text, first.multiline),
      extensions: [
        baseExtensions(listId, callbacks),
        optionsSlot.of(optionExtensions(optionsOf(first), callbacks)),
        suggestionList({ kind: first.kind, fields: first.fields }),
      ],
    });
    const editor = new EditorView({ state, parent: host });
    viewRef.current = editor;
    return () => {
      viewRef.current = undefined;
      editor.destroy();
    };
  }, [parentRef, latestRef, viewRef, callbacks, listId]);
  const { label, placeholder, multiline, maxHeight, invalid, kind, fields, text, focusRequest } = inputs;
  const readOnly = inputs.readOnly === true;
  useEffect(() => {
    const options = { label, placeholder, multiline, maxHeight, invalid, readOnly, placeholderClass };
    viewRef.current?.dispatch({ effects: optionsSlot.reconfigure(optionExtensions(options, callbacks)) });
  }, [viewRef, callbacks, label, placeholder, multiline, maxHeight, invalid, readOnly]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setSource.of({ kind, fields }) });
  }, [viewRef, kind, fields]);
  useOutsideText(viewRef, text, multiline);
  useFocusRequest(viewRef, focusRequest);
  return { viewRef, list };
}
