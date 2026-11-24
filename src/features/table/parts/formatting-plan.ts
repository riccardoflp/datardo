/**
 * What the operations of conditional formatting share (`table.add-format-rule`, `table.edit-format-rule`): the
 * collection a rule belongs to, its own rules from the app's state, and the one app step that saves them, `save the
 * formatting rules of Local / shop / orders`, which the main process carries out in `formatting.json`
 * (`table.save-formatting`).
 */
import type { AppStep, Context } from '../../../shared/feature';
import { writtenRules, type FormatRule } from '../../../shared/formatting-rules';
import { collectionRules } from '../format-scopes';
import { text } from '../text';
import { collectionLabel, type TableCollection } from '../types';

/** The collection's own rules, as the app's state holds them now. */
export function ownRules(context: Context, where: TableCollection): readonly FormatRule[] {
  return collectionRules(context.state.table.formatting, where);
}

/** The step that saves a collection's own rules, in their order. */
export function saveRulesStep(context: Context, where: TableCollection, rules: readonly FormatRule[]): AppStep {
  return {
    kind: 'app',
    text: text.formatting.saveStep(collectionLabel(context, where)),
    action: 'table.save-formatting',
    args: { ...where, rules: writtenRules(rules) },
  };
}
