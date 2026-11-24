/**
 * What the controls of the Formatting view (`table.formatting`) do with the rules: a new rule added
 * (`table.add-format-rule`, `table.color-by-field`), a rule changed in its section or a section left out
 * (`table.edit-format-rule`), moved or copied to another section (`table.move-format-rule`), its color chosen; a new
 * rule not saved yet is changed here.
 */
import { isFull, newConditionRule } from '../../features/table/add-format-rule';
import { newFieldRule } from '../../features/table/color-by-field';
import type { RuleChange } from '../../features/table/edit-format-rule';
import type { MoveIntent } from '../../features/table/formatting';
import { text } from '../../features/table/text';
import type { Document } from '../../features/table/types';
import {
  formatScopes,
  isFieldRule,
  type FormatRule,
  type FormatRuleId,
  type PresetColor,
} from '../../shared/formatting-rules';
import type { CollectionRef } from '../query/collection-reads';
import type { CollectionFormatting } from './formatting-rules';
import {
  addFieldRule,
  addRule,
  changeDraft,
  editRules,
  flushTyping,
  openRule,
  showNote,
  typedRule,
} from './formatting-store';
import { startOnCollection } from './table-start';

/** Whether the collection's own rules are as many as they may be: a new rule is then refused, with the line. */
function refusedAsFull(formatting: CollectionFormatting): boolean {
  if (isFull(formatting.saved)) {
    showNote(formatting.key, text.formatting.tooMany);
    return true;
  }
  showNote(formatting.key, undefined);
  return false;
}

/**
 * **Add rule…** › **Condition…**: a new row rule, open, with the focus in its condition; with 100 rules already, the
 * line *A collection keeps at most 100 formatting rules.* in its place.
 */
export function addConditionRule(ref: CollectionRef, formatting: CollectionFormatting, now: number): void {
  if (!refusedAsFull(formatting)) {
    addRule(ref, newConditionRule(crypto.randomUUID(), formatting.saved), now);
  }
}

/** **Add rule…** › **By field…**: a new field rule, open with the focus in **Field**, saved once it has one. */
export function addByField(ref: CollectionRef, formatting: CollectionFormatting, documents: readonly Document[]): void {
  if (!refusedAsFull(formatting)) {
    addFieldRule(
      ref,
      newFieldRule(crypto.randomUUID(), formatting.saved, '', documents),
      'table.color-by-field@inspector',
    );
  }
}

/** Whether a rule is saved in one of the sections. */
export function isSaved(formatting: CollectionFormatting, id: FormatRuleId): boolean {
  return formatScopes.some((scope) => formatting.savedSections[scope].some((rule) => rule.id === id));
}

/** A change of a rule: the line of what it could not do is dropped, and a new rule not saved is changed in place. */
export function changeRule(ref: CollectionRef, formatting: CollectionFormatting, change: RuleChange): void {
  showNote(formatting.key, undefined);
  const draft = formatting.memory.draft;
  const id = change.kind === 'set' ? change.rule.id : change.kind === 'off' ? undefined : change.id;
  if (draft !== undefined && draft.id === id && !isSaved(formatting, id)) {
    if (change.kind === 'remove') {
      changeDraft(formatting.key, undefined);
      openRule(formatting.key, undefined);
    }
    return;
  }
  flushTyping();
  editRules(ref, change);
}

/** A rule moved or copied to another section: **Move to**, **Copy to**, or its line dropped there or on its head. */
export function moveRule(
  ref: CollectionRef,
  formatting: CollectionFormatting,
  move: MoveIntent & { readonly beside?: FormatRuleId; readonly after?: boolean },
): void {
  if (!isSaved(formatting, move.id)) {
    return;
  }
  showNote(formatting.key, undefined);
  flushTyping();
  const started = startOnCollection(ref, 'table.move-format-rule@inspector', {
    id: move.id,
    to: move.to,
    ...(move.copy ? { copy: true } : {}),
    ...(move.beside === undefined ? {} : { beside: move.beside }),
    ...(move.after === true ? { after: true } : {}),
  });
  // A section that is full refuses the rule on the line at the top of the view.
  void started.then((result) => {
    if (result.kind === 'refused') {
      showNote(formatting.key, result.message);
    }
  });
}

/** The color of the open rule chosen. */
export function colorRule(ref: CollectionRef, formatting: CollectionFormatting, color: PresetColor, now: number): void {
  const { open, draft } = formatting.memory;
  const rule = rulesById(formatting, open?.id);
  if (open === undefined || rule === undefined || isFieldRule(rule)) {
    return;
  }
  if (draft?.id === rule.id && !isFieldRule(draft) && !isSaved(formatting, rule.id)) {
    changeDraft(formatting.key, { ...draft, color });
    return;
  }
  flushTyping();
  editRules(ref, { kind: 'set', rule: { ...typedRule(rule, open, now), color } });
}

/** A rule of the sections as typed, by its id. */
export function rulesById(formatting: CollectionFormatting, id: FormatRuleId | undefined): FormatRule | undefined {
  return formatScopes.flatMap((scope) => formatting.sections[scope]).find((rule) => rule.id === id);
}
