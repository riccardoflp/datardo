/**
 * Feature: table.formatting
 *
 * The Formatting view of the inspector island: the formatting rules that reach the active tab's collection, in four
 * sections (this collection, its database, its connection, everywhere), listed, edited in place and turned on and off
 * beside the table, which follows each change. Its head adds a rule, hides or shows formatting, and exports or imports
 * rules; each section has its count and a checkbox that leaves its rules out of this collection; each rule's line has
 * its checkbox, its colors, what it colors, its name or condition, `⚠` when it cannot be used, its menu and **Remove
 * rule**; one rule at a time is open under its line. Nothing it does writes to a deployment.
 */
import {
  formatScopes,
  isFieldRule,
  presetColors,
  type FormatRule,
  type FormatRuleId,
  type FormatScope,
  type PresetColor,
} from '../../shared/formatting-rules';
import { colorLabel } from '../connection/color-presets';
import type { RuleChange } from './edit-format-rule';
import type { FormatPaint } from './format-field';
import type { RulesByScope } from './format-scopes';
import {
  fieldOpenView,
  lineColors,
  type FieldOpenView,
  type OpenFieldTexts,
  type ScaleBar,
} from './parts/field-rule-view';
import { sectionTitle, type SectionNames } from './parts/formatting-plan';
import { oneLineCondition, ruleSummary } from './parts/rule-summary';
import { text } from './text';
import type { Document } from './types';

/** What a rule open under its line holds while it is edited: the texts as typed, which may not be usable yet. */
export interface OpenRule extends Partial<OpenFieldTexts> {
  readonly id: FormatRuleId;
  readonly name: string;
  readonly field: string;
  readonly condition: string;
}

/** What the view is drawn from. */
export interface FormattingState {
  /** The rules of the four sections in their order, as typed; a new rule not saved yet last of the collection's. */
  readonly sections: RulesByScope;
  /** The sections the collection leaves out. */
  readonly off: readonly FormatScope[];
  /** The names the titles of the sections say. */
  readonly names: SectionNames;
  /** The new rule that is not saved yet, until its condition can be used or it has a field. */
  readonly draft?: FormatRuleId;
  /** Why each rule that cannot be used colors nothing (`table.format-table`). */
  readonly problems: ReadonlyMap<FormatRuleId, string>;
  readonly hidden: boolean;
  /** What a change could not do, until the next change: *A collection keeps at most 100 formatting rules.* */
  readonly note?: string;
  readonly open?: OpenRule;
  /** Why the condition typed in the open rule cannot be used: the rule meanwhile colors by its last one that can. */
  readonly typedProblem?: string;
  /** The documents of the page: the legends of field rules, and the fields the table has. */
  readonly documents: readonly Document[];
  /** The time the page was read, which `ISODate()` stands for in an end typed. */
  readonly now: number;
}

/** A rule moved or copied to another section (`table.move-format-rule`). */
export interface MoveIntent {
  readonly id: FormatRuleId;
  readonly to: FormatScope;
  readonly copy: boolean;
}

/** An entry of a menu of the view: its text, its tooltip, and the change it makes or the feature it starts. */
export interface FormattingEntry {
  readonly label: string;
  readonly element: string;
  readonly tip?: string;
  readonly change?: RuleChange;
  readonly move?: MoveIntent;
}

/** A submenu of a rule's `…` menu: **Move to** and **Copy to**. */
export interface FormattingSubmenu {
  readonly label: string;
  readonly tip: string;
  readonly entries: readonly FormattingEntry[];
}

/** A rule's line. */
export interface RuleLine {
  readonly id: FormatRuleId;
  readonly scope: FormatScope;
  readonly enabled: boolean;
  /** The checkbox that turns it on and off: *Turn off* while it is on. */
  readonly toggle: { readonly label: string; readonly change: RuleChange };
  /** Its color, a swatch whose name is the color's: *Red*. */
  readonly swatch?: { readonly color: PresetColor; readonly name: string };
  /** A field rule's colors: the bar of its scale, or the swatches of its first values. */
  readonly bar?: ScaleBar;
  readonly paints?: readonly FormatPaint[];
  /** **Row**, or the field whose cell it colors. */
  readonly target: string;
  /** Its name, or its condition on one line, or `by <field>`. */
  readonly summary: string;
  readonly named: boolean;
  /** Why it cannot be used: `⚠` on its line. */
  readonly problem?: string;
  /** *No \<field\> in this table.*: its line is dimmed. */
  readonly absent?: string;
  readonly tooltip: string;
  readonly menu: {
    readonly label: string;
    readonly entries: readonly FormattingEntry[];
    readonly submenus: readonly FormattingSubmenu[];
  };
  readonly remove: { readonly label: string; readonly change: RuleChange };
  readonly open: boolean;
  readonly draft: boolean;
}

