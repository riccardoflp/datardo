/**
 * `console.input`: the prompt, Datardo's editor on one line that grows to 8 and then scrolls, with the colors of a
 * Redis command, **Run** (**Stop** while a command runs), the hint of the command being typed, said politely to a
 * screen reader, and the list of suggestions (`console.autocomplete`). `Enter` runs, `Shift+Enter` adds a line, `Up`
 * and `Down` go through the history, `Tab` takes a suggestion, `Ctrl+Space` opens the list, `Esc` closes it or stops
 * the command running, `Ctrl+L` clears the output.
 */
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder, type KeyBinding } from '@codemirror/view';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { lineWithSuggestion, suggestions } from '../../../features/console/autocomplete';
import { inputLines, view as inputView, type InputView } from '../../../features/console/input';
import type { CommandDoc, ConsoleState } from '../../../features/console/types';
import { hasUnclosedQuote, redisColors, redisEditorTheme } from '../../components/editor/redis-editor';
import { browse, clearOutput, runInput, stopCommand } from './console-actions';
import { changeTab, consoleTabOf, type ConsoleTab } from './console-store';
import styles from './console-page.module.css';

/** What the keys of the editor read when pressed: always the latest. */
interface Latest {
  readonly tabId: string;
  readonly tab: ConsoleTab;
  readonly console: ConsoleState;
  readonly docs: readonly CommandDoc[];
  readonly shown: InputView;
}

/** The line the caret is on, where it starts, and the caret's place in it. */
function caretLine(
  typed: string,
  caret: number,
): { readonly line: string; readonly start: number; readonly at: number } {
  const start = typed.lastIndexOf('\n', caret - 1) + 1;
  const end = typed.indexOf('\n', caret);
  return { line: typed.slice(start, end < 0 ? typed.length : end), start, at: caret - start };
}

/** Takes the selected suggestion: the line with its name, the caret after the space. */
function takeSuggestion(latest: Latest): boolean {
  const list = latest.shown.suggestions;
  const chosen = list?.items[list.selected];
  if (list === undefined || chosen === undefined) {
    return false;
  }
  const { typed, caret } = latest.tab;
  const current = caretLine(typed, caret);
  const taken = lineWithSuggestion(current.line, list, chosen);
  const text = `${typed.slice(0, current.start)}${taken.line}${typed.slice(current.start + current.line.length)}`;
  changeTab(latest.tabId, (state) => {
    const { list: _closed, ...rest } = state;
    return { ...rest, typed: text, caret: current.start + taken.caret, put: state.put + 1 };
  });
  return true;
}

function moveInList(latest: Latest, step: number): boolean {
  const list = latest.shown.suggestions;
  if (list === undefined) {
    return false;
  }
  const count = list.items.length;
  changeTab(latest.tabId, (state) =>
    state.list === undefined
      ? state
      : { ...state, list: { ...state.list, selected: (list.selected + step + count) % count } },
  );
  return true;
}

function closeList(tabId: string): boolean {
  if (consoleTabOf(tabId)?.list === undefined) {
    return false;
  }
  changeTab(tabId, (state) => {
    const { list: _closed, ...rest } = state;
    return rest;
  });
  return true;
}

function keys(latest: () => Latest): readonly KeyBinding[] {
  const onLine = (view: EditorView, first: boolean): boolean => {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head).number;
    return first ? line === 1 : line === view.state.doc.lines;
  };
  return [
    {
      key: 'Enter',
      run: () => {
        const now = latest();
        closeList(now.tabId);
        void runInput(now.tabId);
        return true;
      },
    },
    { key: 'Shift-Enter', run: insertNewline },
    {
      key: 'ArrowUp',
      run: (view) =>
        moveInList(latest(), -1) ||
        (onLine(view, true) && (browse(latest().tabId, latest().console.history, 'older'), true)),
    },
    {
      key: 'ArrowDown',
      run: (view) =>
        moveInList(latest(), 1) ||
        (onLine(view, false) && (browse(latest().tabId, latest().console.history, 'newer'), true)),
    },
    { key: 'Tab', run: () => takeSuggestion(latest()) },
    {
      key: 'Ctrl-Space',
      run: () => {
        changeTab(latest().tabId, (state) => ({ ...state, list: { opening: 'asked', selected: 0 } }));
        return true;
      },
    },
    {
      key: 'Escape',
      run: () => {
        const now = latest();
        if (closeList(now.tabId)) {
          return true;
        }
        if (now.console.status === 'running') {
          stopCommand(now.console.connection);
          return true;
        }
        return false;
      },
    },
    {
      key: 'Ctrl-l',
      run: () => {
        const now = latest();
        clearOutput(now.tabId, now.console.connection, 'editor');
        return true;
      },
    },
  ];
}

/** The text typed changed: the list opens as the first or the second word is typed, and follows it. */
function typedChanged(tabId: string, typed: string, caret: number, docs: readonly CommandDoc[]): void {
  changeTab(tabId, (state) => {
    if (state.typed === typed && state.caret === caret) {
      return state;
    }
    const current = caretLine(typed, caret);
    const opening = state.list?.opening ?? 'typing';
    const found = typed === state.typed ? undefined : suggestions(current.line, current.at, docs, opening);
    const { list: _before, ...rest } = state;
    const list = found === undefined ? undefined : { opening, selected: 0 };
    return { ...rest, typed, caret, ...(list === undefined ? {} : { list }) };
  });
}

const optionsSlot = new Compartment();

