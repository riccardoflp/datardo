/**
 * Feature: table.formatting
 *
 * The Formatting view of the inspector island: the formatting rules of the active tab's collection, listed, edited in
 * place and turned on and off beside the table, which follows each change. Its head adds a rule and hides or shows
 * formatting; each rule's line has its checkbox, its swatch, what it colors, its name or condition, `⚠` when it cannot
 * be used, its menu and **Remove rule**; one rule at a time is open under its line, with its name, its field, its
 * condition and its color. Nothing it does writes to a deployment.
 */
import {
  isFieldRule,
  presetColors,
  type FormatRule,
  type FormatRuleId,
  type PresetColor,
} from '../../shared/formatting-rules';
import { colorLabel } from '../connection/color-presets';
import type { RuleChange } from './edit-format-rule';
import { oneLineCondition, ruleSummary } from './parts/rule-summary';
import { text } from './text';

/** What a rule open under its line holds while it is edited: the texts as typed, which may not be usable yet. */
export interface OpenRule {
  readonly id: FormatRuleId;
  readonly name: string;
  readonly field: string;
  readonly condition: string;
}

/** What the view is drawn from. */
export interface FormattingState {
  /** The collection's own rules in their order, a new rule not saved yet last. */
  readonly rules: readonly FormatRule[];
  /** The new rule that is not saved yet, until its condition can be used. */
  readonly draft?: FormatRuleId;
  /** Why each rule that cannot be used colors nothing (`table.format-table`). */
  readonly problems: ReadonlyMap<FormatRuleId, string>;
  readonly hidden: boolean;
  /** What a change could not do, until the next change: *A collection keeps at most 100 formatting rules.* */
  readonly note?: string;
  readonly open?: OpenRule;
  /** Why the condition typed in the open rule cannot be used: the rule meanwhile colors by its last one that can. */
  readonly typedProblem?: string;
}

/** An entry of a menu of the view: its text, its tooltip, and the change it makes or the feature it starts. */
export interface FormattingEntry {
  readonly label: string;
  readonly element: string;
  readonly tip?: string;
  readonly change?: RuleChange;
}

/** A rule's line. */
export interface RuleLine {
  readonly id: FormatRuleId;
  readonly enabled: boolean;
  /** The checkbox that turns it on and off: *Turn off* while it is on. */
  readonly toggle: { readonly label: string; readonly change: RuleChange };
  /** Its color, a swatch whose name is the color's: *Red*. */
  readonly swatch?: { readonly color: PresetColor; readonly name: string };
  /** **Row**, or the field whose cell it colors. */
  readonly target: string;
  /** Its name, or its condition on one line, or `by <field>`. */
  readonly summary: string;
  readonly named: boolean;
  /** Why it cannot be used: `⚠` on its line. */
  readonly problem?: string;
  readonly tooltip: string;
  readonly menu: { readonly label: string; readonly entries: readonly FormattingEntry[] };
  readonly remove: { readonly label: string; readonly change: RuleChange };
  readonly open: boolean;
  readonly draft: boolean;
}

/** A labelled box of the open rule. */
export interface OpenBox {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly tip?: string;
  /** Why what is typed is refused, under the box. */
  readonly problem?: string;
}

/** The open rule, under its line. */
export interface OpenView {
  readonly id: FormatRuleId;
  readonly name: OpenBox;
  readonly field: OpenBox;
  readonly condition: OpenBox;
  readonly colors: {
    readonly label: string;
    readonly swatches: readonly { readonly color: PresetColor; readonly name: string; readonly chosen: boolean }[];
  };
}

/** What the view shows. */
export interface FormattingView {
  readonly head: {
    readonly add: { readonly label: string; readonly entries: readonly FormattingEntry[] };
    readonly toggle: {
      readonly label: string;
      readonly tip: string;
      readonly element: string;
      readonly hidden: boolean;
    };
  };
  readonly note?: string;
  /** In place of the rules when there is none. */
  readonly empty?: string;
  readonly listLabel: string;
  readonly lines: readonly RuleLine[];
  readonly open?: OpenView;
}

const editElement = 'table.edit-format-rule@inspector';

/** What a rule colors and when, for its tooltip: *The row when the document matches { status: "failed" }*. */
function whatItColors(rule: FormatRule): string {
  if (isFieldRule(rule)) {
    return rule.target === 'row'
      ? text.formatting.rowByTip(rule.field)
      : text.formatting.cellByTip(rule.field, rule.field);
  }
  const condition = oneLineCondition(rule.condition);
  return rule.field === undefined ? text.formatting.rowTip(condition) : text.formatting.cellTip(rule.field, condition);
}

