/**
 * The window's own memory of the Formatting view (`table.formatting`), by collection: the rule open under its line
 * with its texts as typed, a new rule not saved yet (`table.add-format-rule`, `table.color-by-field`), the line of what
 * a change could not do, and the focus asked for. The rules themselves are the app's state (`formatting.json`); what
 * is typed is saved one second after the last key, when the box is left or with `Enter` (`table.edit-format-rule`,
 * `table.edit-field-rule`), and the table follows at each key: {@link shownSections} gives the rules as typed, each
 * with its last condition that can be used.
 */
import { useSyncExternalStore } from 'react';
import {
  formatScopes,
  isFieldRule,
  writtenRules,
  type ConditionRule,
  type FieldRule,
  type FormatRule,
  type FormatRuleId,
} from '../../shared/formatting-rules';
import type { Json } from '../../shared/engine-request';
import { fieldRuleProblem, withPageEnds } from '../../features/table/color-by-field';
import type { RuleChange } from '../../features/table/edit-format-rule';
import { fieldProblem } from '../../features/table/edit-format-rule';
import { editedFieldRule, endOfText, isFieldRefusal, type FieldChange } from '../../features/table/edit-field-rule';
import { rulesByScope, type RulesByScope } from '../../features/table/format-scopes';
import { conditionOf } from '../../features/table/format-table';
import type { OpenRule } from '../../features/table/formatting';
import type { CollectionRef } from '../query/collection-reads';
import { collectionOf } from '../query/collection-store';
import { currentAppState } from '../state/store';
import { startOnCollection } from './table-start';

/** How long after the last key what is typed is saved, in ms (`table.edit-format-rule`, Datardo's choice). */
export const saveDelayMs = 1000;

/** Where the focus goes in the view: the rules, or a box of the open rule. */
export type FocusOn = 'list' | 'condition' | 'name' | 'field';

/** What the window keeps of the Formatting view of one collection. */
export interface FormattingMemory {
  readonly open?: OpenRule;
  /** The new rule not saved yet: shown open, last of the collection's, until its condition can be used or it has a field. */
  readonly draft?: FormatRule;
  readonly note?: string;
  /** Each request to move the focus into the view, with where. */
  readonly focus: { readonly count: number; readonly on: FocusOn };
}

/** A box of the open rule whose text is typed. */
export type TypedPart = 'name' | 'field' | 'condition' | 'min' | 'max' | 'pin';

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

/** The texts of a rule as the open rule starts with them; the ends of a field rule show the rule's until typed. */
export function openTexts(rule: FormatRule): OpenRule {
  return {
    id: rule.id,
    name: rule.name ?? '',
    field: isFieldRule(rule) ? rule.field : (rule.field ?? ''),
    condition: isFieldRule(rule) ? '' : rule.condition,
    ...(isFieldRule(rule) ? { pin: '' } : {}),
  };
}

function withName<Rule extends FormatRule>(rule: Rule, typed: string): Rule {
  const name = typed.trim();
  const { name: _name, ...rest } = rule;
  return (name === '' ? rest : { ...rest, name: name.slice(0, 200) }) as Rule;
}

/**
 * A condition rule with the texts typed: the name trimmed, the field unless it starts with `$`, the condition when it
 * can be used, else the rule's last one that can.
 */
export function typedRule(rule: ConditionRule, open: OpenRule, now: number): ConditionRule {
  const field = fieldProblem(open.field) === undefined ? open.field.trim() : (rule.field ?? '');
  const usable = conditionOf(open.condition, now).ok;
  const { field: _field, ...rest } = withName(rule, open.name);
  return {
    ...rest,
    condition: usable ? open.condition : rule.condition,
    ...(field === '' ? {} : { field }),
  };
}

/** A field rule with the texts typed: the name, the field when it can be used, the ends when they can. */
export function typedFieldRule(rule: FieldRule, open: OpenRule, now: number): FieldRule {
  let typed = withName(rule, open.name);
  if (open.field.trim() !== rule.field && fieldRuleProblem(open.field) === undefined) {
    const changed = editedFieldRule(typed, { kind: 'field', field: open.field }, now);
    typed = isFieldRefusal(changed) ? typed : changed;
  }
  for (const end of ['min', 'max'] as const) {
    const written = open[end];
    const value = written === undefined ? undefined : endOfText(written, now);
    if (written !== undefined && (value === null || typeof value === 'number')) {
      const changed = editedFieldRule(typed, { kind: 'end', end, text: written }, now);
      typed = isFieldRefusal(changed) ? typed : changed;
    }
  }
  return typed;
}

/** A rule with what is typed in it while it is open. */
function asTyped(rule: FormatRule, open: OpenRule | undefined, now: number): FormatRule {
  if (open === undefined || open.id !== rule.id) {
    return rule;
  }
  return isFieldRule(rule) ? typedFieldRule(rule, open, now) : typedRule(rule, open, now);
}