function optionsOf(shown: InputView, invalid: boolean): readonly Extension[] {
  const hint = document.createElement('span');
  hint.className = styles['placeholder'] ?? '';
  hint.textContent = shown.placeholder;
  return [
    placeholder(hint),
    EditorView.contentAttributes.of({
      'aria-label': shown.label,
      'aria-multiline': 'true',
      tabindex: '0',
      'data-feature': 'console.input@editor',
      ...(invalid ? { 'aria-invalid': 'true' } : {}),
      ...(shown.suggestions === undefined
        ? { 'aria-autocomplete': 'list' }
        : {
            'aria-autocomplete': 'list',
            'aria-controls': 'console-suggestions',
            'aria-activedescendant': `console-suggestion-${String(shown.suggestions.selected)}`,
          }),
    }),
  ];
}

/** The editor of the input, kept in step with the tab's text. */
function useEditor(
  latest: () => Latest,
  host: React.RefObject<HTMLDivElement | null>,
  now: { readonly tab: ConsoleTab; readonly shown: InputView },
) {
  const viewRef = useRef<EditorView | undefined>(undefined);
  const invalid = hasUnclosedQuote(now.tab.typed);
  useEffect(() => {
    if (host.current === null) {
      return undefined;
    }
    const first = latest();
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: first.tab.typed,
        selection: { anchor: first.tab.caret },
        extensions: [
          history(),
          Prec.highest(keymap.of([...keys(latest)])),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          redisColors,
          redisEditorTheme(inputLines),
          EditorView.lineWrapping,
          optionsSlot.of(optionsOf(first.shown, false)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) {
              const current = latest();
              typedChanged(current.tabId, update.state.doc.toString(), update.state.selection.main.head, current.docs);
            }
          }),
        ],
      }),
    });
    viewRef.current = editor;
    editor.focus();
    return () => {
      editor.destroy();
      viewRef.current = undefined;
    };
  }, [host, latest]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: optionsSlot.reconfigure(optionsOf(now.shown, invalid)) });
  }, [now.shown, invalid]);
  const { put, typed, caret, focus } = now.tab;
  useEffect(() => {
    const editor = viewRef.current;
    if (editor === undefined || editor.state.doc.toString() === typed) {
      return;
    }
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: typed },
      selection: { anchor: Math.min(caret, typed.length) },
    });
    // Only a text put from outside replaces the editor's; what is typed is already there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [put]);
  useEffect(() => {
    if (focus > 0) {
      viewRef.current?.focus();
    }
  }, [focus]);
}

function Suggestions(props: { readonly shown: InputView; readonly tabId: string }): React.JSX.Element | null {
  const list = props.shown.suggestions;
  if (list === undefined) {
    return null;
  }
  return (
    <ul id="console-suggestions" role="listbox" aria-label="Suggestions" className={styles['suggestions']}>
      {list.items.map((item, index) => (
        <li
          key={item.name}
          id={`console-suggestion-${String(index)}`}
          role="option"
          aria-selected={index === list.selected}
          className={styles['suggestion']}
          onMouseDown={(event) => {
            event.preventDefault();
            changeTab(props.tabId, (state) =>
              state.list === undefined ? state : { ...state, list: { ...state.list, selected: index } },
            );
          }}
        >
          <span className={styles['suggestion-name']}>{item.name}</span>
          <span className={styles['suggestion-summary']}>{item.deprecated ?? item.summary}</span>
        </li>
      ))}
    </ul>
  );
}

/** The input of a console tab. */
export function ConsoleInput(props: {
  readonly tabId: string;
  readonly tab: ConsoleTab;
  readonly console: ConsoleState;
  readonly docs: readonly CommandDoc[];
}): React.JSX.Element {
  const { tabId, tab, console, docs } = props;
  const shown = inputView({
    console,
    typed: tab.typed,
    caret: tab.caret,
    docs,
    ...(tab.list === undefined ? {} : { list: tab.list }),
  });
  const latestRef = useRef<Latest>({ tabId, tab, console, docs, shown });
  useLayoutEffect(() => {
    latestRef.current = { tabId, tab, console, docs, shown };
  });
  const latest = useCallback(() => latestRef.current, []);
  const host = useRef<HTMLDivElement>(null);
  // What is drawn now, not the latest kept by the last render: a text put from outside is applied at once.
  useEditor(latest, host, { tab, shown });
  const running = console.status === 'running';
  return (
    <div className={styles['input']}>
      <div className={styles['input-row']}>
        <span className={styles['prompt']} aria-hidden={running ? true : undefined}>
          {shown.prompt ?? <span className={styles['spinner']} role="status" aria-label={console.running} />}
        </span>
        <div ref={host} className={styles['editor']} data-invalid={hasUnclosedQuote(tab.typed) ? 'true' : undefined} />
        <button
          type="button"
          className={styles['button']}
          data-feature={shown.button.element}
          onClick={() => {
            if (running) {
              stopCommand(console.connection);
            } else {
              void runInput(tabId);
            }
          }}
        >
          {shown.button.label}
        </button>
      </div>
      <Suggestions shown={shown} tabId={tabId} />
      <p className={styles['hint']} aria-live="polite" title={shown.hint?.syntax}>
        {shown.hint === undefined ? null : (
          <>
            <span className={styles['hint-syntax']}>{shown.hint.syntax}</span>
            <span className={styles['hint-summary']}>{shown.hint.summary}</span>
            <span className={styles['hint-since']}>{shown.hint.since}</span>
          </>
        )}
      </p>
    </div>
  );
}
