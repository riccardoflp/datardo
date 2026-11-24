/**
 * Feature: table.add-format-rule
 *
 * Adds a rule that colors the rows, or one field's cells, of the documents matching a condition. Nothing is asked in a
 * dialog: the window shows the new rule open in the Formatting view (`table.formatting`), proposed by
 * {@link newConditionRule}, and starts this feature once its condition can be used, which saves it last in the
 * collection's rules. Nothing is written to a deployment, so it works on a view, through a read-only connection and
 * in **Aggregate**.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import {
  isFieldRule,
  mostFormattingRules,
  presetColors,
  readFormatRules,
  type ConditionRule,
  type FormatRule,
  type FormatRuleId,
  type PresetColor,
} from '../../shared/formatting-rules';
import { keyText } from '../query/format';
import { copiedValue } from './copy-value';
import { conditionOf } from './format-table';
import { ownRules, saveRulesStep } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan } from './types';

/**
 * The color of a new condition rule: the first of the eleven presets, in their order, that no condition rule reaching
 * the collection uses yet; red when all of them are used.
 */
export function unusedColor(rules: readonly FormatRule[]): PresetColor {
  const used = new Set(rules.flatMap((rule) => (isFieldRule(rule) ? [] : [rule.color])));
  return presetColors.find((color) => !used.has(color)) ?? 'red';
}

/**
 * The condition **Format cells…** proposes for a field: `{ <field>: <the value> }` with the value of the selected cell
 * of its column as **Copy value** writes it (`table.copy-value`), else `{ <field>: { $exists: true } }`.
 */
export function proposedCondition(field: string, value: Json | undefined): string {
  const condition = value === undefined ? '{ $exists: true }' : copiedValue(value);
  return `{ ${keyText(field)}: ${condition} }`;
}

/** What **Format cells…** starts from: the column's field, and the value of the selected cell when it is of that column. */
export interface FormatCells {
  readonly field: string;
  readonly value?: Json;
}

/**
 * The new rule the Formatting view opens: a row rule with an empty condition (**Add rule…** › **Condition…**), or the
 * cell of a field with its proposed condition (**Format cells…**), in the first color no rule uses.
 */
export function newConditionRule(id: FormatRuleId, rules: readonly FormatRule[], cells?: FormatCells): ConditionRule {
  const color = unusedColor(rules);
  if (cells === undefined) {
    return { id, condition: '', color };
  }
  return { id, condition: proposedCondition(cells.field, cells.value), field: cells.field, color };
}

/** Whether a collection keeps as many rules as it may: a rule more is refused (`/too-many`). */
export function isFull(rules: readonly FormatRule[]): boolean {
  return rules.length >= mostFormattingRules;
}

/** The rule of `args.rule`, when it is a condition rule. */
function ruleOf(value: Json | undefined): ConditionRule | undefined {
  const [rule] = readFormatRules(value === undefined ? [] : [value]).rules;
  return rule === undefined || isFieldRule(rule) ? undefined : rule;
}

/**
 * Feature: table.add-format-rule
 *
 * One app step that saves the collection's rules with `args.rule` last, `save the formatting rules of Local / shop /
 * orders`; the collection is that of `args` or of the target. Refused for the 101st rule (`/too-many`) and for a
 * condition that cannot be used (`/condition`), with the message of `table.format-table`. A rule already there by its
 * id is replaced in its place.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const rule = ruleOf(args['rule']);
  if (rule === undefined) {
    return refuse('table.add-format-rule/condition', text.match.empty);
  }
  const rules = ownRules(context, where);
  const there = rules.some((each) => each.id === rule.id);
  if (!there && isFull(rules)) {
    return refuse('table.add-format-rule/too-many', text.formatting.tooMany);
  }
  const matcher = conditionOf(rule.condition, context.now);
  if (!matcher.ok) {
    return refuse('table.add-format-rule/condition', matcher.message);
  }
  const saved = there ? rules.map((each) => (each.id === rule.id ? rule : each)) : [...rules, rule];
  return run(tablePlan(text.formatting.addTitle, [saveRulesStep(context, where, saved)]));
}