/** A section of the view: its head and its rules. */
export interface SectionView {
  readonly scope: FormatScope;
  readonly title: string;
  readonly tip: string;
  readonly count: string;
  /** The checkbox that leaves its rules out of this collection's table, or takes them again. */
  readonly check: { readonly label: string; readonly checked: boolean; readonly change: RuleChange };
  /** A section without rules is its head alone, dimmed. */
  readonly dimmed: boolean;
  readonly lines: readonly RuleLine[];
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

/** The open rule, under its line: a condition rule's boxes and colors, or a field rule's controls. */
export interface OpenView {
  readonly id: FormatRuleId;
  readonly name: OpenBox;
  readonly field: OpenBox;
  readonly condition: OpenBox;
  readonly colors: {
    readonly label: string;
    readonly swatches: readonly { readonly color: PresetColor; readonly name: string; readonly chosen: boolean }[];
  };
  /** For a field rule, what `table.edit-field-rule` shows in place of the condition and the colors. */
  readonly fieldRule?: FieldOpenView;
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
    readonly more: { readonly label: string; readonly entries: readonly FormattingEntry[] };
  };
  readonly note?: string;
  /** Above the sections when no section has a rule. */
  readonly empty?: string;
  readonly listLabel: string;
  readonly sections: readonly SectionView[];
  /** Every line, the sections' in their order: the keys of the list go through them. */
  readonly lines: readonly RuleLine[];
  readonly open?: OpenView;
}

const editElement = 'table.edit-format-rule@inspector';
const moveElement = 'table.move-format-rule@inspector';

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

function stepEntries(rule: FormatRule, index: number, count: number): readonly FormattingEntry[] {
  const step = (label: string, by: -1 | 1): FormattingEntry => ({
    label,
    element: editElement,
    change: { kind: 'step', id: rule.id, by },
  });
  return [
    ...(index > 0 ? [step(text.formatting.moveUp, -1)] : []),
    ...(index < count - 1 ? [step(text.formatting.moveDown, 1)] : []),
  ];
}

const scopeEntries: Readonly<Record<FormatScope, string>> = {
  collection: text.moves.thisCollection,
  database: text.moves.thisDatabase,
  connection: text.moves.thisConnection,
  global: text.moves.everywhere,
};

/** **Move to** (without the rule's own section) and **Copy to**, each with the four sections. */
function moveSubmenus(rule: FormatRule, scope: FormatScope, names: SectionNames): readonly FormattingSubmenu[] {
  const entries = (copy: boolean): readonly FormattingEntry[] =>
    formatScopes
      .filter((each) => copy || each !== scope)
      .map((to) => ({
        label: scopeEntries[to],
        tip: sectionTitle(to, names),
        element: moveElement,
        move: { id: rule.id, to, copy },
      }));
  return [
    { label: text.moves.moveTo, tip: text.moves.moveToTip, entries: entries(false) },
    { label: text.moves.copyTo, tip: text.moves.copyToTip, entries: entries(true) },
  ];
}

/** Whether no document of the page has the field, through sub-documents and arrays; a page without documents has all. */
function isAbsent(field: string, documents: readonly Document[]): boolean {
  const has = (value: unknown, path: readonly string[]): boolean => {
    const [segment, ...rest] = path;
    if (segment === undefined) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.some((element) => has(element, path));
    }
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.hasOwn(value, segment) &&
      has((value as Record<string, unknown>)[segment], rest)
    );
  };
  return documents.length > 0 && !documents.some((document) => has(document, field.split('.')));
}

function colorsOf(rule: FormatRule, documents: readonly Document[]): Pick<RuleLine, 'swatch' | 'bar' | 'paints'> {
  if (!isFieldRule(rule)) {
    return { swatch: { color: rule.color, name: colorLabel(rule.color) } };
  }
  const colors = lineColors(rule, documents);
  return colors.bar === undefined ? { paints: colors.paints } : { bar: colors.bar, paints: [] };
}

function lineOf(
  state: FormattingState,
  at: { readonly rule: FormatRule; readonly scope: FormatScope; readonly index: number; readonly count: number },
): RuleLine {
  const { rule, scope } = at;
  const enabled = rule.enabled !== false;
  const problem = state.problems.get(rule.id);
  const summary = ruleSummary(rule);
  const absent =
    rule.field !== undefined && rule.field.trim() !== '' && isAbsent(rule.field, state.documents)
      ? rule.field
      : undefined;
  const tooltip = [
    ...(rule.name === undefined ? [] : [rule.name]),
    whatItColors(rule),
    ...(problem === undefined ? [] : [problem]),
    ...(absent === undefined ? [] : [text.formatting.absent(absent)]),
    text.formatting.howTo,
  ].join('\n');
  const target = isFieldRule(rule)
    ? rule.target === 'row'
      ? text.formatting.row
      : rule.field
    : (rule.field ?? text.formatting.row);
  const draft = state.draft === rule.id;
  return {
    id: rule.id,
    scope,
    enabled,
    toggle: {
      label: enabled ? text.formatting.turnOff : text.formatting.turnOn,
      change: { kind: 'enable', id: rule.id, enabled: !enabled },
    },
    ...colorsOf(rule, state.documents),
    target,
    summary,
    named: rule.name !== undefined,
    ...(problem === undefined ? {} : { problem }),
    ...(absent === undefined ? {} : { absent: text.formatting.absent(absent) }),
    tooltip,
    menu: {
      label: text.formatting.more(summary),
      entries: [
        ...stepEntries(rule, at.index, at.count),
        { label: text.formatting.remove, element: editElement, change: { kind: 'remove', id: rule.id } },
      ],
      submenus: draft ? [] : moveSubmenus(rule, scope, state.names),
    },
    remove: { label: text.formatting.removeRule, change: { kind: 'remove', id: rule.id } },
    open: state.open?.id === rule.id,
    draft,
  };
}

