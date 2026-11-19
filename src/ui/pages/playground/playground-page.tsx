/**
 * The page of a playground tab (`playground.show`): its toolbar (**Run all** or **Stop**, the connection and database,
 * **Open…**, **Save**), the editor with a **Run** button beside the first line of each statement, and the results of
 * the last run under it (`playground.results`), the line between the two dragged or moved with the keys.
 */
import '@vscode/codicons/dist/codicon.css';
import { useCallback, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { view as showView, type ShowView, type ToolbarControl } from '../../../features/playground/show';
import { playgroundTab, runInProgress, type PlaygroundTab, type RunPart } from '../../../features/playground/types';
import type { PlaygroundState } from '../../../shared/state/playgrounds';
import type { TabId } from '../../../shared/ids';
import { useAppState } from '../../state/store';
import { startFeature } from '../../shell/intent';
import { SuggestionList } from '../../components/editor/suggestion-list';
import { insertSuggestion } from '../../components/editor/completion-state';
import { showLine, type HintsSource, type RunKeys } from './editor-parts';
import { completionHints, editPlayground, flushPlayground, readNeeds } from './playground-store';
import { PlaygroundResults } from './playground-results';
import { SplitLine, useSplit } from './split-line';
import { selectionOf, usePlaygroundEditor } from './use-playground-editor';
import type { EditorView } from '@codemirror/view';
import { text } from '../../../features/playground/text';
import styles from './playground-page.module.css';

/** Starts a run of the tab from its editor: the text as the editor has it, with its selection and caret. */
function runFrom(tab: TabId, part: RunPart, view: EditorView | undefined, line?: number): void {
  flushPlayground(tab);
  const selection = view === undefined ? undefined : selectionOf(view);
  startFeature('playground.run', {
    place: line === undefined ? 'toolbar' : 'editor',
    args: {
      part,
      tab,
      ...(view === undefined ? {} : { text: view.state.doc.toString(), caret: view.state.selection.main.head }),
      ...(selection === undefined ? {} : { selection: { ...selection } }),
      ...(line === undefined ? {} : { line }),
    },
  });
}

function Control({
  control,
  icon,
  onPress,
}: {
  readonly control: ToolbarControl<string>;
  readonly icon: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={control.element}
      aria-disabled={control.disabled ? true : undefined}
      title={control.tooltip ?? control.label}
      onClick={() => {
        if (!control.disabled) {
          onPress();
        }
      }}
    >
      <span className={`codicon codicon-${icon}`} aria-hidden="true" />
      <span>{control.label}</span>
    </button>
  );
}

function Toolbar({
  tab,
  shown,
  view,
}: {
  readonly tab: TabId;
  readonly shown: ShowView;
  readonly view: React.RefObject<EditorView | undefined>;
}): React.JSX.Element {
  const { run, target, open, save } = shown.toolbar;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.show.toolbar}>
      <Control
        control={run}
        icon={run.element === 'playground.stop@toolbar' ? 'debug-stop' : 'play'}
        onPress={() => {
          if (run.element === 'playground.stop@toolbar') {
            startFeature('playground.stop', { place: 'toolbar' });
          } else {
            runFrom(tab, 'all', view.current);
          }
        }}
      />
      <Control
        control={target}
        icon="database"
        onPress={() => {
          startFeature('playground.target', { place: 'toolbar', args: { tab } });
        }}
      />
      <Control
        control={open}
        icon="folder-opened"
        onPress={() => {
          startFeature('playground.open-file', { place: 'toolbar' });
        }}
      />
      <Control
        control={save}
        icon="save"
        onPress={() => {
          flushPlayground(tab);
          startFeature('playground.save', { place: 'toolbar', args: { tab } });
        }}
      />
    </div>
  );
}

/** What autocomplete knows of the playground's connection; `onRead` is called when something new was read. */
function useHints(
  playground: PlaygroundState,
  connection: PlaygroundTab['shows']['connection'],
  connected: boolean,
  onRead: React.RefObject<() => void>,
): HintsSource {
  return useMemo(
    () => ({
      hints: () => completionHints(connection, playground.defaultDatabase, connected),
      need: (needs: Parameters<HintsSource['need']>[0]) => {
        readNeeds(connection, needs, () => {
          onRead.current();
        });
      },
    }),
    [connection, playground.defaultDatabase, connected, onRead],
  );
}

