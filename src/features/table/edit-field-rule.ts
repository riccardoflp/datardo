/**
 * Feature: table.edit-field-rule
 *
 * Chooses what a field rule colors and how, in place in its open rule of the Formatting view: the field, the row or
 * the cell, the kind of coloring, the colors and the ends of a scale, the values pinned to a color and the palette of
 * the others. Each change is one app step that saves the section the rule is in; the table and the legend follow at
 * once. Nothing is written to a deployment.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import {
  isFieldRule,
  isPresetColor,
  mostPinnedValues,
  type FieldRule,
  type FieldTarget,
  type PresetColor,
} from '../../shared/formatting-rules';
import { isJsonObject } from '../query/mongosh/ejson';
import { idOfTime, parsedValue } from '../query/parse';
import { fieldRuleProblem } from './color-by-field';
import { scalarOf, valueColors, valueText } from './format-field';
import { placeOfScope, rulesByScope, scopeOfRule } from './format-scopes';
import { saveScopeStep } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan } from './types';

/** The kinds of scale **Scale** offers: one color growing stronger, or two through yellow. */
export type ScaleKind = 'one' | 'red-green' | 'green-red';

/** The two scales between two colors. */
const twoColorScales = {
  'red-green': { from: 'red', to: 'green' },
  'green-red': { from: 'green', to: 'red' },
} as const;

/** The kind of a rule's scale, as **Scale** shows it. */
export function scaleKindOf(rule: FieldRule): ScaleKind {
  const { from, to } = rule.scale ?? { to: 'blue' };
  if (from === 'red' && to === 'green') {
    return 'red-green';
  }
  return from === 'green' && to === 'red' ? 'green-red' : 'one';
}

/** The ends of a scale as the page gives them, which **From this page** and a change of the mode take. */
export interface PageEnds {
  readonly min?: number;
  readonly max?: number;
}

/** A change of an open field rule. */
export type FieldChange =
  | { readonly kind: 'field'; readonly field: string }
  | { readonly kind: 'target'; readonly target: FieldTarget }
  /** **As**: the ends of the page are taken when the rule has none and the page makes it a scale. */
  | { readonly kind: 'mode'; readonly mode: FieldRule['mode']; readonly ends?: PageEnds }
  | { readonly kind: 'swap' }
  | { readonly kind: 'scale'; readonly scale: ScaleKind }
  | { readonly kind: 'scale-color'; readonly color: PresetColor }
  /** An end typed in mongosh syntax; empty: the page's. */
  | { readonly kind: 'end'; readonly end: 'min' | 'max'; readonly text: string }
  | { readonly kind: 'from-page'; readonly ends: PageEnds }
  | { readonly kind: 'palette'; readonly palette: 'all' | PresetColor }
  /** A swatch of the legend: the value pinned to a color. */
  | { readonly kind: 'pin'; readonly value: string; readonly color: PresetColor }
  | { readonly kind: 'unpin'; readonly value: string }
  /** **Pin a value…**: a value in mongosh syntax, given the first color no pinned value has. */
  | { readonly kind: 'pin-value'; readonly text: string };

/** Why a change is refused: its code and the message the user reads. */
export interface FieldRefusal {
  readonly code: string;
  readonly message: string;
}

/** A rule without some of its properties. */
function without(rule: FieldRule, ...keys: readonly (keyof FieldRule)[]): FieldRule {
  const dropped: readonly string[] = keys;
  return Object.fromEntries(Object.entries(rule).filter(([key]) => !dropped.includes(key))) as unknown as FieldRule;
}

