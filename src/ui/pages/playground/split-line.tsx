/**
 * The line between the editor and the results of a playground (`playground.show`): each starts with half of the page;
 * dragged, the editor takes what the pointer gives; with the focus, `Up` and `Down` move it by a twentieth, `Home` and
 * `End` go to the limits, `Enter` and a double click give back the halves.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { editorShare } from '../../../features/playground/show';
import { text } from '../../../features/playground/text';
import styles from './playground-page.module.css';

/** The editor and the results each keep at least a tenth of the page. */
const least = 0.1;
const most = 1 - least;
const step = 0.05;

function limited(share: number): number {
  return Math.min(most, Math.max(least, share));
}

/** The share of the area the editor has. */
export interface Split {
  readonly share: number;
  readonly setShare: (share: number) => void;
}

/** The split of a playground page, the halves at first. */
export function useSplit(): Split {
  const [share, setShare] = useState(editorShare);
  return {
    share,
    setShare: (next) => {
      setShare(limited(next));
    },
  };
}

function keyShare(key: string, share: number): number | undefined {
  switch (key) {
    case 'ArrowUp':
      return share - step;
    case 'ArrowDown':
      return share + step;
    case 'Home':
      return least;
    case 'End':
      return most;
    case 'Enter':
      return editorShare;
    default:
      return undefined;
  }
}

/** The line, a separator that can be moved. */
export function SplitLine({ split }: { readonly split: Split }): React.JSX.Element {
  const dragging = useRef(false);
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const area = event.currentTarget.parentElement;
    if (!dragging.current || area === null) {
      return;
    }
    const bounds = area.getBoundingClientRect();
    if (bounds.height > 0) {
      split.setShare((event.clientY - bounds.top) / bounds.height);
    }
  };
  return (
    <div
      className={styles['split-line']}
      role="separator"
      aria-orientation="horizontal"
      aria-label={text.show.split}
      aria-valuemin={Math.round(least * 100)}
      aria-valuemax={Math.round(most * 100)}
      aria-valuenow={Math.round(split.share * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
      }}
      onPointerMove={move}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => {
        split.setShare(editorShare);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const next = keyShare(event.key, split.share);
        if (next !== undefined) {
          event.preventDefault();
          split.setShare(next);
        }
      }}
    />
  );
}
