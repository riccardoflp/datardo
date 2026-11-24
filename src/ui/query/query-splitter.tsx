/**
 * The splitter between the content of a section and the query pane (`query.position`, `@query-bar`). Dragged to the
 * left it widens the pane, which follows the drag as it goes, the width set when the button is released; a double
 * click gives the default width; with the focus, `Left` widens the pane by 20 px and `Right` narrows it, by 60 px with
 * `Shift`, `Home` gives the minimum, `End` the widest the main island allows, `Enter` the default.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  draggedWidth,
  keyedWidth,
  queryPaneDefault,
  queryPaneMinimum,
  widestPane,
} from '../../features/query/position';
import { text } from '../../features/query/text';
import { startFeature } from '../shell/intent';
import styles from './query-layout.module.css';

/** Sets the width of the query pane, for every collection tab. */
function setWidth(width: number): void {
  startFeature('query.position', { place: 'query-bar', args: { width } });
}

/** The splitter. */
export function QuerySplitter({
  width,
  mainWidth,
  onDrag,
}: {
  /** The width of the pane as it is shown now. */
  readonly width: number;
  /** The width of the main island, which bounds the pane. */
  readonly mainWidth: number;
  /** While dragging: the width the pointer gives, or `undefined` when the drag ends without moving. */
  readonly onDrag: (width: number | undefined) => void;
}): React.JSX.Element {
  const start = useRef<{ readonly x: number; readonly width: number; last: number } | undefined>(undefined);
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width, last: width };
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const begun = start.current;
    if (begun !== undefined) {
      // The pane is at the right: the splitter dragged to the left widens it.
      begun.last = draggedWidth(begun.width - (event.clientX - begun.x), mainWidth);
      onDrag(begun.last);
    }
  };
  const up = (): void => {
    const begun = start.current;
    start.current = undefined;
    if (begun !== undefined && begun.last !== begun.width) {
      // The pane keeps the width dragged until the width remembered comes back with it.
      setWidth(begun.last);
    } else {
      onDrag(undefined);
    }
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = keyedWidth(event.key, event.shiftKey, width, mainWidth);
    if (next !== undefined) {
      event.preventDefault();
      setWidth(next);
    }
  };
  return (
    <div
      className={styles['splitter']}
      role="separator"
      aria-orientation="vertical"
      aria-label={text.position.splitterName}
      title={text.position.splitterTip}
      aria-valuenow={width}
      aria-valuemin={queryPaneMinimum}
      aria-valuemax={widestPane(mainWidth)}
      aria-valuetext={`${String(width)} px`}
      data-feature="query.position@query-bar"
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => {
        setWidth(queryPaneDefault);
      }}
      onKeyDown={keys}
    />
  );
}
