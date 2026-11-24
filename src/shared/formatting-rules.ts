/**
 * The formatting rules of conditional formatting as Datardo keeps them, in `formatting.json` and in a formatting file
 * alike (`table.formatting-file`): their form, their limits, and how they are read back from what a file holds,
 * trusting nothing. Shared, so that `src/storage` reads `formatting.json` with the same rules as an import does.
 * Mongoster's form, so either reads the other's rules (`src/shared/formatting.ts › readFormatRules` in Mongoster).
 */
import type { Json } from './engine-request';

import { isPresetColor, presetColors, type PresetColor } from './color';

/**
 * The eleven presets of `connection.color-presets` (D69), the only colors of a formatting rule; never a custom color,
 * which would be unreadable under the text of one theme or the other (D72). One list for the whole of Datardo.
 */
export { isPresetColor, presetColors, type PresetColor };

/** The rules a formatting scope keeps at most *(as in Mongoster)*. */
export const mostFormattingRules = 100;

/** The values a field rule pins to a color at most *(as in Mongoster)*. */
export const mostPinnedValues = 100;

/** The characters a rule's name, and the name of a database or a collection in a file, keep at most. */
export const longestFormattingName = 200;

/** What a rule is known by when it is edited, reordered, moved or removed: random and stable. */
export type FormatRuleId = string;

/** What every formatting rule has. */
interface RuleBase {
  readonly id: FormatRuleId;
  /** What the Formatting view shows for the rule; absent: its condition or its field. */
  readonly name?: string;
  /** Absent means on. */
  readonly enabled?: false;
}

/** Colors the row, or one field's cell, of the documents matching a condition. Without `kind`: Mongoster 0.9.0's. */
export interface ConditionRule extends RuleBase {
  readonly kind?: 'condition';
  /** The filter in mongosh syntax, as the user typed it. */
  readonly condition: string;
  /** The field path whose cell is colored; absent: the document's whole row. */
  readonly field?: string;
  readonly color: PresetColor;
}

/** How a field rule colors, once `auto` is decided from the values of the page (`table.format-field`). */
export type FieldMode = 'boolean' | 'scale' | 'values';

/** What a field rule colors. */
export type FieldTarget = 'row' | 'cell';

/** Colors by the values of one field, with no condition (`table.format-field`). */
export interface FieldRule extends RuleBase {
  readonly kind: 'field';
  /** The field path whose values choose the color. */
  readonly field: string;
  readonly target: FieldTarget;
  /** `auto`: decided from the values of the page. */
  readonly mode: 'auto' | FieldMode;
  /** The ends of a scale, a date as its milliseconds; the page's when absent. */
  readonly min?: number;
  readonly max?: number;
  /** A scale: `to` alone grows stronger; with `from`, from one through yellow to the other. Booleans: true and false. */
  readonly scale?: { readonly from?: PresetColor; readonly to: PresetColor };
  /** The values given a color of their own, by their text in mongosh syntax. */
  readonly pinned?: readonly PinnedValue[];
  /** Where the values that are not pinned take their colors: `all`, or the shades of one preset. Absent: `all`. */
  readonly palette?: 'all' | PresetColor;
}

/** A value of a field rule given a color of its own. */
export interface PinnedValue {
  readonly value: string;
  readonly color: PresetColor;
}

/** A formatting rule: a condition rule or a field rule. */
export type FormatRule = ConditionRule | FieldRule;

/** Whether a rule is a field rule. */
export function isFieldRule(rule: FormatRule): rule is FieldRule {
  return rule.kind === 'field';
}

/** The formatting scopes, from the nearest: this collection, its database, its connection, everywhere. */
export const formatScopes = ['collection', 'database', 'connection', 'global'] as const;

/** Where a formatting rule applies. */
export type FormatScope = (typeof formatScopes)[number];

/** Whether a value is the name of a formatting scope. */
export function isFormatScope(value: Json | undefined): value is FormatScope {
  return typeof value === 'string' && (formatScopes as readonly string[]).includes(value);
}

/** The rules of a list read back: those that can be used, and how many entries could not be. */
export interface ReadRules {
  readonly rules: readonly FormatRule[];
  readonly unreadable: number;
}