const sectionTips: Readonly<Record<FormatScope, string>> = {
  collection: text.sections.collectionTip,
  database: text.sections.databaseTip,
  connection: text.sections.connectionTip,
  global: text.sections.globalTip,
};

function sectionOf(state: FormattingState, scope: FormatScope): SectionView {
  const rules = state.sections[scope];
  const title = sectionTitle(scope, state.names);
  const leftOut = state.off.includes(scope);
  const tip = leftOut ? text.sections.takeAgain : text.sections.leaveOut;
  return {
    scope,
    title,
    tip: sectionTips[scope],
    count: text.sections.count(rules.length),
    check: { label: `${title}: ${tip}`, checked: !leftOut, change: { kind: 'off', scope, leftOut: !leftOut } },
    dimmed: rules.length === 0,
    lines: rules.map((rule, index) => lineOf(state, { rule, scope, index, count: rules.length })),
  };
}

function conditionOpen(state: FormattingState, rule: Extract<FormatRule, { condition: string }>, open: OpenRule) {
  const problem = state.typedProblem ?? state.problems.get(rule.id);
  const fieldProblem = open.field.trim().startsWith('$') ? text.formatting.fieldDollar : undefined;
  return {
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

function openView(state: FormattingState, open: OpenRule): OpenView | undefined {
  const rule = formatScopes.flatMap((scope) => state.sections[scope]).find((each) => each.id === open.id);
  if (rule === undefined) {
    return undefined;
  }
  const name = {
    label: text.formatting.name,
    value: open.name,
    placeholder: isFieldRule(rule)
      ? ruleSummary({ ...rule, name: undefined } as never)
      : rule.condition.trim() === ''
        ? text.formatting.namePlaceholder
        : oneLineCondition(rule.condition),
    tip: text.formatting.nameTip,
  };
  if (!isFieldRule(rule)) {
    return { id: rule.id, name, ...conditionOpen(state, rule, open) };
  }
  const texts: OpenFieldTexts = {
    field: open.field,
    ...(open.min === undefined ? {} : { min: open.min }),
    ...(open.max === undefined ? {} : { max: open.max }),
    pin: open.pin ?? '',
    ...(open.pinning === undefined ? {} : { pinning: open.pinning }),
    ...(open.pinProblem === undefined ? {} : { pinProblem: open.pinProblem }),
  };
  const fieldRule = fieldOpenView(rule, texts, { documents: state.documents, now: state.now });
  return {
    id: rule.id,
    name,
    field: fieldRule.field,
    condition: { label: '', value: '', placeholder: '' },
    colors: { label: '', swatches: [] },
    fieldRule,
  };
}

/**
 * Feature: table.formatting
 *
 * The head (**Add rule…** with **Condition…** and **By field…**, **Hide formatting** or **Show formatting**, `…` with
 * **Export formatting…** and **Import formatting…**), the line of what a change could not do, *No formatting rules. …*
 * when no section has a rule, then the four sections with their rules; and the open rule.
 */
export function view(state: FormattingState): FormattingView {
  const open = state.open === undefined ? undefined : openView(state, state.open);
  const sections = formatScopes.map((scope) => sectionOf(state, scope));
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
          {
            label: text.formatting.byFieldEntry,
            tip: text.formatting.byFieldTip,
            element: 'table.color-by-field@inspector',
          },
        ],
      },
      toggle: {
        label: state.hidden ? text.formatting.show : text.formatting.hide,
        tip: state.hidden ? text.formatting.showTip : text.formatting.hideTip,
        element: 'table.toggle-formatting@inspector',
        hidden: state.hidden,
      },
      more: {
        label: text.formatting.moreHead,
        entries: [
          { label: text.exportFile.entry, tip: text.exportFile.tip, element: 'table.export-formatting@inspector' },
          { label: text.importFile.entry, tip: text.importFile.tip, element: 'table.import-formatting@inspector' },
        ],
      },
    },
    ...(state.note === undefined ? {} : { note: state.note }),
    ...(sections.every((section) => section.lines.length === 0) ? { empty: text.formatting.none } : {}),
    listLabel: text.formatting.list,
    sections,
    lines: sections.flatMap((section) => section.lines),
    ...(open === undefined ? {} : { open }),
  };
}
