/**
 * The window's own memory of the Formatting view (`table.formatting`), by collection: the rule open under its line
 * with its texts as typed, a new rule not saved yet (`table.add-format-rule`), the line of what a change could not do,
 * and the focus asked for. The rules themselves are the app's state (`formatting.json`); what is typed is saved one
 * second after the last key, when the box is left or with `Enter` (`table.edit-format-rule`), and the table follows
 * at each key: {@link shownRules} gives the rules as typed, each with its last condition that can be used.
 */
import { useSyncExternalStore } from 'react';
import {
  isFieldRule,
  writtenRules,
  type ConditionRule,
  type FormatRule,
  type FormatRuleId,
} from '../../shared/formatting-rules';
import type { Json } from '../../shared/engine-request';
import type { RuleChange } from '../../features/table/edit-format-rule';
import { fieldProblem } from '../../features/table/edit-format-rule';
import { collectionRules } from '../../features/table/format-scopes';
import { conditionOf } from '../../features/table/format-table';
import type { OpenRule } from '../../features/table/formatting';
import type { CollectionRef } from '../query/collection-reads';
import { currentAppState } from '../state/store';
import { startOnCollection } from './table-start';

/** How long after the last key what is typed is saved, in ms (`table.edit-format-rule`, Datardo's choice). */
export const saveDelayMs = 1000;

/** What the window keeps of the Formatting view of one collection. */
export interface FormattingMemory {
  readonly open?: OpenRule;
  /** The new rule not saved yet: shown open, last, until its condition can be used. */
  readonly draft?: ConditionRule;
  readonly note?: string;
  /** Each request to move the focus into the view, with where: the rules, or the open rule's condition. */
  readonly focus: { readonly count: number; readonly on: 'list' | 'condition' | 'name' };
}

const nothing: FormattingMemory = { focus: { count: 0, on: 'list' } };
const memories = new Map<string, FormattingMemory>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: (() => void) | undefined;

/** The key of a collection in the memory. */
export function memoryKey(ref: Pick<CollectionRef, 'connection' | 'database' | 'collection'>): string {
  return JSON.stringify([ref.connection, ref.database, ref.collection]);
}

/** What the window keeps of the view of a collection. */
export function formattingMemory(key: string): FormattingMemory {
  return memories.get(key) ?? nothing;
}

