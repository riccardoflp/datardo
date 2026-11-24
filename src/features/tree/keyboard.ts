/**
 * Feature: tree.keyboard
 *
 * Everything the tree island does with the mouse, done with keys, as the tree pattern of the WAI-ARIA Authoring
 * Practices has them: what each key does on the line that has the focus. No key of the tree writes to a deployment.
 * `Shift+Down`, `Shift+Up` and `Escape` change the nodes selected together (`tree.select`).
 */
import type { RefreshScope } from './refresh';
import { isSelectable } from './select';
import type { Control, TreeItem } from './types';

/** How long the letters typed add up to one name, in ms (Datardo's choice). */
export const typeAheadMs = 1000;

/** The letters typed in the last second, and when the last one was. */
export interface TypeAhead {
  readonly text: string;
  readonly at: number;
}

/** Nothing typed. */
export const noTypeAhead: TypeAhead = { text: '', at: 0 };

/** What a key does. */
export type KeyEffect =
  | { readonly kind: 'focus'; readonly item: string }
  | { readonly kind: 'expand'; readonly item: string }
  | { readonly kind: 'collapse'; readonly item: string }
  /** What the control of the line does: a click on the name, **Load more**, **Retry**, **Connect**. */
  | { readonly kind: 'start'; readonly control: Control }
  | { readonly kind: 'menu'; readonly item: string }
  | { readonly kind: 'refresh'; readonly scope: RefreshScope }
  | { readonly kind: 'filter' }
  /** `Shift+Down`, `Shift+Up`: the focus moves to `item`, selected with every node from the anchor (`from` without one). */
  | { readonly kind: 'select'; readonly item: string; readonly from: string }
  /** `Escape`: with several nodes selected, only `item` stays selected. */
  | { readonly kind: 'escape'; readonly item: string }
  | { readonly kind: 'none' };

/** What the keys are pressed on. */
export interface KeyboardInput {
  /** Every line shown, in order. */
  readonly items: readonly TreeItem[];
  /** The line with the focus; the first one when none has it. */
  readonly focus?: string;
  /** The key as the cards write it: `Down`, `Shift+F10`, `Ctrl+F`, or the character typed. */
  readonly key: string;
  readonly typed: TypeAhead;
  readonly now: number;
}

/** What a key does, and the letters typed after it. */
export interface KeyResult {
  readonly effect: KeyEffect;
  readonly typed: TypeAhead;
}

/** Whether the focus can be on a line: nodes and headings, and the lines that have a button. */
function isFocusable(item: TreeItem): boolean {
  return item.kind !== 'line' || item.button !== undefined;
}

function isExpandable(item: TreeItem): boolean {
  return item.kind === 'heading' || (item.kind === 'node' && item.expandable);
}

function isExpanded(item: TreeItem): boolean {
  return (item.kind === 'heading' || item.kind === 'node') && item.expanded;
}

function parentOf(item: TreeItem): string | undefined {
  return item.kind === 'heading' ? undefined : item.parent;
}

function toggle(item: TreeItem): KeyEffect {
  return isExpanded(item) ? { kind: 'collapse', item: item.id } : { kind: 'expand', item: item.id };
}

/** What `Enter` does: a click on the name, or the button of a line; a database of MongoDB and a heading toggle. */
function enter(item: TreeItem): KeyEffect {
  if (item.kind === 'line') {
    return item.button === undefined ? { kind: 'none' } : { kind: 'start', control: item.button };
  }
  if (item.kind === 'node' && item.click !== undefined) {
    return { kind: 'start', control: item.click };
  }
  return isExpandable(item) ? toggle(item) : { kind: 'none' };
}

/** What `F5` refreshes: the whole connection from a heading, the database of the node otherwise. */
export function refreshScopeOf(item: TreeItem | undefined): RefreshScope {
  if (item?.kind !== 'node') {
    return { kind: 'connection' };
  }
  const { ref } = item;
  switch (ref.kind) {
    case 'database':
    case 'collection':
    case 'bucket':
      return { kind: 'database', database: ref.database };
    case 'redis-database':
    case 'namespace':
      return { kind: 'redis-database', database: ref.database };
    case 'empty-databases':
    case 'pin':
    case 'page':
    case 'heading':
      return { kind: 'connection' };
  }
}

function nameOf(item: TreeItem): string {
  return item.kind === 'node' ? item.name : item.kind === 'heading' ? item.text : '';
}

