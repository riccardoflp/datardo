/**
 * The keys of the list of the Formatting view (`table.formatting`): the list is one stop of `Tab`; `Up` and `Down`
 * move between the lines, `Left` and `Right` between the controls of a line, `F2` goes to the rule's **Name**,
 * `Alt+Up` and `Alt+Down` move the rule, `Shift+F10` or the menu key opens its `…` menu; `Enter` and `Space` on the
 * line open and close the rule, as its button does. The focus requests of the view are carried out here too.
 */
import type { FormatRuleId } from '../../shared/formatting-rules';
import type { FormattingMemory } from './formatting-store';

/** What a key on the list does. */
export type ListKey =
  | { readonly kind: 'line'; readonly by: -1 | 1 }
  | { readonly kind: 'control'; readonly by: -1 | 1 }
  | { readonly kind: 'move'; readonly by: -1 | 1 }
  | { readonly kind: 'name' }
  | { readonly kind: 'menu' };

/** The key pressed, as the list reads it; `undefined` for the others, which do what they do. */
export function listKeyOf(event: React.KeyboardEvent): ListKey | undefined {
  const { key, altKey, shiftKey, ctrlKey, metaKey } = event;
  if (ctrlKey || metaKey) {
    return undefined;
  }
  const by = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : undefined;
  if (by !== undefined) {
    return altKey ? { kind: 'move', by } : { kind: 'line', by };
  }
  if (!altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    return { kind: 'control', by: key === 'ArrowLeft' ? -1 : 1 };
  }
  if (key === 'F2') {
    return { kind: 'name' };
  }
  return (key === 'F10' && shiftKey) || key === 'ContextMenu' ? { kind: 'menu' } : undefined;
}

/** The line of a rule in the list. */
export function lineElement(list: HTMLElement | null, id: FormatRuleId): HTMLElement | null {
  return list?.querySelector<HTMLElement>(`[data-rule="${CSS.escape(id)}"]`) ?? null;
}

/** The controls of a line that `Left` and `Right` go through, in their order. */
export function lineControls(line: HTMLElement | null): readonly HTMLElement[] {
  return line === null ? [] : [...line.querySelectorAll<HTMLElement>('[data-line-control]')];
}

/** Focuses the main control of a line: its button that opens the rule. */
export function focusLine(list: HTMLElement | null, id: FormatRuleId): void {
  lineElement(list, id)?.querySelector<HTMLElement>('[data-line-control="main"]')?.focus();
}

/** The focus requests of each collection already carried out, so that a view drawn later carries out the new ones. */
const handled = new Map<string, number>();

/** Whether a focus request is new; it is then counted as carried out. */
export function isNewFocusRequest(key: string, memory: FormattingMemory): boolean {
  if (memory.focus.count === 0 || handled.get(key) === memory.focus.count) {
    return false;
  }
  handled.set(key, memory.focus.count);
  return true;
}

/** Carries out a focus request in the view: on the rules (or **Add rule…**), on the open rule's condition or name. */
export function focusIn(
  root: HTMLElement | null,
  on: FormattingMemory['focus']['on'],
  active: FormatRuleId | undefined,
): void {
  requestAnimationFrame(() => {
    if (root === null) {
      return;
    }
    if (on === 'condition') {
      root.querySelector<HTMLElement>('[data-field="condition"] .cm-content')?.focus();
      return;
    }
    if (on === 'name' || on === 'field') {
      root.querySelector<HTMLElement>(`[data-open-part="${on}"]`)?.focus();
      return;
    }
    const line =
      active === undefined
        ? null
        : root.querySelector<HTMLElement>(`[data-rule="${CSS.escape(active)}"] [data-line-control="main"]`);
    const first = root.querySelector<HTMLElement>('[data-line-control="main"]');
    (line ?? first ?? root.querySelector<HTMLElement>('[data-feature="table.add-format-rule@inspector"]'))?.focus();
  });
}