function menuOf(rule: FormatRule, index: number, count: number): readonly FormattingEntry[] {
  return [
    ...(index > 0
      ? [
          {
            label: text.formatting.moveUp,
            element: editElement,
            change: { kind: 'step', id: rule.id, by: -1 },
          } as const,
        ]
      : []),
    ...(index < count - 1
      ? [
          {
            label: text.formatting.moveDown,
            element: editElement,
            change: { kind: 'step', id: rule.id, by: 1 },
          } as const,
        ]
      : []),
    { label: text.formatting.remove, element: editElement, change: { kind: 'remove', id: rule.id } },
  ];
}

function lineOf(state: FormattingState, rule: FormatRule, index: number): RuleLine {
  const enabled = rule.enabled !== false;
  const problem = state.problems.get(rule.id);
  const summary = ruleSummary(rule);
  const tooltip = [
    ...(rule.name === undefined ? [] : [rule.name]),
    whatItColors(rule),
    ...(problem === undefined ? [] : [problem]),
    text.formatting.howTo,
  ].join('\n');
  const target = isFieldRule(rule)
    ? rule.target === 'row'
      ? text.formatting.row
      : rule.field
    : (rule.field ?? text.formatting.row);
  return {
    id: rule.id,
    enabled,
    toggle: {
      label: enabled ? text.formatting.turnOff : text.formatting.turnOn,
      change: { kind: 'enable', id: rule.id, enabled: !enabled },
    },
    ...(isFieldRule(rule) ? {} : { swatch: { color: rule.color, name: colorLabel(rule.color) } }),
    target,
    summary,
    named: rule.name !== undefined,
    ...(problem === undefined ? {} : { problem }),
    tooltip,
    menu: { label: text.formatting.more(summary), entries: menuOf(rule, index, state.rules.length) },
    remove: { label: text.formatting.removeRule, change: { kind: 'remove', id: rule.id } },
    open: state.open?.id === rule.id,
    draft: state.draft === rule.id,
  };
}

function openView(state: FormattingState, open: OpenRule): OpenView | undefined {
  const rule = state.rules.find((each) => each.id === open.id);
  if (rule === undefined || isFieldRule(rule)) {
    return undefined;
  }
  const problem = state.typedProblem ?? state.problems.get(rule.id);
  const fieldProblem = open.field.trim().startsWith('$') ? text.formatting.fieldDollar : undefined;
  return {
    id: rule.id,
    name: {
      label: text.formatting.name,
      value: open.name,
      placeholder: rule.condition.trim() === '' ? text.formatting.namePlaceholder : oneLineCondition(rule.condition),
      tip: text.formatting.nameTip,
    },
    field: {
      label: text.formatting.cellOf,
      value: open.field,
      placeholder: text.formatting.cellOfPlaceholder,
      tip: text.formatting.cellOfTip,
      ...(fieldProblem === undefined ? {} : { problem: fieldProblem }),
    },
    condition: {
      label: text.formatting.matches,
      value: open.condition,
      placeholder: text.formatting.matchesPlaceholder,
      ...(problem === undefined ? {} : { problem }),
    },
    colors: {
      label: text.formatting.color,
      swatches: presetColors.map((color) => ({ color, name: colorLabel(color), chosen: color === rule.color })),
    },
  };
}

/**
 * Feature: table.formatting
 *
 * The head (**Add rule…** with **Condition…**, **Hide formatting** or **Show formatting**), the line of what a change
 * could not do, then the collection's rules in their order, or *No formatting rules. …* when there is none; and the
 * open rule. The problem shown under the open rule's condition is that of the text typed, which the state gives.
 */
export function view(state: FormattingState): FormattingView {
  const open = state.open === undefined ? undefined : openView(state, state.open);
  return {
    head: {
      add: {
        label: text.formatting.addRule,
        entries: [
          {
            label: text.formatting.condition,
            tip: text.formatting.conditionTip,
            element: 'table.add-format-rule@inspector',
          },
        ],
      },
      toggle: {
        label: state.hidden ? text.formatting.show : text.formatting.hide,
        tip: state.hidden ? text.formatting.showTip : text.formatting.hideTip,
        element: 'table.toggle-formatting@inspector',
        hidden: state.hidden,
      },
    },
    ...(state.note === undefined ? {} : { note: state.note }),
    ...(state.rules.length === 0 ? { empty: text.formatting.none } : {}),
    listLabel: text.formatting.list,
    lines: state.rules.map((rule, index) => lineOf(state, rule, index)),
    ...(open === undefined ? {} : { open }),
  };
}
