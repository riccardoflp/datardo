/**
 * The measures of M36 (R10.8, R10.9): where every word and every control of the window is, before and after the pointer
 * passes over a control; and what goes past its island, over another control, or shows a scroll bar in a field of one
 * line. They read the window as it is drawn, so that a rule of a style, a component that draws something more on
 * hover, or a page that empties itself while it reads are all caught the same way.
 */
import type { Page } from '@playwright/test';

/** Where a word or a control is: x, y, width, height, in pixels of the window. */
type Box = readonly [number, number, number, number];

/** The boxes of every word (text node) and every control, by a key that survives a change of the page around them. */
type Layout = Readonly<Record<string, Box>>;

/** What a page shows that the pointer can hover: its controls, its lines, its cells. */
const hoverable =
  'button, a[href], [role="menuitem"], [role="treeitem"], [role="tab"], [role="option"], [role="row"], ' +
  '[role="gridcell"], [role="switch"], [role="checkbox"], summary, th, td';

/** Gives every hoverable element of the window a number, and says how many there are, at most `most`. */
async function numberControls(window: Page, most: number): Promise<number> {
  return window.evaluate(
    ({ selector, most: limit }) => {
      for (const element of document.querySelectorAll('[data-m36]')) {
        element.removeAttribute('data-m36');
      }
      const shown = [...document.querySelectorAll(selector)].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom <= innerHeight && box.right <= innerWidth;
      });
      shown.slice(0, limit).forEach((element, index) => {
        element.setAttribute('data-m36', String(index));
      });
      return Math.min(shown.length, limit);
    },
    { selector: hoverable, most },
  );
}

/** The layout of the window: each word by its text and its rank among the words of that text, each numbered control. */
async function layoutOf(window: Page): Promise<Layout> {
  return window.evaluate(() => {
    const result: Record<string, [number, number, number, number]> = {};
    const seen = new Map<string, number>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (text === '') {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.width === 0) {
        continue;
      }
      const rank = seen.get(text) ?? 0;
      seen.set(text, rank + 1);
      result[`"${text.slice(0, 40)}" #${String(rank)}`] = [box.x, box.y, box.width, box.height];
    }
    for (const element of document.querySelectorAll('[data-m36]')) {
      const box = element.getBoundingClientRect();
      result[`control ${element.getAttribute('data-m36') ?? ''}`] = [box.x, box.y, box.width, box.height];
    }
    return result;
  });
}

/** The keys whose box differs by more than half a pixel between two layouts; a key found in one only is left out. */
function changed(before: Layout, after: Layout): string[] {
  const moved: string[] = [];
  for (const [key, first] of Object.entries(before)) {
    const second = after[key];
    if (second !== undefined && first.some((value, at) => Math.abs(value - (second[at] ?? value)) > 0.5)) {
      moved.push(
        `${key} [${first.map((n) => n.toFixed(1)).join(',')}] -> [${second.map((n) => n.toFixed(1)).join(',')}]`,
      );
    }
  }
  return moved;
}

/** A place where the pointer touches nothing that reacts: the status line's empty end. */
async function pointerAway(window: Page): Promise<void> {
  const size = window.viewportSize() ?? { width: 1440, height: 900 };
  await window.mouse.move(size.width - 2, size.height - 2);
}

/**
 * Hovers each control of the window, at most `most`, and says which ones moved or resized a word or a control. What
 * changes on its own while nothing is hovered (a clock, a refresh) is measured first and left out.
 */
