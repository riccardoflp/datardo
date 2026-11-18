/**
 * `tab.reorder` by a drag along the strip: the drag starts after the pointer moved 4 px, so that a click is never a
 * drag; while it goes, the other tabs of the group make room where the tab would land; over another group or outside
 * the strip no room is made, and releasing there, or `Esc`, puts the tab back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabId } from '../../../shared/ids';
import { startFeature } from '../intent';

/** How far the pointer moves before a press becomes a drag, in px (Datardo's choice). */
export const dragThreshold = 4;

/** A tab of the dragged one's group, where it was when the drag started. */
interface Slot {
  readonly id: TabId;
  readonly left: number;
  readonly width: number;
}

/** A drag in progress. */
interface Drag {
  readonly tab: TabId;
  readonly slots: readonly Slot[];
  readonly from: number;
  readonly dx: number;
  /** Where it would land in its group; `undefined` over another group or outside the strip. */
  readonly to: number | undefined;
}

/** Where the dragged tab would land, from where its middle is now. */
function landing(drag: Omit<Drag, 'to'>, pointer: { x: number; y: number }, strip: DOMRect): number | undefined {
  const first = drag.slots[0];
  const last = drag.slots[drag.slots.length - 1];
  const inside = pointer.y >= strip.top && pointer.y <= strip.bottom;
  if (
    first === undefined ||
    last === undefined ||
    !inside ||
    pointer.x < first.left ||
    pointer.x > last.left + last.width
  ) {
    return undefined;
  }
  const dragged = drag.slots[drag.from];
  const middle = (dragged?.left ?? 0) + drag.dx + (dragged?.width ?? 0) / 2;
  return drag.slots.filter((slot, index) => index !== drag.from && slot.left + slot.width / 2 < middle).length;
}

/** How far a tab is moved while a drag goes on, in px. */
function offset(drag: Drag | undefined, id: TabId): number {
  if (drag === undefined) {
    return 0;
  }
  if (id === drag.tab) {
    return drag.dx;
  }
  const index = drag.slots.findIndex((slot) => slot.id === id);
  const width = drag.slots[drag.from]?.width ?? 0;
  if (index < 0 || drag.to === undefined) {
    return 0;
  }
  if (drag.from < drag.to && index > drag.from && index <= drag.to) {
    return -width;
  }
  return drag.to < drag.from && index >= drag.to && index < drag.from ? width : 0;
}

/** The drag of the strip: what starts it, how far each tab is moved, and whether the last press was a drag. */
export function useTabDrag(strip: React.RefObject<HTMLElement | null>): {
  readonly start: (event: React.PointerEvent, tab: TabId, group: readonly TabId[]) => void;
  readonly offsetOf: (tab: TabId) => number;
  readonly dragging: TabId | undefined;
  readonly wasDrag: () => boolean;
} {
  const [drag, setDrag] = useState<Drag | undefined>(undefined);
  const dragged = useRef(false);
  const stop = useRef<() => void>(() => undefined);
  useEffect(
    () => () => {
      stop.current();
    },
    [],
  );
  const start = useCallback(
    (event: React.PointerEvent, tab: TabId, group: readonly TabId[]): void => {
      const element = strip.current;
      if (event.button !== 0 || element === null || group.length < 2) {
        return;
      }
      const slots = group.flatMap((id) => {
        const found = element.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.getBoundingClientRect();
        return found === undefined ? [] : [{ id, left: found.left, width: found.width }];
      });
      const from = slots.findIndex((slot) => slot.id === tab);
      const startX = event.clientX;
      dragged.current = false;
      let current: Drag | undefined;
      const move = (moved: PointerEvent): void => {
        const dx = moved.clientX - startX;
        if (current === undefined && Math.abs(dx) < dragThreshold) {
          return;
        }
        dragged.current = true;
        const base = { tab, slots, from, dx };
        current = {
          ...base,
          to: landing(base, { x: moved.clientX, y: moved.clientY }, element.getBoundingClientRect()),
        };
        setDrag(current);
      };
      const end = (): void => {
        stop.current();
        if (current?.to !== undefined && current.to !== from) {
          startFeature('tab.reorder', { place: 'tab-strip', args: { tab, to: current.to } });
        }
      };
      const key = (pressed: KeyboardEvent): void => {
        if (pressed.key === 'Escape' && current !== undefined) {
          pressed.preventDefault();
          current = undefined;
          stop.current();
        }
      };
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('keydown', key, true);
        setDrag(undefined);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('keydown', key, true);
    },
    [strip],
  );
  return {
    start,
    offsetOf: (tab) => offset(drag, tab),
    dragging: drag?.tab,
    wasDrag: () => {
      const was = dragged.current;
      dragged.current = false;
      return was;
    },
  };
}
