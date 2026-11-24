/**
 * Feature: table.color-by-field
 *
 * Adds a field rule that colors the table by the values of one field, with no condition to write: **Color by this
 * field** in the menu of a column header, **Add rule…** › **By field…** in the Formatting view, and Go to on the column
 * of the selected cell. Nothing is asked: the window shows the new rule open in the Formatting view, proposed by
 * {@link newFieldRule}, and starts this feature once the rule has a field, which saves it last in the collection's
 * rules. Nothing is written to a deployment, so it works on a view, through a read-only connection and in
 * **Aggregate**.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import {
  isFieldRule,
  readFormatRules,
  type FieldRule,
  type FormatRule,
  type FormatRuleId,
} from '../../shared/formatting-rules';
import { isFull } from './add-format-rule';
import { fieldOnPage } from './format-field';
import { ownRules, saveRulesStep } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan, type Document } from './types';

/** Why the field of a field rule is refused: empty, or starting with `$` (`/field`); none when it can be used. */
export function fieldRuleProblem(field: string): string | undefined {
  const trimmed = field.trim();
  if (trimmed === '') {
    return text.fieldRule.fieldEmpty;
  }
  return trimmed.startsWith('$') ? text.formatting.fieldDollar : undefined;
}

/**
 * A field rule whose ends it does not have are taken from the page when the page makes it a scale, so that a value
 * keeps its color on the next page; any other rule as it is.
 */
export function withPageEnds(rule: FieldRule, documents: readonly Document[]): FieldRule {
  if (rule.field.trim() === '' || (rule.min !== undefined && rule.max !== undefined)) {
    return rule;
  }
  const page = fieldOnPage(rule, documents);
  if (page.mode !== 'scale' || page.min === undefined || page.max === undefined) {
    return rule;
  }
  return { ...rule, min: rule.min ?? page.min, max: rule.max ?? page.max };
}

/**
 * The new field rule the Formatting view opens: `auto`, for the field given (empty with **By field…**); the first
 * field rule of the collection's rules colors the row, the next ones their cell; a scale takes its ends from the page.
 */
export function newFieldRule(
  id: FormatRuleId,
  rules: readonly FormatRule[],
  field: string,
  documents: readonly Document[],
): FieldRule {
  const target = rules.some(isFieldRule) ? 'cell' : 'row';
  return withPageEnds({ id, kind: 'field', field, target, mode: 'auto' }, documents);
}

/** The rule of `args.rule`, when it is a field rule. */
function ruleOf(value: Json | undefined): FieldRule | undefined {
  const [rule] = readFormatRules(value === undefined ? [] : [value]).rules;
  return rule !== undefined && isFieldRule(rule) ? rule : undefined;
}

/**
 * Feature: table.color-by-field
 *
 * One app step that saves the collection's rules with the field rule `args.rule` last, `save the formatting rules of
 * Local / shop / orders`; the collection is that of `args` or of the target. Refused for the 101st rule (`/too-many`)
 * and for a field that is empty or starts with `$` (`/field`). A rule already there by its id is replaced in its
 * place.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  // A field rule whose field is empty is not read at all: it is refused as one.
  const rule = ruleOf(args['rule']);
  const problem = fieldRuleProblem(rule?.field ?? '');
  if (rule === undefined || problem !== undefined) {
    return refuse('table.color-by-field/field', problem ?? text.fieldRule.fieldEmpty);
  }
  const rules = ownRules(context, where);
  const there = rules.some((each) => each.id === rule.id);
  if (!there && isFull(rules)) {
    return refuse('table.color-by-field/too-many', text.formatting.tooMany);
  }
  const saved = there ? rules.map((each) => (each.id === rule.id ? rule : each)) : [...rules, rule];
  return run(tablePlan(text.fieldRule.addTitle, [saveRulesStep(context, where, saved)]));
}
