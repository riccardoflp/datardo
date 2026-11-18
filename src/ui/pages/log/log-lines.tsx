/**
 * The lines of the Log (`runner.log`), drawn only when on screen: a list the user selects lines in (a click selects
 * one, `Ctrl` adds one, `Shift` a range; the arrows move), and that keeps the newest line in view while **Follow** is
 * on. Scrolling up turns **Follow** off.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import { timeText } from '../../../features/runner/log';
import { runnerText } from '../../../features/runner/text';
import type { LogLine } from '../../../shared/state/runner';
import styles from './log-page.module.css';

/** The lines selected, and the one the keyboard is on. */
export interface LogSelection {
  readonly selected: ReadonlySet<number>;
  readonly active?: number;
}

/** What the list is drawn from and tells back. */
export interface LogLinesProps {
  readonly lines: readonly LogLine[];
  readonly selection: LogSelection;
  readonly onSelect: (selection: LogSelection) => void;
  readonly follow: boolean;
  readonly onFollow: (follow: boolean) => void;
  /** A line to scroll to, asked by **Show in log**, and how many times it was asked. */
  readonly scrollTo?: { readonly line: number; readonly times: number };
}

const lineHeight = 22;

function picked(
  lines: readonly LogLine[],
  selection: LogSelection,
  id: number,
  how: 'one' | 'add' | 'range',
): LogSelection {
  if (how === 'add') {
    const selected = new Set(selection.selected);
    if (!selected.delete(id)) {
      selected.add(id);
    }
    return { selected, active: id };
  }
  if (how === 'range' && selection.active !== undefined) {
    const from = lines.findIndex((line) => line.id === selection.active);
    const to = lines.findIndex((line) => line.id === id);
    const range = lines.slice(Math.min(from, to), Math.max(from, to) + 1).map((line) => line.id);
    return { selected: new Set(range), active: selection.active };
  }
  return { selected: new Set([id]), active: id };
}

/** The list of lines. */
export function LogLines(props: LogLinesProps): React.JSX.Element {
  const { lines, selection, onSelect, follow, onFollow, scrollTo } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useRef(lines);
  shown.current = lines;
  // TanStack Virtual (D22) returns functions the React Compiler cannot memoize: it leaves this component as it is.
  // eslint-disable-next-line react-hooks/incompatible-library
  const list = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => lineHeight,
    overscan: 10,
  });
  useEffect(() => {
    if (follow && lines.length > 0) {
      list.scrollToIndex(lines.length - 1, { align: 'end' });
    }
  }, [follow, lines.length, list]);
  useEffect(() => {
    // The lines are read through a ref: the line is shown once when asked, not again at every new line.
    const index = scrollTo === undefined ? -1 : shown.current.findIndex((line) => line.id === scrollTo.line);
    if (index >= 0) {
      list.scrollToIndex(index, { align: 'center' });
    }
  }, [scrollTo, list]);
  const move = (by: number): void => {
    const index = lines.findIndex((line) => line.id === selection.active);
    const line = lines[Math.max(0, Math.min(lines.length - 1, index + by))];
    if (line !== undefined) {
      onSelect(picked(lines, selection, line.id, 'one'));
      list.scrollToIndex(lines.indexOf(line));
    }
  };
  return (
    <div
      ref={scroller}
      className={styles['scroller']}
      onScroll={(event) => {
        const element = event.currentTarget;
        const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - lineHeight;
        if (follow && !atEnd) {
          onFollow(false);
        }
      }}
    >
      <div
        className={styles['lines']}
        role="listbox"
        aria-multiselectable="true"
        aria-label={runnerText.logLines}
        tabIndex={0}
        aria-activedescendant={selection.active === undefined ? undefined : `log-line-${String(selection.active)}`}
        style={{ height: `${String(list.getTotalSize())}px` }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
          }
        }}
      >
        {list.getVirtualItems().map((item) => {
          const line = lines[item.index];
          if (line === undefined) {
            return null;
          }
          return (
            <div
              key={line.id}
              id={`log-line-${String(line.id)}`}
              role="option"
              aria-selected={selection.selected.has(line.id)}
              aria-setsize={lines.length}
              aria-posinset={item.index + 1}
              className={styles['line']}
              data-kind={line.kind}
              data-line={line.id}
              style={{ transform: `translateY(${String(item.start)}px)` }}
              onClick={(event) => {
                onSelect(
                  picked(
                    lines,
                    selection,
                    line.id,
                    event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'add' : 'one',
                  ),
                );
              }}
            >
              <span className={styles['time']}>{timeText(line.time)}</span>
              <span className={styles['connection']}>{line.connection ?? ''}</span>
              <span className={styles['source']}>{line.source}</span>
              <span className={styles['text']}>{line.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