type JsonRecord = { readonly [key: string]: Json };

function isRecord(value: Json | undefined): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: Json | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function conditionRuleOf(id: string, entry: JsonRecord): ConditionRule | undefined {
  const { condition, field, color } = entry;
  if (typeof condition !== 'string' || !isPresetColor(color)) {
    return undefined;
  }
  const kept = nonEmptyText(field);
  return { id, condition, color, ...(kept === undefined ? {} : { field: kept }) };
}

function pinnedValuesOf(value: Json | undefined): readonly PinnedValue[] {
  const pins: PinnedValue[] = [];
  for (const pin of Array.isArray(value) ? (value as readonly Json[]) : []) {
    if (pins.length >= mostPinnedValues) {
      break;
    }
    const known = isRecord(pin) && typeof pin['value'] === 'string' && isPresetColor(pin['color']);
    if (known && !pins.some((each) => each.value === pin['value'])) {
      pins.push({ value: pin['value'] as string, color: pin['color'] as PresetColor });
    }
  }
  return pins;
}

function scaleOf(value: Json | undefined): FieldRule['scale'] {
  if (!isRecord(value) || !isPresetColor(value['to'])) {
    return undefined;
  }
  const from = value['from'];
  return { ...(isPresetColor(from) ? { from } : {}), to: value['to'] };
}

