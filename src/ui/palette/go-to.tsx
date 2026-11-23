/**
 * `palette.open`: Go to. Closed, the field of the top bar; open, a text field with the focus and the list under it,
 * drawn from what `src/features/palette/open.ts` returns. `Up` and `Down` move and go round, `PageUp` and `PageDown`
 * move by the rows in sight, `Enter` or a click opens (`palette.open-result`), `Ctrl+Enter` or a click with `Ctrl` or
 * the middle button opens in the background; `Esc`, `Ctrl+K` or a click outside closes and gives the focus back.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { listWidth, rowsInSight, view, type GoToRow, type GoToView } from '../../features/palette/open';
import { openArgs, staysOpen, type Opening } from '../../features/palette/open-result';
import { readText } from '../../features/palette/sources';
import { text } from '../../features/palette/text';
import type { OpenTarget } from '../../features/palette/types';
import type { AppState } from '../../shared/state';
import { focusIsland } from '../shell/focus';
import { startFeature } from '../shell/intent';
import { useAppState } from '../state/store';
import { closeGoTo, openGoTo, useGoTo } from './go-to-store';
import { useKnowledge } from './knowledge';
import { runCommand } from './run-command';
import { useKeyScan } from './use-key-scan';
import styles from './go-to.module.css';

/** The field of the top bar, as `window.top-bar` gives it. */
export interface GoToField {
  readonly label: string;
  readonly placeholder: string;
  readonly key: string;
  readonly element: string;
  readonly enabled: boolean;
}

/** Opens a row: a command runs in the window; anything else is opened by `palette.open-result`. */
function openRow(opens: OpenTarget, opening: Opening, state: AppState): void {
  if (opens.kind === 'command') {
    closeGoTo();
    runCommand(opens.command, state);
    return;
  }
  startFeature('palette.open-result', { place: 'top-bar', args: openArgs(opens, opening) });
  if (!staysOpen(opens, opening)) {
    closeGoTo(false);
    requestAnimationFrame(() => {
      focusIsland('main');
    });
  }
}

/** Whether the text looks in the collections: no prefix, or `#`. */
function looksInCollections(typed: string): boolean {
  const { prefix, terms } = readText(typed);
  return terms.length > 0 && (prefix === undefined || prefix === 'collections');
}

function Row(props: {
  readonly row: GoToRow;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onOpen: (opening: Opening) => void;
}): React.JSX.Element {
  const { row } = props;
  return (
    <li
      id={`go-to-${row.id}`}
      role="option"
      aria-selected={props.selected}
      className={styles['row']}
      onPointerMove={props.onSelect}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          props.onOpen('background');
        }
      }}
      onClick={(event) => {
        props.onOpen(event.ctrlKey || event.metaKey ? 'background' : 'foreground');
      }}
    >
      <span className={`codicon codicon-${row.icon} ${styles['icon'] ?? ''}`} aria-hidden="true" />
      <span className={styles['name']}>
        {row.parts.map((part, index) =>
          part.bold ? <b key={String(index)}>{part.text}</b> : <span key={String(index)}>{part.text}</span>,
        )}
      </span>
      <span className={styles['context']}>{row.context}</span>
      <span className={styles['right']}>{row.right}</span>
      {row.kind === 'command' ? <span className={styles['spoken']}>{text.kinds.command}</span> : null}
    </li>
  );
}