export async function hoverShifts(window: Page, most = 160): Promise<string[]> {
  const count = await numberControls(window, most);
  const shifts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const control = window.locator(`[data-m36="${String(index)}"]`);
    const name = await control
      .evaluate((element) => {
        const label = element.getAttribute('aria-label') ?? element.textContent;
        return `${element.getAttribute('role') ?? element.tagName.toLowerCase()} "${label.trim().slice(0, 40)}"`;
      })
      .catch(() => undefined);
    if (name === undefined) {
      continue;
    }
    await pointerAway(window);
    await window.waitForTimeout(120);
    const resting = await layoutOf(window);
    await window.waitForTimeout(120);
    const restingAgain = await layoutOf(window);
    const moving = new Set(changed(resting, restingAgain).map((line) => line.split(' [')[0]));
    // The pointer goes to the control where it is drawn: `hover()` would scroll it into view first, and a scroll is
    // not what this measures. A control scrolled out of view since it was numbered is left out.
    const box = await control.boundingBox().catch(() => null);
    const size = window.viewportSize() ?? { width: 1440, height: 900 };
    if (box === null || box.y < 0 || box.y + box.height > size.height || box.x + box.width > size.width) {
      continue;
    }
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.waitForTimeout(160);
    const hovered = await layoutOf(window);
    const moved = changed(restingAgain, hovered).filter((line) => !moving.has(line.split(' [')[0]));
    if (moved.length > 0) {
      shifts.push(`${name}: ${String(moved.length)} moved, ${moved.slice(0, 3).join(' | ')}`);
    }
  }
  await pointerAway(window);
  return shifts;
}

/**
 * What does not fit (R10.9): a box past its island where nothing scrolls it, an island past the window, two controls
 * over each other, a field of one line showing a scroll bar.
 */
export async function fitProblems(window: Page): Promise<string[]> {
  return window.evaluate(() => {
    const problems: string[] = [];
    const describe = (element: Element): string => {
      const label = element.getAttribute('aria-label') ?? element.getAttribute('data-feature') ?? element.textContent;
      return `${element.tagName.toLowerCase()} "${label.trim().slice(0, 40)}"`;
    };
    const shown = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    /** Whether something between the element and its island clips or scrolls it. */
    const clippedWithin = (element: Element, island: Element): boolean => {
      for (let up = element.parentElement; up !== null && up !== island; up = up.parentElement) {
        const style = getComputedStyle(up);
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          return true;
        }
      }
      return false;
    };
    const overlap = (first: Element, second: Element): boolean => {
      if (first.contains(second) || second.contains(first)) {
        return false;
      }
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const wide = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const high = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return wide > 2 && high > 2;
    };
    const checkIsland = (island: Element): void => {
      const name = island.getAttribute('data-island') ?? '';
      const edge = island.getBoundingClientRect();
      if (edge.right > innerWidth + 1 || edge.bottom > innerHeight + 1) {
        problems.push(`island ${name} goes past the window`);
      }
      const past = [...island.querySelectorAll('*')].filter((element) => {
        const box = element.getBoundingClientRect();
        const outside = box.right > edge.right + 1 || box.left < edge.left - 1;
        return outside && shown(element) && !clippedWithin(element, island);
      });
      problems.push(...past.map((element) => `${describe(element)} goes past the island ${name}`));
      const controls = [...island.querySelectorAll('button, input, select, textarea, [role="combobox"]')].filter(
        (element) => shown(element) && element.closest('[role="grid"], [role="tree"], table') === null,
      );
      controls.forEach((first, at) => {
        const covered = controls.slice(at + 1).filter((second) => overlap(first, second));
        problems.push(...covered.map((second) => `${describe(first)} is over ${describe(second)}`));
      });
    };
    document.querySelectorAll('[data-island]').forEach(checkIsland);
    for (const field of document.querySelectorAll('[data-multiline="false"] .cm-scroller')) {
      if (field instanceof HTMLElement && field.offsetHeight - field.clientHeight > 1) {
        problems.push(`the field ${describe(field.closest('[data-field]') ?? field)} of one line shows a scroll bar`);
      }
    }
    return [...new Set(problems)];
  });
}

/** The sizes of the window M36 checks, from the smallest it supports (R10.9). */
export const windowSizes = [
  { width: 800, height: 600 },
  { width: 1024, height: 700 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** The two themes, as the window's color scheme. */
export const themes = ['dark', 'light'] as const;