function endOf(value: Json | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const fieldModes: readonly string[] = ['auto', 'boolean', 'scale', 'values'];

function fieldRuleOf(id: string, entry: JsonRecord): FieldRule | undefined {
  const field = nonEmptyText(entry['field']);
  if (field === undefined) {
    return undefined;
  }
  const { mode, palette } = entry;
  const [min, max, scale] = [endOf(entry['min']), endOf(entry['max']), scaleOf(entry['scale'])];
  const pinned = pinnedValuesOf(entry['pinned']);
  return {
    id,
    kind: 'field',
    field,
    target: entry['target'] === 'row' ? 'row' : 'cell',
    mode: typeof mode === 'string' && fieldModes.includes(mode) ? (mode as FieldRule['mode']) : 'auto',
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(scale === undefined ? {} : { scale }),
    ...(pinned.length === 0 ? {} : { pinned }),
    ...(palette === 'all' || isPresetColor(palette) ? { palette } : {}),
  };
}

function ruleOf(entry: Json): FormatRule | undefined {
  if (!isRecord(entry) || typeof entry['id'] !== 'string' || entry['id'] === '') {
    return undefined;
  }
  const { id, kind, name, enabled } = entry;
  const rule =
    kind === 'field'
      ? fieldRuleOf(id, entry)
      : kind === undefined || kind === 'condition'
        ? conditionRuleOf(id, entry)
        : undefined;
  if (rule === undefined) {
    return undefined;
  }
  const kept = nonEmptyText(name)?.slice(0, longestFormattingName);
  return { ...rule, ...(kept === undefined ? {} : { name: kept }), ...(enabled === false ? { enabled } : {}) };
}

/**
 * The rules of a list, as a formatting file or `formatting.json` holds them, any version of either: a condition rule
 * with a string id, a string condition and a preset; a field rule with a string id and a field that is not empty, its
 * target and mode taking `cell` and `auto` when unknown, and what can be used of its ends, its scale, its pinned values
 * and its palette. An id seen already, a kind that is neither, and every other property are dropped; a name is trimmed
 * and cut at 200 characters; at most 100 rules are kept. What is not a list is no rules.
 */
export function readFormatRules(value: Json | undefined): ReadRules {
  const entries = Array.isArray(value) ? (value as readonly Json[]) : [];
  const rules: FormatRule[] = [];
  for (const entry of entries) {
    const rule = ruleOf(entry);
    if (rule !== undefined && !rules.some((each) => each.id === rule.id)) {
      rules.push(rule);
    }
    if (rules.length >= mostFormattingRules) {
      break;
    }
  }
  return { rules, unreadable: entries.length - rules.length };
}

/** The rules of one collection, and the scopes it leaves out. */
export interface CollectionFormatting {
  readonly rules: readonly FormatRule[];
  readonly off: readonly FormatScope[];
}

/** The rules of one database, and those of its collections by name. */
export interface DatabaseFormatting {
  readonly rules: readonly FormatRule[];
  readonly collections: Readonly<Record<string, CollectionFormatting>>;
}

/** The rules of one connection, and those of its databases by name. */
export interface ConnectionFormatting {
  readonly rules: readonly FormatRule[];
  readonly databases: Readonly<Record<string, DatabaseFormatting>>;
}

/** Every formatting rule Datardo keeps, by scope: those for everywhere, and those of each connection by its id. */
export interface KeptFormatting {
  readonly global: readonly FormatRule[];
  readonly connections: Readonly<Record<string, ConnectionFormatting>>;
}

/** No rule anywhere. */
export const noFormatting: KeptFormatting = { global: [], connections: {} };

/** What `formatting.json` holds besides its version: whether **Hide formatting** is on, and every rule. */
export interface StoredFormatting extends KeptFormatting {
  readonly hidden: boolean;
}

function entriesOf(value: Json | undefined): readonly (readonly [string, JsonRecord])[] {
  return isRecord(value)
    ? Object.entries(value).filter((entry): entry is [string, JsonRecord] => isRecord(entry[1]))
    : [];
}

function scopesOff(value: Json | undefined): readonly FormatScope[] {
  const listed = Array.isArray(value) ? (value as readonly Json[]) : [];
  return formatScopes.filter((scope) => listed.includes(scope));
}

function collectionsOf(value: Json | undefined): Record<string, CollectionFormatting> {
  return Object.fromEntries(
    entriesOf(value).map(([name, kept]) => [
      name,
      { rules: readFormatRules(kept['rules']).rules, off: scopesOff(kept['off']) },
    ]),
  );
}

function databasesOf(value: Json | undefined): Record<string, DatabaseFormatting> {
  return Object.fromEntries(
    entriesOf(value).map(([name, kept]) => [
      name,
      { rules: readFormatRules(kept['rules']).rules, collections: collectionsOf(kept['collections']) },
    ]),
  );
}

/**
 * What `formatting.json` holds, read with the rules of a formatting file (`table.formatting-file`): each list of rules
 * as `readFormatRules` keeps it, the known scopes a collection leaves out, and anything of another form as nothing.
 * The version is the store's to check.
 */
export function readStoredFormatting(value: Json | undefined): StoredFormatting {
  const stored = isRecord(value) ? value : {};
  const connections = Object.fromEntries(
    entriesOf(stored['connections']).map(([id, kept]) => [
      id,
      { rules: readFormatRules(kept['rules']).rules, databases: databasesOf(kept['databases']) },
    ]),
  );
  return { hidden: stored['hidden'] === true, global: readFormatRules(stored['global']).rules, connections };
}

/** A rule as it is written: its properties in a stated order, `enabled` only as `false`. */
function writtenRule(rule: FormatRule): Json {
  const common = {
    ...(rule.name === undefined ? {} : { name: rule.name }),
    ...(rule.enabled === false ? { enabled: false } : {}),
  };
  if (!isFieldRule(rule)) {
    const field = rule.field === undefined ? {} : { field: rule.field };
    return { id: rule.id, condition: rule.condition, ...field, color: rule.color, ...common };
  }
  const { id, kind, field, target, mode, min, max, scale, pinned, palette } = rule;
  return {
    id,
    kind,
    field,
    target,
    mode,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(scale === undefined ? {} : { scale: { ...scale } }),
    ...(pinned === undefined ? {} : { pinned: pinned.map((pin) => ({ value: pin.value, color: pin.color })) }),
    ...(palette === undefined ? {} : { palette }),
    ...common,
  };
}

/**
 * Rules as `formatting.json` and a formatting file write them (`table.formatting-file`): their properties in a stated
 * order, `enabled` only as `false`, which `readFormatRules` reads back to the same rules.
 */
export function writtenRules(rules: readonly FormatRule[]): readonly Json[] {
  return rules.map(writtenRule);
}