function Editor({
  tab,
  playground,
  shown,
  connected,
  viewRef,
}: {
  readonly tab: PlaygroundTab;
  readonly playground: PlaygroundState;
  readonly shown: ShowView;
  readonly connected: boolean;
  readonly viewRef: React.RefObject<EditorView | undefined>;
}): React.JSX.Element {
  const listId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const onRead = useRef<() => void>(() => undefined);
  const hints = useHints(playground, tab.shows.connection, connected, onRead);
  const keys: RunKeys = {
    selectionOrAll: (view) => {
      runFrom(tab.id, selectionOf(view) === undefined ? 'all' : 'selection', view);
    },
    statement: (view) => {
      runFrom(tab.id, 'statement', view);
    },
  };
  const { list, tops, refreshHints } = usePlaygroundEditor(
    { host: hostRef, column: columnRef, view: viewRef },
    {
      text: playground.text,
      failedLine: shown.failedLine,
      lines: shown.runButtons.map((button) => button.line),
      onEdit: (edited, selection) => {
        editPlayground(tab.id, edited, selection);
      },
      keys,
      hints,
    },
    listId,
  );
  useLayoutEffect(() => {
    onRead.current = refreshHints;
  });
  return (
    <div className={styles['editor-scroller']}>
      <div ref={columnRef} className={styles['run-column']} role="group" aria-label={text.show.runButtons}>
        {shown.runButtons.map((button) => {
          const top = tops[button.line];
          return top === undefined ? null : (
            <button
              key={button.line}
              type="button"
              className={styles['run-button']}
              style={{ top }}
              data-feature={button.element}
              aria-label={button.name}
              aria-disabled={button.disabled ? true : undefined}
              title={button.name}
              onClick={() => {
                if (!button.disabled) {
                  runFrom(tab.id, 'statement', viewRef.current, button.line);
                }
              }}
            >
              <span className="codicon codicon-play" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div ref={hostRef} className={styles['editor']} data-field="playground" />
      {list === undefined ? null : (
        <SuggestionList
          id={listId}
          shown={list.shown}
          anchor={list.anchor}
          element="playground.autocomplete@editor"
          onPick={(index) => {
            const editor = viewRef.current;
            if (editor !== undefined) {
              insertSuggestion(index)(editor);
            }
          }}
        />
      )}
    </div>
  );
}

/** The page of a playground tab. */
export function PlaygroundPage({ tab: id }: { readonly tab: TabId }): React.JSX.Element | null {
  const state = useAppState();
  const viewRef = useRef<EditorView | undefined>(undefined);
  const split = useSplit();
  const onShowLine = useCallback((line: number) => {
    const editor = viewRef.current;
    if (editor !== undefined) {
      showLine(editor, line);
    }
  }, []);
  const tab = playgroundTab(state, id);
  const playground = state.playgrounds[id];
  if (tab === undefined || playground === undefined) {
    return null;
  }
  const saved = state.connections.saved.find((each) => each.id === tab.shows.connection);
  const running = runInProgress(state);
  const shown = showView({
    tab,
    playground,
    connection: { name: saved?.name ?? tab.shows.connection, readOnly: saved?.readOnly ?? false },
    ...(running === undefined ? {} : { running }),
  });
  const connected = state.connections.live[tab.shows.connection]?.state === 'connected';
  return (
    <div className={styles['page']} data-playground={id}>
      <Toolbar tab={id} shown={shown} view={viewRef} />
      <div className={styles['split']} style={{ gridTemplateRows: `${String(split.share * 100)}% auto 1fr` }}>
        <Editor tab={tab} playground={playground} shown={shown} connected={connected} viewRef={viewRef} />
        <SplitLine split={split} />
        <section className={styles['results']} aria-label={text.show.results}>
          <PlaygroundResults results={shown.results} tab={id} onShowLine={onShowLine} />
        </section>
      </div>
    </div>
  );
}
