/**
 * A tree, as the tree pattern of the WAI-ARIA Authoring Practices draws it: an element with the role `tree` and, in
 * order, one `treeitem` for each line shown, its level in `aria-level`. The tree is one stop of `Tab`: the line that
 * can take the focus is the one that had it last, else the selected one, else the first. The keys are the caller's,
 * which says what each does; this component moves the focus and keeps the line with the focus in view.
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import styles from './tree.module.css';

/** A line of a tree, as the component needs it. */
export interface TreeRow {
  readonly id: string;
  /** From 1. */
  readonly level: number;
  /** Absent for a line with nothing under it. */
  readonly expanded?: boolean;
  readonly selected: boolean;
  /** Whether the focus can be on it. */
  readonly focusable: boolean;
  /** Its accessible name. */
  readonly label: string;
  readonly dimmed?: boolean;
  readonly tone?: 'quiet' | 'error';
  /** Whether it can be dragged onto another line that can be dragged. */
  readonly draggable?: boolean;
  /** The identifier of the line's element, written whole by the caller (`data-feature`). */
  readonly element?: string;
}

/** What a tree is given. */
export interface TreeProps<Row extends TreeRow> {
  readonly label: string;
  readonly rows: readonly Row[];
  /** The line that had the focus last. */
  readonly focus: string | undefined;
  readonly onFocusRow: (row: Row) => void;
  readonly onKeyDown: (event: React.KeyboardEvent, row: Row) => void;
  readonly onClick: (event: React.MouseEvent, row: Row) => void;
  readonly onDoubleClick: (event: React.MouseEvent, row: Row) => void;
  readonly onContextMenu: (event: React.MouseEvent, row: Row) => void;
  /** A line that can be dragged was dropped onto another. */
  readonly onDropRow?: (dragged: Row, onto: Row) => void;
  /** What is drawn inside a line. */
  readonly renderRow: (row: Row) => React.ReactNode;
}

/** What the caller can ask of a tree. */
export interface TreeHandle {
  /** Puts the focus on a line and scrolls it into view. */
  readonly focusRow: (id: string) => void;
  /** Scrolls a line into view without moving the focus. */
  readonly revealRow: (id: string) => void;
  /** The element of a line, where a menu opens. */
  readonly elementOf: (id: string) => HTMLElement | undefined;
}

/** The line `Tab` enters the tree on. */
function tabStopOf(rows: readonly TreeRow[], focus: string | undefined): string | undefined {
  const focusable = rows.filter((row) => row.focusable);
  return focusable.find((row) => row.id === focus)?.id ?? focusable.find((row) => row.selected)?.id ?? focusable[0]?.id;
}

/** What makes a line dragged, and a target of the lines dragged: the line dragged is kept between the events. */
function useDragRows<Row extends TreeRow>(
  onDropRow: ((dragged: Row, onto: Row) => void) | undefined,
): (row: Row) => React.HTMLAttributes<HTMLDivElement> & { readonly draggable: true } {
  const dragged = useRef<Row | undefined>(undefined);
  return (row) => ({
    draggable: true,
    onDragStart: (event) => {
      dragged.current = row;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.label);
    },
    onDragEnd: () => {
      dragged.current = undefined;
    },
    onDragOver: (event) => {
      if (dragged.current !== undefined && dragged.current.id !== row.id) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    },
    onDrop: (event) => {
      const from = dragged.current;
      dragged.current = undefined;
      if (from !== undefined && from.id !== row.id) {
        event.preventDefault();
        onDropRow?.(from, row);
      }
    },
  });
}

function TreeOf<Row extends TreeRow>(props: TreeProps<Row>, ref: React.ForwardedRef<TreeHandle>): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLElement>());
  const dragProps = useDragRows(props.onDropRow);
  useImperativeHandle(
    ref,
    () => ({
      focusRow: (id) => {
        const element = elements.current.get(id);
        element?.focus();
        element?.scrollIntoView({ block: 'nearest' });
      },
      revealRow: (id) => {
        elements.current.get(id)?.scrollIntoView({ block: 'nearest' });
      },
      elementOf: (id) => elements.current.get(id),
    }),
    [],
  );
  const tabStop = tabStopOf(props.rows, props.focus);
  return (
    <div role="tree" aria-label={props.label} className={styles['tree']}>
      {props.rows.map((row) => (
        <div
          key={row.id}
          ref={(element) => {
            if (element === null) {
              elements.current.delete(row.id);
            } else {
              elements.current.set(row.id, element);
            }
          }}
          role="treeitem"
          data-row={row.id}
          aria-level={row.level}
          aria-label={row.label}
          aria-selected={row.selected}
          {...(row.expanded === undefined ? {} : { 'aria-expanded': row.expanded })}
          tabIndex={row.id === tabStop ? 0 : row.focusable ? -1 : undefined}
          className={styles['row']}
          style={{ paddingInlineStart: `calc(${String(row.level - 1)} * var(--space-3) + var(--space-1))` }}
          data-dimmed={row.dimmed === true ? 'true' : undefined}
          data-tone={row.tone}
          {...(row.element === undefined ? {} : { 'data-feature': row.element })}
          {...(row.draggable === true ? dragProps(row) : {})}
          onFocus={(event) => {
            if (event.target === event.currentTarget) {
              props.onFocusRow(row);
            }
          }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget) {
              props.onKeyDown(event, row);
            }
          }}
          onClick={(event) => {
            props.onClick(event, row);
          }}
          onDoubleClick={(event) => {
            props.onDoubleClick(event, row);
          }}
          onContextMenu={(event) => {
            props.onContextMenu(event, row);
          }}
        >
          {props.renderRow(row)}
        </div>
      ))}
    </div>
  );
}

/** A tree of lines. */
export const Tree = forwardRef(TreeOf) as <Row extends TreeRow>(
  props: TreeProps<Row> & { readonly ref?: React.Ref<TreeHandle> },
) => React.JSX.Element;
