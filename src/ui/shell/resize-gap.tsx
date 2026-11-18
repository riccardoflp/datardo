/**
 * `nav.resize`: the gap between two islands, a handle. Dragged, the islands follow it as it goes and the width is
 * set when the button is released; double-clicked, the island gets its default width; with the focus, `Left` and
 * `Right` move it by 16 px, `Home` and `End` go to the limits, `Enter` gives the default.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { gapWidth } from '../../features/nav/layout';
import { keyWidth, type ResizedIsland, type WidthLimits } from '../../features/nav/resize';
import { text } from '../../features/nav/text';
import styles from './islands.module.css';

/** What a gap is given. */
export interface ResizeGapProps {
  readonly island: ResizedIsland;
  /** The island's width as it is shown now. */
  readonly width: number;
  readonly limits: WidthLimits;
  /** While dragging: the width the pointer gives, or `undefined` when the drag ends without moving. */
  readonly onDrag: (width: number | undefined) => void;
  /** Sets the width: at the end of a drag, on a double click, or from a key. */
  readonly onSet: (width: number) => void;
}

/** The handle between the explorer and the main island, or between the main island and the inspector island. */
export function ResizeGap(props: ResizeGapProps): React.JSX.Element {
  const { island, width, limits } = props;
  const start = useRef<{ readonly x: number; readonly width: number; last: number } | undefined>(undefined);
  /** The explorer grows to the right, the inspector island to the left. */
  const direction = island === 'explorer' ? 1 : -1;
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width, last: width };
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const begun = start.current;
    if (begun !== undefined) {
      begun.last = begun.width + (event.clientX - begun.x) * direction;
      props.onDrag(begun.last);
    }
  };
  const up = (): void => {
    const begun = start.current;
    start.current = undefined;
    props.onDrag(undefined);
    if (begun !== undefined && begun.last !== begun.width) {
      props.onSet(begun.last);
    }
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = keyWidth(event.key, width, limits, direction);
    if (next !== undefined) {
      event.preventDefault();
      props.onSet(next);
    }
  };
  return (
    <div
      className={styles['gap']}
      style={{ width: gapWidth }}
      role="separator"
      aria-orientation="vertical"
      aria-label={island === 'explorer' ? text.islands.resizeExplorer : text.islands.resizeInspector}
      aria-valuenow={width}
      aria-valuemin={limits.minimum}
      aria-valuemax={limits.maximum}
      aria-valuetext={`${String(width)} px`}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => {
        props.onSet(limits.default);
      }}
      onKeyDown={keys}
    />
  );
}
