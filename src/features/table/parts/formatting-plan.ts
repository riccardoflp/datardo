/**
 * What the operations of conditional formatting share (`table.add-format-rule`, `table.edit-format-rule`,
 * `table.color-by-field`, `table.edit-field-rule`, `table.move-format-rule`, `table.import-formatting`): the
 * collection a rule belongs to, the rules of a scope from the app's state, new rule ids, and the app steps that save
 * the rules of a scope (`save the formatting rules of Local / shop / orders`, `… of the database Local / shop`, `… for
 * everywhere`) or what a collection leaves out, which the main process carries out in `formatting.json`
 * (`table.save-formatting`, `table.set-formatting-off`).
 */
import type { Json } from '../../../shared/engine-request';
import type { AppStep, Context } from '../../../shared/feature';
import { writtenRules, type FormatRule, type FormatScope } from '../../../shared/formatting-rules';
import { collectionRules, ruleIds, type ScopePlace } from '../format-scopes';
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

/** The name of a connection, as the steps and the sections say it: its saved name, else its id. */
export function connectionName(context: Context, connection: string): string {
  return context.state.connections.saved.find((each) => each.id === connection)?.name ?? connection;
}

/** How a step names the place of a scope: `Local / shop / orders`, `the database Local / shop`, `everywhere`. */
export function placeLabel(context: Context, place: ScopePlace): string {
  switch (place.scope) {
    case 'collection':
      return collectionLabel(context, place);
    case 'database':
      return text.sections.databasePlace(`${connectionName(context, place.connection)} / ${place.database}`);
    case 'connection':
      return text.sections.connectionPlace(connectionName(context, place.connection));
    case 'global':
      return text.sections.globalPlace;
  }
}

/** A scope's place and its rules as the action `table.save-formatting` reads them. */
function savedPlace(place: ScopePlace, rules: readonly FormatRule[]): Json {
  return { ...place, rules: writtenRules(rules) };
}

/** The step that saves the rules of several scopes at once, with its text: a move saves the two it changes. */
export function saveScopesStep(
  stepText: string,
  saves: readonly { readonly place: ScopePlace; readonly rules: readonly FormatRule[] }[],
): AppStep {
  return {
    kind: 'app',
    text: stepText,
    action: 'table.save-formatting',
    args: { saves: saves.map((each) => savedPlace(each.place, each.rules)) },
  };
}

/** The step that saves the rules of one scope: `save the formatting rules of the database Local / shop`. */
export function saveScopeStep(context: Context, place: ScopePlace, rules: readonly FormatRule[]): AppStep {
  if (place.scope === 'collection') {
    return saveRulesStep(context, place, rules);
  }
  const stepText =
    place.scope === 'database'
      ? text.formatting.saveDatabaseStep(`${connectionName(context, place.connection)} / ${place.database}`)
      : place.scope === 'connection'
        ? text.formatting.saveConnectionStep(connectionName(context, place.connection))
        : text.formatting.saveEverywhereStep;
  return saveScopesStep(stepText, [{ place, rules }]);
}

/** How a step names the rules of a section a collection leaves out or takes again: `the rules of the database shop`. */
function rulesWords(context: Context, scope: FormatScope, where: TableCollection): string {
  switch (scope) {
    case 'collection':
      return text.sections.ownRules;
    case 'database':
      return text.sections.databaseRules(where.database);
    case 'connection':
      return text.sections.connectionRules(connectionName(context, where.connection));
    case 'global':
      return text.sections.globalRules;
  }
}

/**
 * The step of a section's checkbox: `leave the rules of the database shop out of Local / shop / orders`, or `color
 * Local / shop / orders by the rules of the database shop again`; `off` is every scope the collection then leaves out.
 */
export function scopesOffStep(
  context: Context,
  where: TableCollection,
  change: { readonly scope: FormatScope; readonly leftOut: boolean; readonly off: readonly FormatScope[] },
): AppStep {
  const label = collectionLabel(context, where);
  const words = rulesWords(context, change.scope, where);
  return {
    kind: 'app',
    text: change.leftOut ? text.formatting.leaveOutStep(words, label) : text.formatting.takeAgainStep(label, words),
    action: 'table.set-formatting-off',
    args: { ...where, off: [...change.off] },
  };
}

/**
 * `count` new rule ids that no rule Datardo keeps has, from the time: `f-<time in base 36>-1`, `-2`… A feature reads no
 * randomness (R3.1); the window gives the rules it makes random ids itself.
 */
export function newRuleIds(context: Context, count: number): readonly string[] {
  const taken = ruleIds(context.state.table.formatting);
  const base = `f-${Math.max(0, Math.floor(context.now)).toString(36)}`;
  const ids: string[] = [];
  for (let suffix = 1; ids.length < count; suffix += 1) {
    const id = `${base}-${String(suffix)}`;
    if (!taken.has(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/** The names a section's title says: the collection's database, and its connection's name. */
export interface SectionNames {
  readonly database: string;
  readonly connection: string;
}

/** The title of a section of the Formatting view: **This collection**, **Database shop**, **Connection Local**. */
export function sectionTitle(scope: FormatScope, names: SectionNames): string {
  switch (scope) {
    case 'collection':
      return text.sections.collection;
    case 'database':
      return text.sections.database(names.database);
    case 'connection':
      return text.sections.connection(names.connection);
    case 'global':
      return text.sections.global;
  }
}
