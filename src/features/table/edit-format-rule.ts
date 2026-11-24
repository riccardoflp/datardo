/**
 * Feature: table.edit-format-rule
 *
 * Changes the rules of a collection in the Formatting view, in place, while the table shows what each change does:
 * the name, the field whose cell is colored, the condition and the color of a rule; turning it off and on; moving it
 * among the collection's rules; removing it. Each change is one app step that saves the collection's rules. Nothing is
 * written to a deployment.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import {
  isFieldRule,
  isFormatScope,
  readFormatRules,
  type FormatRule,
  type FormatRuleId,
  type FormatScope,
} from '../../shared/formatting-rules';
import { isJsonObject } from '../query/mongosh/ejson';
import { conditionOf } from './format-table';
import { placeOfScope, rulesByScope, scopeOfRule, scopesOff } from './format-scopes';
import { saveScopeStep, scopesOffStep } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan, type TableCollection } from './types';

/** A change of the rules of a section, the section the rule of that id is in. */
export type ListChange =
  /** The rule of that id takes these properties: its name, its field, its condition, its color. */
  | { readonly kind: 'set'; readonly rule: FormatRule }
  | { readonly kind: 'enable'; readonly id: FormatRuleId; readonly enabled: boolean }
  /** Moves the rule to the place `to` of the list, from 0. */
  | { readonly kind: 'move'; readonly id: FormatRuleId; readonly to: number }
  /** One place up or down: **Move up**, **Move down**, `Alt+Up`, `Alt+Down`. */
  | { readonly kind: 'step'; readonly id: FormatRuleId; readonly by: -1 | 1 }
  | { readonly kind: 'remove'; readonly id: FormatRuleId };

/** A section's checkbox: the collection leaves the rules of a scope out of its table, or takes them again. */
export interface OffChange {
  readonly kind: 'off';
  readonly scope: FormatScope;
  readonly leftOut: boolean;
}

/** A change made in the Formatting view: of a rule in its section, or of what the collection leaves out. */
export type RuleChange = ListChange | OffChange;

function moved(rules: readonly FormatRule[], from: number, to: number): readonly FormatRule[] | undefined {
  const place = Math.max(0, Math.min(rules.length - 1, to));
  const rule = rules[from];
  if (rule === undefined || place === from) {
    return undefined;
  }
  const rest = rules.filter((_each, index) => index !== from);
  return [...rest.slice(0, place), rule, ...rest.slice(place)];
}

/** A rule turned on (its `enabled` left out) or off. */
function withEnabled(rule: FormatRule, enabled: boolean): FormatRule {
  const { enabled: _was, ...rest } = rule;
  return enabled ? rest : { ...rest, enabled: false };
}

/** The rules after a change, or `undefined` when it changes nothing (an unknown id, the first rule moved up). */
export function editedRules(rules: readonly FormatRule[], change: ListChange): readonly FormatRule[] | undefined {
  const index = rules.findIndex((rule) => rule.id === (change.kind === 'set' ? change.rule.id : change.id));
  const rule = rules[index];
  if (rule === undefined) {
    return undefined;
  }
  switch (change.kind) {
    case 'set':
      return rules.map((each, at) => (at === index ? change.rule : each));
    case 'enable':
      return (rule.enabled !== false) === change.enabled
        ? undefined
        : rules.map((each, at) => (at === index ? withEnabled(each, change.enabled) : each));
    case 'move':
      return moved(rules, index, change.to);
    case 'step':
      return index + change.by < 0 || index + change.by >= rules.length
        ? undefined
        : moved(rules, index, index + change.by);
    case 'remove':
      return rules.filter((_each, at) => at !== index);
  }
}

/** Why a field typed in **Color the cell of** is refused: one that starts with `$`. */
export function fieldProblem(field: string | undefined): string | undefined {
  return field?.trim().startsWith('$') === true ? text.formatting.fieldDollar : undefined;
}

function changeOf(value: Json | undefined): RuleChange | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  if (value['kind'] === 'off') {
    return isFormatScope(value['scope'])
      ? { kind: 'off', scope: value['scope'], leftOut: value['leftOut'] === true }
      : undefined;
  }
  if (value['kind'] !== 'set') {
    return value as unknown as RuleChange;
  }
  const [rule] = readFormatRules([value['rule'] ?? null]).rules;
  return rule === undefined ? undefined : { kind: 'set', rule };
}

/** The refusal of a rule set with a field that starts with `$`, or a condition that cannot be used. */
function refusalOf(change: ListChange, now: number): Outcome | undefined {
  if (change.kind !== 'set') {
    return undefined;
  }
  if (isFieldRule(change.rule)) {
    const field = change.rule.field.trim();
    return field === '' || field.startsWith('$')
      ? refuse('table.edit-format-rule/field', field === '' ? text.fieldRule.fieldEmpty : text.formatting.fieldDollar)
      : undefined;
  }
  if (fieldProblem(change.rule.field) !== undefined) {
    return refuse('table.edit-format-rule/field', text.formatting.fieldDollar);
  }
  const matcher = conditionOf(change.rule.condition, now);
  return matcher.ok ? undefined : refuse('table.edit-format-rule/condition', matcher.message);
}

/** The step of a section's checkbox, or none when the collection already leaves that scope out, or takes it. */
function offPlan(context: Context, where: TableCollection, change: OffChange): Outcome {
  const off = scopesOff(context.state.table.formatting, where);
  const next = change.leftOut ? [...off, change.scope] : off.filter((scope) => scope !== change.scope);
  const changed = off.includes(change.scope) !== change.leftOut;
  return run(
    tablePlan(text.formatting.editTitle, changed ? [scopesOffStep(context, where, { ...change, off: next })] : []),
  );
}

/**
 * Feature: table.edit-format-rule
 *
 * One app step for the change `args.change` of the collection of `args` or of the target: it saves the section the
 * rule is in, `save the formatting rules of Local / shop / orders` (or of the database, of the connection, for
 * everywhere); a section's checkbox leaves its rules out of the collection, or takes them again. None when it changes
 * nothing. A condition that cannot be used is refused (`/condition`), and so is a field that starts with `$`
 * (`/field`): the rule keeps what it had.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const change = changeOf(args['change']);
  if (change === undefined) {
    return run(tablePlan(text.formatting.editTitle, []));
  }
  if (change.kind === 'off') {
    return offPlan(context, where, change);
  }
  const refusal = refusalOf(change, context.now);
  if (refusal !== undefined) {
    return refusal;
  }
  const byScope = rulesByScope(context.state.table.formatting, where);
  const scope = scopeOfRule(byScope, change.kind === 'set' ? change.rule.id : change.id) ?? 'collection';
  const rules = editedRules(byScope[scope], change);
  const steps = rules === undefined ? [] : [saveScopeStep(context, placeOfScope(scope, where), rules)];
  return run(tablePlan(text.formatting.editTitle, steps));
}