function List(props: {
  readonly shown: GoToView;
  readonly rows: readonly GoToRow[];
  readonly selected: number;
  readonly setSelected: (index: number) => void;
  readonly open: (row: GoToRow, opening: Opening) => void;
  readonly state: AppState;
}): React.JSX.Element {
  const { shown, rows, selected } = props;
  const rowOf = (row: GoToRow): React.JSX.Element => {
    const index = rows.indexOf(row);
    return (
      <Row
        key={row.id}
        row={row}
        selected={index === selected}
        onSelect={() => {
          props.setSelected(index);
        }}
        onOpen={(opening) => {
          props.open(row, opening);
        }}
      />
    );
  };
  return (
    <div className={styles['list']} style={{ width: `min(${String(listWidth)}px, calc(100vw - 16px))` }}>
      <ul id="go-to-list" role="listbox" aria-label={shown.field.listLabel} className={styles['rows']}>
        {shown.sections.map((section, index) => (
          <li key={section.heading ?? String(index)} role="presentation">
            {section.heading === undefined ? null : <div className={styles['heading']}>{section.heading}</div>}
            <ul role="group" aria-label={section.heading ?? shown.field.listLabel} className={styles['group']}>
              {section.rows.map(rowOf)}
            </ul>
          </li>
        ))}
        {shown.keys === undefined ? null : (
          <li role="presentation">
            <div className={styles['heading']}>{shown.keys.heading}</div>
            <ul role="group" aria-label={shown.keys.heading} className={styles['group']}>
              {shown.keys.rows.map(rowOf)}
            </ul>
          </li>
        )}
      </ul>
      {shown.keys?.status === undefined ? null : (
        <div className={styles['line']}>
          {shown.keys.status}
          {shown.keys.scanAll === undefined ? null : (
            <button
              type="button"
              className={styles['link']}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (shown.keys?.scanAll !== undefined) {
                  openRow(shown.keys.scanAll.opens, 'foreground', props.state);
                }
              }}
            >
              {shown.keys.scanAll.label}
            </button>
          )}
        </div>
      )}
      {shown.message === undefined ? null : <div className={styles['line']}>{shown.message}</div>}
      {shown.notes.map((note) => (
        <div key={note} className={styles['line']}>
          {note}
        </div>
      ))}
      {shown.prefixes === undefined ? null : (
        <div className={styles['line']}>
          {shown.prefixes.intro === undefined ? null : <p className={styles['intro']}>{shown.prefixes.intro}</p>}
          <p className={styles['prefixes']}>
            {shown.prefixes.list.map((each) => (
              <span key={each.prefix}>
                <kbd className={styles['prefix']}>{each.prefix}</kbd> {each.source}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

/** The step a key moves the selection by, going round at the ends. */
function moved(key: string, selected: number, count: number): number | undefined {
  const steps: Readonly<Record<string, number>> = {
    ArrowDown: 1,
    ArrowUp: -1,
    PageDown: rowsInSight,
    PageUp: -rowsInSight,
  };
  const step = steps[key];
  if (step === undefined || count === 0) {
    return undefined;
  }
  if (Math.abs(step) === 1) {
    return (selected + step + count) % count;
  }
  return Math.min(count - 1, Math.max(0, selected + step));
}

/** Go to, open: the text field and the list. */
function OpenGoTo(props: { readonly field: GoToField; readonly prefix: string }): React.JSX.Element {
  const state = useAppState();
  const [typed, setTyped] = useState(props.prefix);
  const [selected, setSelected] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const knowledge = useKnowledge(state, looksInCollections(typed));
  const keys = useKeyScan(state, typed);
  const shown = view({ state, knowledge, typed, ...(keys === undefined ? {} : { keys }) });
  const rows = [...shown.sections.flatMap((section) => section.rows), ...(shown.keys?.rows ?? [])];
  const current = rows[Math.min(selected, rows.length - 1)];
  /** Whether the pointer chose the selection last: the list then stays where it is under the pointer. */
  const pointed = useRef(false);
  const point = (index: number): void => {
    if (index !== selected) {
      pointed.current = true;
      setSelected(index);
    }
  };
  useEffect(() => {
    input.current?.focus();
    const outside = (event: PointerEvent): void => {
      if (box.current !== null && !box.current.contains(event.target as Node)) {
        closeGoTo(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  useEffect(() => {
    if (pointed.current) {
      pointed.current = false;
      return;
    }
    if (current !== undefined) {
      document.getElementById(`go-to-${current.id}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [current]);
  const open = (row: GoToRow | undefined, opening: Opening): void => {
    if (row !== undefined) {
      openRow(row.opens, opening, state);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const next = moved(event.key, selected, rows.length);
    if (next !== undefined) {
      event.preventDefault();
      setSelected(next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(current, event.ctrlKey || event.metaKey ? 'background' : 'foreground');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeGoTo();
    }
  };
  return (
    <div ref={box} className={styles['open']}>
      <div className={styles['field']}>
        <span className="codicon codicon-search" aria-hidden="true" />
        <input
          ref={input}
          className={styles['input']}
          role="combobox"
          aria-expanded="true"
          aria-controls="go-to-list"
          aria-autocomplete="list"
          aria-label={shown.field.label}
          aria-activedescendant={current === undefined ? undefined : `go-to-${current.id}`}
          placeholder={shown.field.placeholder}
          data-feature={props.field.element}
          spellCheck={false}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setSelected(0);
          }}
          onKeyDown={keyDown}
        />
      </div>
      <List shown={shown} rows={rows} selected={selected} setSelected={point} open={open} state={state} />
      <div className={styles['spoken']} role="status" aria-live="polite">
        {shown.announcement}
      </div>
    </div>
  );
}

/** Opens Go to when the main process asks for it (the menu bar on macOS, `palette.open` started by the runner). */
function useAskedByMain(state: AppState): void {
  const seen = useRef(state.palette.goToAsked.count);
  const { count, prefix } = state.palette.goToAsked;
  useEffect(() => {
    if (count !== seen.current) {
      seen.current = count;
      openGoTo(prefix);
    }
  }, [count, prefix]);
}

/** The field of the top bar: a button while Go to is closed, the text field and the list while it is open. */
export function GoTo(props: {
  readonly field: GoToField;
  /** The top bar's classes for the field closed: the wide field, the narrow button, its placeholder and its key. */
  readonly classes: Readonly<Record<'field' | 'button' | 'placeholder' | 'key', string | undefined>>;
}): React.JSX.Element {
  const state = useAppState();
  const goTo = useGoTo();
  useAskedByMain(state);
  const { field } = props;
  if (goTo.open && field.enabled) {
    return <OpenGoTo key={goTo.at} field={field} prefix={goTo.prefix} />;
  }
  const click = (): void => {
    openGoTo('');
  };
  return (
    <>
      <button
        type="button"
        className={props.classes.field}
        aria-keyshortcuts={field.key.replace('Ctrl', 'Control').replace('Cmd', 'Meta')}
        data-feature={field.element}
        disabled={!field.enabled}
        onClick={click}
      >
        <span className="codicon codicon-search" aria-hidden="true" />
        <span className={props.classes.placeholder}>{field.placeholder}</span>
        <kbd className={props.classes.key}>{field.key}</kbd>
      </button>
      <button
        type="button"
        className={props.classes.button}
        aria-label={field.label}
        title={field.label}
        data-feature={field.element}
        disabled={!field.enabled}
        onClick={click}
      >
        <span className="codicon codicon-search" aria-hidden="true" />
      </button>
    </>
  );
}