/** The next line, from the focus, whose name starts with the letters typed. */
function typedAhead(input: KeyboardInput, shown: readonly TreeItem[], at: number): KeyResult {
  const continued = input.now - input.typed.at <= typeAheadMs;
  const typed = { text: `${continued ? input.typed.text : ''}${input.key}`, at: input.now };
  const wanted = typed.text.toLowerCase();
  const start = typed.text.length > 1 ? at : at + 1;
  const order = [...shown.slice(start), ...shown.slice(0, start)];
  const found = order.find((item) => nameOf(item).toLowerCase().startsWith(wanted));
  return { effect: found === undefined ? { kind: 'none' } : { kind: 'focus', item: found.id }, typed };
}

function focusAt(shown: readonly TreeItem[], index: number): KeyEffect {
  const item = shown[Math.max(0, Math.min(shown.length - 1, index))];
  return item === undefined ? { kind: 'none' } : { kind: 'focus', item: item.id };
}

function arrows(input: KeyboardInput, shown: readonly TreeItem[], at: number): KeyEffect | undefined {
  const item = shown[at];
  if (item === undefined) {
    return { kind: 'none' };
  }
  switch (input.key) {
    case 'Down':
      return focusAt(shown, at + 1);
    case 'Up':
      return focusAt(shown, at - 1);
    case 'Home':
      return focusAt(shown, 0);
    case 'End':
      return focusAt(shown, shown.length - 1);
    case 'Right': {
      if (!isExpandable(item)) {
        return { kind: 'none' };
      }
      const child = shown.find((each) => parentOf(each) === item.id);
      return !isExpanded(item)
        ? { kind: 'expand', item: item.id }
        : child === undefined
          ? { kind: 'none' }
          : { kind: 'focus', item: child.id };
    }
    case 'Left': {
      const parent = parentOf(item);
      return isExpandable(item) && isExpanded(item)
        ? { kind: 'collapse', item: item.id }
        : parent === undefined
          ? { kind: 'none' }
          : { kind: 'focus', item: parent };
    }
    default:
      return undefined;
  }
}

/**
 * `Shift+Down`, `Shift+Up` on a node that can be selected with others: the next or the previous one, stopping at the
 * first and the last; on any other line, they move as `Down` and `Up`.
 */
function selecting(input: KeyboardInput, shown: readonly TreeItem[], at: number): KeyEffect | undefined {
  if (input.key !== 'Shift+Down' && input.key !== 'Shift+Up') {
    return undefined;
  }
  const item = shown[at];
  if (!isSelectable(item)) {
    return focusAt(shown, input.key === 'Shift+Down' ? at + 1 : at - 1);
  }
  const selectable = shown.filter(isSelectable);
  const index = selectable.findIndex((each) => each.id === item.id);
  const next = selectable[Math.max(0, Math.min(selectable.length - 1, index + (input.key === 'Shift+Down' ? 1 : -1)))];
  return { kind: 'select', item: next?.id ?? item.id, from: item.id };
}

function commands(input: KeyboardInput, item: TreeItem | undefined): KeyEffect {
  if (item === undefined) {
    return { kind: 'none' };
  }
  switch (input.key) {
    case 'Escape':
      return { kind: 'escape', item: item.id };
    case 'Enter':
      return enter(item);
    case 'Space':
      return isExpandable(item) ? toggle(item) : { kind: 'none' };
    case 'Shift+F10':
    case 'ContextMenu':
      return item.kind !== 'line' && item.hasMenu ? { kind: 'menu', item: item.id } : { kind: 'none' };
    case 'F5':
      return { kind: 'refresh', scope: refreshScopeOf(item) };
    case 'Ctrl+F':
      return { kind: 'filter' };
    default:
      return { kind: 'none' };
  }
}

/**
 * Feature: tree.keyboard — what a key does on the line that has the focus: move, expand, collapse, open, open the
 * menu, refresh, filter, or move to the next line whose name starts with the letters typed in the last second.
 */
export function view(input: KeyboardInput): KeyResult {
  const shown = input.items.filter(isFocusable);
  const found = shown.findIndex((item) => item.id === input.focus);
  const at = found < 0 ? 0 : found;
  if (/^[\p{L}\p{N}]$/u.test(input.key)) {
    return typedAhead(input, shown, at);
  }
  const moved = arrows(input, shown, at) ?? selecting(input, shown, at);
  return { effect: moved ?? commands(input, shown[at]), typed: input.typed };
}