function withEnds(rule: FieldRule, ends: PageEnds | undefined): FieldRule {
  const min = rule.min ?? ends?.min;
  const max = rule.max ?? ends?.max;
  return { ...rule, ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

/** The number an end typed stands for, a date as its milliseconds; `null` for an empty box; else why it is refused. */
export function endOfText(written: string, now: number): number | null | FieldRefusal {
  if (written.trim() === '') {
    return null;
  }
  const parsed = parsedValue(written, now, () => idOfTime(now));
  const scalar = parsed.ok ? scalarOf(parsed.value) : undefined;
  return scalar ?? { code: 'table.edit-field-rule/end', message: text.fieldRule.endProblem };
}

/** An end as its box shows it: a number as it is, a date as `ISODate("…")`. */
export function endText(end: number | undefined, dates: boolean): string {
  if (end === undefined) {
    return '';
  }
  return dates ? `ISODate("${new Date(end).toISOString()}")` : String(end);
}

/** The pinned values with `value` pinned to `color`, last; refused past 100. */
function pinnedWith(rule: FieldRule, value: string, color: PresetColor): FieldRule | FieldRefusal {
  const rest = (rule.pinned ?? []).filter((pin) => pin.value !== value);
  if (rest.length >= mostPinnedValues) {
    return { code: 'table.edit-field-rule/too-many-pins', message: text.fieldRule.tooManyPins };
  }
  return { ...rule, pinned: [...rest, { value, color }] };
}

function pinnedWithout(rule: FieldRule, value: string): FieldRule {
  const rest = (rule.pinned ?? []).filter((pin) => pin.value !== value);
  return rest.length === 0 ? without(rule, 'pinned') : { ...rule, pinned: rest };
}

/** **Pin a value…**: the value read by `query.parse`, given the first of the ten colors no pinned value has. */
function pinnedValue(rule: FieldRule, written: string, now: number): FieldRule | FieldRefusal {
  const parsed = parsedValue(written, now, () => idOfTime(now));
  if (!parsed.ok) {
    return { code: 'table.edit-field-rule/value', message: text.match.syntax(parsed.error.message) };
  }
  const taken = new Set((rule.pinned ?? []).map((pin) => pin.color));
  return pinnedWith(rule, valueText(parsed.value), valueColors.find((color) => !taken.has(color)) ?? 'red');
}

function scaleOf(kind: ScaleKind, rule: FieldRule): FieldRule {
  return kind === 'one' ? { ...rule, scale: { to: 'blue' } } : { ...rule, scale: { ...twoColorScales[kind] } };
}

function endChanged(rule: FieldRule, end: 'min' | 'max', written: string, now: number): FieldRule | FieldRefusal {
  const value = endOfText(written, now);
  if (value === null) {
    return without(rule, end);
  }
  return typeof value === 'number' ? { ...rule, [end]: value } : value;
}

/**
 * Feature: table.edit-field-rule
 *
 * A field rule after a change, or why it is refused: a field that is empty or starts with `$` (`/field`), an end that
 * is not a number or a date (`/end`), a value **Pin a value…** cannot read (`/value`), the 101st pinned value
 * (`/too-many-pins`). A new field drops the ends, which belong to the field they were read from.
 */
export function editedFieldRule(rule: FieldRule, change: FieldChange, now: number): FieldRule | FieldRefusal {
  switch (change.kind) {
    case 'field': {
      const problem = fieldRuleProblem(change.field);
      return problem === undefined
        ? { ...without(rule, 'min', 'max'), field: change.field.trim() }
        : { code: 'table.edit-field-rule/field', message: problem };
    }
    case 'target':
      return { ...rule, target: change.target };
    case 'mode':
      return withEnds({ ...rule, mode: change.mode }, change.ends);
    case 'swap':
      return rule.scale?.to === 'red' ? without(rule, 'scale') : { ...rule, scale: { from: 'green', to: 'red' } };
    case 'scale':
      return scaleOf(change.scale, rule);
    case 'scale-color':
      return { ...rule, scale: { to: change.color } };
    case 'end':
      return endChanged(rule, change.end, change.text, now);
    case 'from-page':
      return withEnds(without(rule, 'min', 'max'), change.ends);
    case 'palette':
      return change.palette === 'all' ? without(rule, 'palette') : { ...rule, palette: change.palette };
    case 'pin':
      return pinnedWith(rule, change.value, change.color);
    case 'unpin':
      return pinnedWithout(rule, change.value);
    case 'pin-value':
      return pinnedValue(rule, change.text, now);
  }
}

/** Whether what a change gave is a refusal. */
export function isFieldRefusal(value: FieldRule | FieldRefusal): value is FieldRefusal {
  return 'code' in value;
}

const kinds: readonly string[] = [
  'field',
  'target',
  'mode',
  'swap',
  'scale',
  'scale-color',
  'end',
  'from-page',
  'palette',
  'pin',
  'unpin',
  'pin-value',
];

/** The change of `args.change`, trusting only its kind and what that kind holds as text or a preset. */
function changeOf(value: Json | undefined): FieldChange | undefined {
  const given = isJsonObject(value) ? value : undefined;
  if (given === undefined || typeof given['kind'] !== 'string' || !kinds.includes(given['kind'])) {
    return undefined;
  }
  const color = given['color'];
  if ((given['kind'] === 'pin' || given['kind'] === 'scale-color') && !isPresetColor(color)) {
    return undefined;
  }
  return given as unknown as FieldChange;
}

/**
 * Feature: table.edit-field-rule
 *
 * One app step for the change `args.change` of the field rule `args.id`, which saves the section the rule is in:
 * `save the formatting rules of Local / shop / orders`, or of the database, of the connection, for everywhere. Nothing
 * when the rule is not there or the change changes nothing; the refusals of {@link editedFieldRule}.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const change = changeOf(args['change']);
  const byScope = rulesByScope(context.state.table.formatting, where);
  const id = typeof args['id'] === 'string' ? args['id'] : '';
  const scope = scopeOfRule(byScope, id);
  const rule = scope === undefined ? undefined : byScope[scope].find((each) => each.id === id);
  if (change === undefined || scope === undefined || rule === undefined || !isFieldRule(rule)) {
    return run(tablePlan(text.formatting.editTitle, []));
  }
  const edited = editedFieldRule(rule, change, context.now);
  if (isFieldRefusal(edited)) {
    return refuse(edited.code, edited.message);
  }
  const rules = byScope[scope].map((each) => (each.id === id ? edited : each));
  return run(tablePlan(text.formatting.editTitle, [saveScopeStep(context, placeOfScope(scope, where), rules)]));
}
