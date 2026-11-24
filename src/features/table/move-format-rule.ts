/**
 * Feature: table.move-format-rule
 *
 * Makes a rule apply to a whole database, a whole connection or everywhere, or to one collection again, so that a rule
 * on `status` or `deleted` is written once: a rule's line dragged into another section, or **Move to** and **Copy
 * to** in its `…` menu. A moved rule keeps its id; a copy gets a new one and the first stays. Either goes beside the
 * rule it is dropped on, or last. One app step saves the two sections that change. Nothing is written to a
 * deployment.
 */
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import {
  isFormatScope,
  mostFormattingRules,
  type FormatRule,
  type FormatRuleId,
  type FormatScope,
} from '../../shared/formatting-rules';
import { placeOfScope, rulesByScope, scopeOfRule, type RulesByScope } from './format-scopes';
import { connectionName, newRuleIds, placeLabel, saveScopesStep, sectionTitle } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan } from './types';

/** Where a moved or copied rule goes in its new section: beside a rule, before or after it, or last. */
export interface MovePlace {
  readonly beside?: FormatRuleId;
  readonly after?: boolean;
  /** The id of the copy, when the rule is copied. */
  readonly copyId?: FormatRuleId;
}

/** The sections a move changes, with their rules after it. */
export type MovedRules = Partial<Record<FormatScope, readonly FormatRule[]>>;

function placeIn(target: readonly FormatRule[], place: MovePlace): number {
  const beside = place.beside === undefined ? -1 : target.findIndex((rule) => rule.id === place.beside);
  return beside < 0 ? target.length : beside + (place.after === true ? 1 : 0);
}

function isSameOrder(next: readonly FormatRule[], before: readonly FormatRule[]): boolean {
  return next.length === before.length && next.every((rule, index) => rule === before[index]);
}

/**
 * Feature: table.move-format-rule
 *
 * The sections after the rule `id` is moved (or copied, with `copyId`) to the section `to`, beside the rule `beside`
 * or last; `full` when that other section already has 100 rules; nothing when the rule is not there or would not move.
 * A rule moved within its own section is reordered, which no limit refuses.
 */
export function movedRules(
  byScope: RulesByScope,
  id: FormatRuleId,
  to: FormatScope,
  place: MovePlace = {},
): MovedRules | 'full' | undefined {
  const from = scopeOfRule(byScope, id);
  const rule = from === undefined ? undefined : byScope[from].find((each) => each.id === id);
  if (from === undefined || rule === undefined || place.beside === id) {
    return undefined;
  }
  const copy = place.copyId !== undefined;
  const moving = place.copyId === undefined ? rule : { ...rule, id: place.copyId };
  const source = copy ? byScope[from] : byScope[from].filter((each) => each.id !== id);
  const target = from === to ? source : byScope[to];
  if ((from !== to || copy) && target.length >= mostFormattingRules) {
    return 'full';
  }
  const at = placeIn(target, place);
  const next = [...target.slice(0, at), moving, ...target.slice(at)];
  if (from === to) {
    return isSameOrder(next, byScope[to]) ? undefined : { [to]: next };
  }
  return copy ? { [to]: next } : { [from]: source, [to]: next };
}

/**
 * Feature: table.move-format-rule
 *
 * One app step for the rule `args.id` moved, or copied with `args.copy`, to the section `args.to`, beside `args.beside`
 * (after it with `args.after`) or last: `move a formatting rule from Local / shop / orders to the database Local /
 * shop`, `copy a formatting rule from Local / shop / orders to everywhere`; it saves the sections that change. Refused
 * when that section has 100 rules (`/too-many`), with its name.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const [id, to, beside] = [args['id'], args['to'], args['beside']];
  const copy = args['copy'] === true;
  const title = copy ? text.moves.copyTitle : text.moves.moveTitle;
  const byScope = rulesByScope(context.state.table.formatting, where);
  const from = typeof id === 'string' ? scopeOfRule(byScope, id) : undefined;
  if (typeof id !== 'string' || from === undefined || !isFormatScope(to)) {
    return run(tablePlan(title, []));
  }
  const [copyId] = copy ? newRuleIds(context, 1) : [];
  const place: MovePlace = {
    ...(typeof beside === 'string' ? { beside } : {}),
    ...(args['after'] === true ? { after: true } : {}),
    ...(copyId === undefined ? {} : { copyId }),
  };
  const moved = movedRules(byScope, id, to, place);
  if (moved === 'full') {
    const names = { database: where.database, connection: connectionName(context, where.connection) };
    return refuse('table.move-format-rule/too-many', text.sections.full(sectionTitle(to, names)));
  }
  if (moved === undefined) {
    return run(tablePlan(title, []));
  }
  const fromLabel = placeLabel(context, placeOfScope(from, where));
  const toLabel = placeLabel(context, placeOfScope(to, where));
  const stepText = copy ? text.moves.copyStep(fromLabel, toLabel) : text.moves.moveStep(fromLabel, toLabel);
  const saves = (Object.entries(moved) as [FormatScope, readonly FormatRule[]][]).map(([scope, rules]) => ({
    place: placeOfScope(scope, where),
    rules,
  }));
  return run(tablePlan(title, [saveScopesStep(stepText, saves)]));
}
