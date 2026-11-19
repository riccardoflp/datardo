/**
 * The CodeMirror view of a playground (`playground.show`): Datardo's mongosh editor with the parts of a playground,
 * made once for the tab with the text the main process keeps, then the editor's own; what is typed and selected goes
 * back through `onEdit`. It gives where the first line of each statement is drawn, for its **Run** button.
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextRange } from '../../../features/playground/types';
import { setSource, suggestionList } from '../../components/editor/completion-state';
import { baseExtensions, optionExtensions, type EditorCallbacks } from '../../components/editor/editor-extensions';
import { measuredList, type ShownList } from '../../components/editor/use-mongosh-editor';
import { text } from '../../../features/playground/text';
import { playgroundParts, playgroundSuggestions, setFailedLine, type HintsSource, type RunKeys } from './editor-parts';

/** What the editor of a playground is given. */
export interface PlaygroundEditorInputs {
  /** The text it starts with; afterwards the editor's own. */
  readonly text: string;
  readonly failedLine: number | undefined;
  /** The first lines of the statements, whose place `tops` gives. */
  readonly lines: readonly number[];
  readonly onEdit: (text: string, selection: TextRange | undefined) => void;
  readonly keys: RunKeys;
  readonly hints: HintsSource;
}

/** The selection of the editor, when something is selected. */
export function selectionOf(view: EditorView): TextRange | undefined {
  const { from, to } = view.state.selection.main;
  return from < to ? { from, to } : undefined;
}

/** Where each line is drawn, from the top of `column`, in px. */
function measuredTops(
  view: EditorView,
  lines: readonly number[],
  column: HTMLElement,
): Readonly<Record<number, number>> {
  const offset = view.documentTop - column.getBoundingClientRect().top;
  const tops: Record<number, number> = {};
  for (const line of lines) {
    if (line >= 1 && line <= view.state.doc.lines) {
      tops[line] = offset + view.lineBlockAt(view.state.doc.line(line).from).top;
    }
  }
  return tops;
}

function useLatest<Value>(value: Value): React.RefObject<Value> {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  return latest;
}

/** What the mongosh editor's own parts call: only the list; the playground's parts edit and run. */
function callbacksOf(setList: (list: ShownList | undefined) => void): EditorCallbacks {
  return {
    onChange: () => undefined,
    onRun: () => undefined,
    onFocus: () => undefined,
    onList: (editor) => {
      editor.requestMeasure({ key: setList, read: measuredList, write: setList });
    },
  };
}

function extensionsOf(
  listId: string,
  latest: React.RefObject<PlaygroundEditorInputs>,
  callbacks: EditorCallbacks,
  measure: (view: EditorView) => void,
): Extension {
  const source = { kind: 'filter' as const, fields: [], suggest: playgroundSuggestions(() => latest.current.hints) };
  return [
    playgroundParts(() => latest.current.keys),
    baseExtensions(listId, () => callbacks),
    optionExtensions(
      {
        label: text.show.editor,
        placeholder: '',
        multiline: true,
        maxHeight: undefined,
        invalid: false,
        placeholderClass: '',
      },
      () => callbacks,
    ),
    suggestionList(source),
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        latest.current.onEdit(update.state.doc.toString(), selectionOf(update.view));
      }
      if (update.docChanged || update.geometryChanged || update.viewportChanged) {
        measure(update.view);
      }
    }),
  ];
}

/** Makes the view in `hostRef` and keeps it in step; gives the view, the list to draw and the places of the lines. */
export function usePlaygroundEditor(
  refs: {
    readonly host: React.RefObject<HTMLDivElement | null>;
    readonly column: React.RefObject<HTMLDivElement | null>;
    /** Set to the view while it lives. */
    readonly view: React.RefObject<EditorView | undefined>;
  },
  inputs: PlaygroundEditorInputs,
  listId: string,
): {
  readonly list: ShownList | undefined;
  readonly tops: Readonly<Record<number, number>>;
  readonly refreshHints: () => void;
} {
  const latest = useLatest(inputs);
  const { host: hostRef, column: columnRef, view: viewRef } = refs;
  const [list, setList] = useState<ShownList | undefined>(undefined);
  const [tops, setTops] = useState<Readonly<Record<number, number>>>({});
  const measure = useCallback(
    (view: EditorView) => {
      view.requestMeasure({
        key: setTops,
        read: () => {
          const column = columnRef.current;
          return column === null ? {} : measuredTops(view, latest.current.lines, column);
        },
        write: setTops,
      });
    },
    [columnRef, latest],
  );
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }
    const callbacks = callbacksOf(setList);
    const state = EditorState.create({
      doc: latest.current.text,
      extensions: extensionsOf(listId, latest, callbacks, measure),
    });
    const editor = new EditorView({ state, parent: host });
    viewRef.current = editor;
    measure(editor);
    return () => {
      viewRef.current = undefined;
      editor.destroy();
    };
  }, [hostRef, viewRef, latest, listId, measure]);
  const { failedLine, lines } = inputs;
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setFailedLine.of(failedLine) });
  }, [viewRef, failedLine]);
  const linesKey = lines.join(' ');
  useEffect(() => {
    const editor = viewRef.current;
    if (editor !== undefined) {
      measure(editor);
    }
  }, [viewRef, linesKey, measure]);
  const refreshHints = useCallback(() => {
    const editor = viewRef.current;
    if (editor !== undefined) {
      const suggest = playgroundSuggestions(() => latest.current.hints);
      editor.dispatch({ effects: setSource.of({ kind: 'filter', fields: [], suggest }) });
    }
  }, [viewRef, latest]);
  return { list, tops, refreshHints };
}
