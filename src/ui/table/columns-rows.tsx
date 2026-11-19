/**
 * The rows of the **Columns** panel (`table.columns`, `table.arrange-columns@list`): a checkbox that shows or hides
 * the column, its name, the pin button of a top-level column. The arrows move through the rows, `Space` ticks,
 * `Alt+↑` and `Alt+↓` move the row among its siblings; a row dropped on another moves its column before it, or after
 * it on its lower half.
 */
import { useRef, useState } from 'react';
import type { LayoutChange } from '../../features/table/arrange-columns';
import type { ColumnsRow } from '../../features/table/columns';
import { text } from '../../features/table/text';
import styles from './table-panels.module.css';

/** What the rows are drawn from. */
export interface ColumnsRowsProps {
  readonly rows: readonly ColumnsRow[];
  readonly draggable: boolean;
  readonly onChange: (change: LayoutChange) => void;
}

const rowKeyMime = 'application/x-datardo-column';

/** The move a key makes of a row, or where it moves the focus; `Space` ticks the checkbox by itself. */
function keyOn(row: ColumnsRow, event: React.KeyboardEvent): LayoutChange | 'next' | 'previous' | undefined {
  if (event.altKey && event.key === 'ArrowUp') {
    return { kind: 'move-left', key: row.key };
  }
  if (event.altKey && event.key === 'ArrowDown') {
    return { kind: 'move-right', key: row.key };
  }
  if (event.key === 'ArrowDown') {
    return 'next';
  }
  if (event.key === 'ArrowUp') {
    return 'previous';
  }
  return undefined;
}

function Row({
  row,
  props,
  dragged,
  setDragged,
}: {
  readonly row: ColumnsRow;
  readonly props: ColumnsRowsProps;
  readonly dragged: string | undefined;
  readonly setDragged: (key: string | undefined) => void;
}): React.JSX.Element {
  const toggle: LayoutChange = row.shown ? { kind: 'hide', key: row.key } : { kind: 'show', key: row.key };
  return (
    <li
      className={styles['row']}
      tabIndex={-1}
      data-key={row.key}
      data-depth={Math.min(row.depth, 2)}
      data-dragged={dragged === row.key ? 'true' : undefined}
      draggable={props.draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(rowKeyMime, row.key);
        setDragged(row.key);
      }}
      onDragEnd={() => {
        setDragged(undefined);
      }}
      onDragOver={(event) => {
        if (props.draggable && event.dataTransfer.types.includes(rowKeyMime)) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        const source = event.dataTransfer.getData(rowKeyMime);
        event.preventDefault();
        setDragged(undefined);
        if (source !== '' && source !== row.key) {
          const box = event.currentTarget.getBoundingClientRect();
          props.onChange({ kind: 'move', source, target: row.key, after: event.clientY > box.top + box.height / 2 });
        }
      }}
    >
      <input
        type="checkbox"
        data-feature="table.arrange-columns@list"
        aria-label={row.key}
        checked={row.shown}
        onChange={() => {
          props.onChange(toggle);
        }}
      />
      <span className={styles['row-name']} title={row.key}>
        {row.name}
      </span>
      {row.pin === undefined ? null : (
        <button
          type="button"
          className={styles['pin']}
          data-feature="table.arrange-columns@list"
          aria-label={row.pin.pinned ? row.pin.tip : text.names.pinned(row.name)}
          aria-pressed={row.pin.pinned}
          title={row.pin.tip}
          onClick={() => {
            props.onChange(row.pin?.pinned === true ? { kind: 'unpin', key: row.key } : { kind: 'pin', key: row.key });
          }}
        >
          <span className={`codicon codicon-${row.pin.pinned ? 'pinned' : 'pin'}`} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/** Moves the focus to the checkbox of the row before or after the one that has it. */
function moveFocus(list: HTMLUListElement | null, from: Element, step: 1 | -1): void {
  const boxes = [...(list?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
  const at = boxes.findIndex((box) => box.closest('li') === from.closest('li'));
  boxes[Math.max(0, Math.min(boxes.length - 1, at + step))]?.focus();
}

/** The rows of the panel. */
export function ColumnsRows(props: ColumnsRowsProps): React.JSX.Element {
  const list = useRef<HTMLUListElement>(null);
  const [dragged, setDragged] = useState<string | undefined>(undefined);
  return (
    <ul
      ref={list}
      className={styles['rows']}
      aria-label={text.names.columnsList}
      onKeyDown={(event) => {
        const key = (event.target as HTMLElement).closest('li')?.getAttribute('data-key');
        const row = props.rows.find((each) => each.key === key);
        const done = row === undefined ? undefined : keyOn(row, event);
        if (done === undefined) {
          return;
        }
        event.preventDefault();
        if (done === 'next' || done === 'previous') {
          moveFocus(list.current, event.target as Element, done === 'next' ? 1 : -1);
        } else {
          props.onChange(done);
        }
      }}
    >
      {props.rows.map((row) => (
        <Row key={row.key} row={row} props={props} dragged={dragged} setDragged={setDragged} />
      ))}
    </ul>
  );
}