function change(key: string, next: (before: FormattingMemory) => FormattingMemory): void {
  const before = formattingMemory(key);
  const after = next(before);
  if (after === before) {
    return;
  }
  memories.set(key, after);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The memory of the view of a collection, drawn again when it changes. */
export function useFormattingMemory(key: string): FormattingMemory {
  return useSyncExternalStore(subscribe, () => formattingMemory(key));
}

/** The texts of a rule as the open rule starts with them. */
export function openTexts(rule: FormatRule): OpenRule {
  return {
    id: rule.id,
    name: rule.name ?? '',
    field: isFieldRule(rule) ? rule.field : (rule.field ?? ''),
    condition: isFieldRule(rule) ? '' : rule.condition,
  };
}

/**
 * A condition rule with the texts typed: the name trimmed, the field unless it starts with `$`, the condition when it
 * can be used, else the rule's last one that can.
 */
export function typedRule(rule: ConditionRule, open: OpenRule, now: number): ConditionRule {
  const name = open.name.trim();
  const field = fieldProblem(open.field) === undefined ? open.field.trim() : (rule.field ?? '');
  const usable = conditionOf(open.condition, now).ok;
  const { name: _name, field: _field, ...rest } = rule;
  return {
    ...rest,
    condition: usable ? open.condition : rule.condition,
    ...(field === '' ? {} : { field }),
    ...(name === '' ? {} : { name: name.slice(0, 200) }),
  };
}

/**
 * The rules the view lists and the table colors by: the collection's own as saved, the open one as typed, and the new
 * rule not saved yet last; and the problem of the condition typed in the open rule.
 */
export function shownRules(
  saved: readonly FormatRule[],
  memory: FormattingMemory,
  now: number,
): { readonly rules: readonly FormatRule[]; readonly typedProblem?: string } {
  const { open, draft } = memory;
  const pending = draft !== undefined && !saved.some((rule) => rule.id === draft.id) ? [draft] : [];
  const rules = [...saved, ...pending].map((rule) =>
    open !== undefined && rule.id === open.id && !isFieldRule(rule) ? typedRule(rule, open, now) : rule,
  );
  const typed = open === undefined ? undefined : conditionOf(open.condition, now);
  return typed === undefined || typed.ok ? { rules } : { rules, typedProblem: typed.message };
}

/** Saves now what waits to be saved. */
export function flushTyping(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  const save = pending;
  pending = undefined;
  save?.();
}

/** Starts a change of the rules of the collection (`table.edit-format-rule`). */
export function editRules(ref: CollectionRef, change: RuleChange): void {
  const args: Json = change.kind === 'set' ? { kind: 'set', rule: writtenRules([change.rule])[0] ?? null } : change;
  void startOnCollection(ref, 'table.edit-format-rule@inspector', { change: args });
}

/** The rules of the collection as saved now. */
function savedRules(ref: CollectionRef): readonly FormatRule[] {
  const { connection, database, collection } = ref;
  return collectionRules(currentAppState().table.formatting, { connection, database, collection });
}

/** Saves a rule as typed: a new rule by `table.add-format-rule` once it can be used, another by an edit. */
function saveTyped(ref: CollectionRef, now: number): void {
  const key = memoryKey(ref);
  const saved = savedRules(ref);
  const { open, draft } = formattingMemory(key);
  if (open === undefined) {
    return;
  }
  const isDraft = draft?.id === open.id && !saved.some((rule) => rule.id === open.id);
  const base = isDraft ? draft : saved.find((rule) => rule.id === open.id);
  if (base === undefined || isFieldRule(base)) {
    return;
  }
  const rule = typedRule(base, open, now);
  if (isDraft) {
    if (conditionOf(open.condition, now).ok) {
      void startOnCollection(ref, 'table.add-format-rule@inspector', { rule: writtenRules([rule])[0] ?? null });
    }
    return;
  }
  if (JSON.stringify(writtenRules([rule])) !== JSON.stringify(writtenRules([base]))) {
    editRules(ref, { kind: 'set', rule });
  }
}

/** A text of the open rule typed: the table follows at once, and it is saved a second after the last key. */
export function typeIn(ref: CollectionRef, part: 'name' | 'field' | 'condition', value: string, now: number): void {
  const key = memoryKey(ref);
  change(key, (before) =>
    before.open === undefined ? before : { ...before, open: { ...before.open, [part]: value } },
  );
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  pending = () => {
    saveTyped(ref, now);
  };
  // A new rule is saved as soon as its condition can be used: the table colors by it at once.
  if (part === 'condition' && formattingMemory(key).draft?.id === formattingMemory(key).open?.id) {
    flushTyping();
    return;
  }
  timer = setTimeout(flushTyping, saveDelayMs);
}

/** Opens a rule under its line, or closes the one open; a new rule not saved is dropped when another is opened. */
export function openRule(key: string, rule: FormatRule | undefined, on: 'list' | 'condition' | 'name' = 'list'): void {
  flushTyping();
  change(key, (before) => {
    const kept = rule !== undefined && before.draft?.id === rule.id ? before.draft : undefined;
    const { draft: _draft, open: _open, note: _note, ...rest } = before;
    return {
      ...rest,
      ...(kept === undefined ? {} : { draft: kept }),
      ...(rule === undefined ? {} : { open: openTexts(rule) }),
      // Closing leaves the focus where the caller puts it: on the rule's line.
      focus: rule === undefined ? before.focus : { count: before.focus.count + 1, on },
    };
  });
}

/** A new rule, open with the focus in its condition: saved at once when its condition can be used, else kept here. */
export function addRule(ref: CollectionRef, rule: ConditionRule, now: number): void {
  flushTyping();
  const key = memoryKey(ref);
  const usable = conditionOf(rule.condition, now).ok;
  if (usable) {
    void startOnCollection(ref, 'table.add-format-rule@inspector', { rule: writtenRules([rule])[0] ?? null });
  }
  change(key, (before) => ({
    ...(usable ? {} : { draft: rule }),
    open: openTexts(rule),
    focus: { count: before.focus.count + 1, on: 'condition' },
  }));
}

/** The line of what a change could not do, until the next change. */
export function showNote(key: string, note: string | undefined): void {
  change(key, (before) => {
    const { note: _note, ...rest } = before;
    return note === undefined ? rest : { ...rest, note };
  });
}

/** Asks for the focus on the rules of the view (Go to, `Ctrl+Shift+F`). */
export function focusFormatting(key: string): void {
  change(key, (before) => ({ ...before, focus: { count: before.focus.count + 1, on: 'list' } }));
}

/** Changes the new rule not saved yet: its color chosen, or removed. */
export function changeDraft(key: string, draft: ConditionRule | undefined): void {
  change(key, (before) => {
    const { draft: _draft, ...rest } = before;
    return draft === undefined ? rest : { ...rest, draft };
  });
}

/** Whether a rule is the new rule not saved yet. */
export function isDraftOf(memory: FormattingMemory, id: FormatRuleId): boolean {
  return memory.draft?.id === id;
}