/**
 * The rules the view lists and the table colors by, section by section: as saved, the open one as typed, and the new
 * rule not saved yet last of the collection's; and the problem of the condition typed in the open rule.
 */
export function shownSections(
  saved: RulesByScope,
  memory: FormattingMemory,
  now: number,
): { readonly sections: RulesByScope; readonly typedProblem?: string } {
  const { open, draft } = memory;
  const all = formatScopes.flatMap((scope) => saved[scope]);
  const pending = draft !== undefined && !all.some((rule) => rule.id === draft.id) ? [draft] : [];
  const typed = (rules: readonly FormatRule[]): readonly FormatRule[] => rules.map((rule) => asTyped(rule, open, now));
  const sections: RulesByScope = {
    collection: typed([...saved.collection, ...pending]),
    database: typed(saved.database),
    connection: typed(saved.connection),
    global: typed(saved.global),
  };
  const rule = [...all, ...pending].find((each) => each.id === open?.id);
  const condition =
    open === undefined || rule === undefined || isFieldRule(rule) ? undefined : conditionOf(open.condition, now);
  return condition === undefined || condition.ok ? { sections } : { sections, typedProblem: condition.message };
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

/** The change as the arguments of `table.edit-format-rule` carry it. */
function changeArgs(change: RuleChange): Json {
  switch (change.kind) {
    case 'set':
      return { kind: 'set', rule: writtenRules([change.rule])[0] ?? null };
    case 'off':
      return { kind: 'off', scope: change.scope, leftOut: change.leftOut };
    case 'enable':
      return { kind: 'enable', id: change.id, enabled: change.enabled };
    case 'move':
      return { kind: 'move', id: change.id, to: change.to };
    case 'step':
      return { kind: 'step', id: change.id, by: change.by };
    case 'remove':
      return { kind: 'remove', id: change.id };
  }
}

/** Starts a change of the rules of a section, or of what the collection leaves out (`table.edit-format-rule`). */
export function editRules(ref: CollectionRef, change: RuleChange): void {
  void startOnCollection(ref, 'table.edit-format-rule@inspector', { change: changeArgs(change) });
}

/** Starts a change of a field rule (`table.edit-field-rule`). */
export function editFieldRule(ref: CollectionRef, id: FormatRuleId, fieldChange: FieldChange): void {
  void startOnCollection(ref, 'table.edit-field-rule@inspector', {
    id,
    change: JSON.parse(JSON.stringify(fieldChange)) as Json,
  });
}

/** The rules of the four sections as saved now. */
export function savedSections(ref: CollectionRef): RulesByScope {
  const { connection, database, collection } = ref;
  return rulesByScope(currentAppState().table.formatting, { connection, database, collection });
}

function savedRule(ref: CollectionRef, id: FormatRuleId): FormatRule | undefined {
  const sections = savedSections(ref);
  return formatScopes.flatMap((scope) => sections[scope]).find((rule) => rule.id === id);
}

/** Saves a new field rule once it has a field: `table.color-by-field`, with the ends of the page for a scale. */
function saveFieldDraft(ref: CollectionRef, draft: FieldRule, open: OpenRule, now: number): void {
  if (fieldRuleProblem(open.field) !== undefined) {
    return;
  }
  const rule = withPageEnds(
    typedFieldRule({ ...draft, field: open.field.trim() }, open, now),
    collectionOf(ref.tab).documents,
  );
  void startOnCollection(ref, 'table.color-by-field@inspector', { rule: writtenRules([rule])[0] ?? null });
}

/** Saves what is typed in a field rule: its name by an edit, its field and its ends by `table.edit-field-rule`. */
function saveTypedField(
  ref: CollectionRef,
  base: FieldRule,
  typed: { readonly open: OpenRule; readonly part: TypedPart; readonly now: number },
): void {
  const { open, part, now } = typed;
  switch (part) {
    case 'name':
      if ((base.name ?? '') !== open.name.trim()) {
        editRules(ref, { kind: 'set', rule: withName(base, open.name) });
      }
      return;
    case 'field':
      if (open.field.trim() !== base.field && fieldRuleProblem(open.field) === undefined) {
        editFieldRule(ref, base.id, { kind: 'field', field: open.field });
      }
      return;
    case 'min':
    case 'max': {
      const written = open[part];
      const value = written === undefined ? undefined : endOfText(written, now);
      if (
        written !== undefined &&
        (value === null || typeof value === 'number') &&
        (value ?? undefined) !== base[part]
      ) {
        editFieldRule(ref, base.id, { kind: 'end', end: part, text: written });
      }
      return;
    }
    case 'condition':
    case 'pin':
      return;
  }
}

/** Saves a rule as typed: a new rule once it can be used, another by an edit. */
function saveTyped(ref: CollectionRef, part: TypedPart, now: number): void {
  const key = memoryKey(ref);
  const { open, draft } = formattingMemory(key);
  if (open === undefined) {
    return;
  }
  const saved = savedRule(ref, open.id);
  const isDraft = draft?.id === open.id && saved === undefined;
  const base = isDraft ? draft : saved;
  if (base === undefined) {
    return;
  }
  if (isFieldRule(base)) {
    if (isDraft) {
      saveFieldDraft(ref, base, open, now);
    } else {
      saveTypedField(ref, base, { open, part, now });
    }
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
export function typeIn(ref: CollectionRef, part: TypedPart, value: string, now: number): void {
  const key = memoryKey(ref);
  change(key, (before) => {
    if (before.open === undefined) {
      return before;
    }
    const { pinProblem: _problem, ...open } = before.open;
    return { ...before, open: { ...(part === 'pin' ? open : before.open), [part]: value } };
  });
  if (part === 'pin') {
    return;
  }
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  pending = () => {
    saveTyped(ref, part, now);
  };
  // A new condition rule is saved as soon as its condition can be used: the table colors by it at once.
  if (part === 'condition' && formattingMemory(key).draft?.id === formattingMemory(key).open?.id) {
    flushTyping();
    return;
  }
  timer = setTimeout(flushTyping, saveDelayMs);
}

/** Forgets the ends typed in the open rule, so that its boxes show the rule's: after a change that sets them. */
function forgetEnds(key: string): void {
  change(key, (before) => {
    if (before.open === undefined || (before.open.min === undefined && before.open.max === undefined)) {
      return before;
    }
    const { min: _min, max: _max, ...open } = before.open;
    return { ...before, open };
  });
}

/**
 * A change of the open field rule from one of its controls: refused in place when **Pin a value…** cannot read the
 * value, else started; the value typed is then cleared, and the ends typed forgotten when the change sets them.
 */
export function changeOpenField(ref: CollectionRef, id: FormatRuleId, fieldChange: FieldChange, now: number): void {
  flushTyping();
  const key = memoryKey(ref);
  const rule = savedRule(ref, id);
  if (rule === undefined || !isFieldRule(rule)) {
    return;
  }
  const edited = editedFieldRule(rule, fieldChange, now);
  if (isFieldRefusal(edited)) {
    change(key, (before) =>
      before.open === undefined ? before : { ...before, open: { ...before.open, pinProblem: edited.message } },
    );
    return;
  }
  if (['mode', 'from-page', 'field', 'scale'].includes(fieldChange.kind)) {
    forgetEnds(key);
  }
  if (fieldChange.kind === 'pin-value' || fieldChange.kind === 'pin' || fieldChange.kind === 'unpin') {
    change(key, (before) => {
      if (before.open === undefined) {
        return before;
      }
      const { pinning: _pinning, pinProblem: _problem, ...open } = before.open;
      return { ...before, open: fieldChange.kind === 'pin-value' ? { ...open, pin: '' } : open };
    });
  }
  editFieldRule(ref, id, fieldChange);
}

/** Shows the eleven presets under a value of the legend, or hides them. */
export function pinningValue(key: string, value: string | undefined): void {
  change(key, (before) => {
    if (before.open === undefined) {
      return before;
    }
    const { pinning: _pinning, ...open } = before.open;
    return {
      ...before,
      open: value === undefined || before.open.pinning === value ? open : { ...open, pinning: value },
    };
  });
}

/** Opens a rule under its line, or closes the one open; a new rule not saved is dropped when another is opened. */
export function openRule(key: string, rule: FormatRule | undefined, on: FocusOn = 'list'): void {
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

/** A new condition rule, open with the focus in its condition: saved at once when its condition can be used. */
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

/**
 * A new field rule, open: saved at once when it has a field (**Color by this field**), with the focus on its line;
 * else kept here with the focus in **Field** (**By field…**) until a field is typed.
 */
export function addFieldRule(ref: CollectionRef, rule: FieldRule, element: string): void {
  flushTyping();
  const key = memoryKey(ref);
  const usable = fieldRuleProblem(rule.field) === undefined;
  if (usable) {
    void startOnCollection(ref, element, { rule: writtenRules([rule])[0] ?? null });
  }
  change(key, (before) => ({
    ...(usable ? {} : { draft: rule }),
    open: openTexts(rule),
    focus: { count: before.focus.count + 1, on: usable ? 'list' : 'field' },
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
export function changeDraft(key: string, draft: FormatRule | undefined): void {
  change(key, (before) => {
    const { draft: _draft, ...rest } = before;
    return draft === undefined ? rest : { ...rest, draft };
  });
}

/** Whether a rule is the new rule not saved yet. */
export function isDraftOf(memory: FormattingMemory, id: FormatRuleId): boolean {
  return memory.draft?.id === id;
}
