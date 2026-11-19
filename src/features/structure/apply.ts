/**
 * Feature: structure.apply
 *
 * Makes the right database like the left one for one difference, the differences of one collection, or all of them
 * (`args.chosen`, every difference when absent), after a confirmation that lists the commands. The steps run in the
 * order of the script, each sent as a `runCommand` and shown as the script writes it, in one group per difference:
 * a step that fails stops the remaining steps of its difference only (D31). Several differences with steps that drop
 * something and steps that do not ask first whether to apply the drops; one difference always applies all its steps.
 * Dropping a collection with its documents is destructive (D36): the user types its name, or the right database's
 * when several are dropped. Started with the arguments of the page (`model/arguments.ts`).
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type Danger,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { text } from './text';
import type { StructureDifference } from './types';
import {
  isReadOnly,
  isSameSide,
  connectionName,
  pageArgs,
  whereText,
  type LastComparison,
  type PageArgs,
} from './model/arguments';
import {
  commandsText,
  confirmationLines,
  droppedCollections,
  engineStep,
  stepCounts,
  runningSteps,
  type RunningStep,
} from './model/apply-plan';
import { differenceName } from './model/order';
import { failureOf } from './model/replies';
import { plural } from './model/values';

/** The answer that says whether the drops are applied, among several differences. */
export const dropsKey = 'drops';

/** The read of the number of documents of the collections dropped with their documents. */
export const countsKey = 'counts';

function chosenDifferences(args: PageArgs, comparison: LastComparison): readonly StructureDifference[] {
  const chosen = args.chosen;
  return comparison.differences.filter(
    (difference) =>
      difference.kind !== 'same' &&
      difference.steps.length > 0 &&
      (chosen === undefined || chosen.includes(difference.id)),
  );
}

/** The refusal of the start, or the comparison and the differences to apply. */
function checked(
  context: Context,
  args: PageArgs,
): Outcome | { readonly comparison: LastComparison; readonly chosen: readonly StructureDifference[] } {
  const right = args.right ?? args.comparison?.right;
  if (right !== undefined && isReadOnly(context, right)) {
    return refuse('structure.apply/read-only', text.refusals.readOnly(connectionName(context, right)));
  }
  if (args.comparing) {
    return refuse('structure.apply/comparing', text.refusals.comparing);
  }
  const comparison = args.comparison;
  const moved =
    comparison !== undefined &&
    ((args.left !== undefined && !isSameSide(args.left, comparison.left)) ||
      (args.right !== undefined && !isSameSide(args.right, comparison.right)));
  const chosen = comparison === undefined || moved ? [] : chosenDifferences(args, comparison);
  if (comparison === undefined || chosen.length === 0) {
    return refuse('structure.apply/stale', text.refusals.stale);
  }
  const counts = stepCounts(chosen);
  if (counts.changes === 0 && counts.drops === 0) {
    return refuse('structure.apply/no-command', text.refusals.noCommand);
  }
  return { comparison, chosen };
}

function dropsQuestion(chosen: readonly StructureDifference[]): Outcome {
  return ask({
    title: text.apply.question,
    text: text.apply.drops(stepCounts(chosen).drops, commandsText(chosen, true)),
    button: text.apply.next,
    fields: [
      {
        kind: 'pick-one',
        key: dropsKey,
        label: text.apply.question,
        choices: [
          { value: 'without', label: text.apply.withoutDrops },
          { value: 'including', label: text.apply.includingDrops },
        ],
        default: 'without',
      },
    ],
  });
}

/** Whether the drops are applied: always for one difference, and when every step drops something; else as answered. */
function dropsOf(chosen: readonly StructureDifference[], answers: Answers): boolean {
  return chosen.length === 1 || stepCounts(chosen).changes === 0 || answers[dropsKey] === 'including';
}

function buttonOf(single: boolean, chosen: readonly StructureDifference[], drops: boolean): string {
  const counts = stepCounts(chosen);
  const dropping = drops && counts.drops > 0;
  if (single) {
    return dropping ? (counts.changes > 0 ? text.apply.applyAndDrop : text.apply.drop) : text.apply.apply;
  }
  return dropping ? (counts.changes > 0 ? text.apply.applyIncludingDrops : text.apply.applyDrops) : text.apply.apply;
}

function lostLines(dropped: readonly string[], counts: unknown): readonly string[] {
  const known = typeof counts === 'object' && counts !== null ? (counts as Readonly<Record<string, unknown>>) : {};
  return dropped.map((name) => {
    const count = known[name];
    return text.apply.lost(name, typeof count === 'number' ? count : undefined);
  });
}

interface Decided {
  readonly context: Context;
  readonly comparison: LastComparison;
  readonly chosen: readonly StructureDifference[];
  readonly drops: boolean;
  readonly counts: unknown;
}

function dangerOf(decided: Decided, steps: readonly RunningStep[], question: string): Danger {
  const { chosen, drops, comparison } = decided;
  const dropped = droppedCollections(steps);
  const lines = confirmationLines(chosen, drops, lostLines(dropped, decided.counts));
  const body = [question, ...lines].join('\n');
  const button = buttonOf(chosen.length === 1, chosen, drops);
  if (dropped.length === 0) {
    return { kind: 'confirm', text: body, button };
  }
  const name = dropped.length === 1 ? (dropped[0] ?? '') : comparison.right.database;
  return { kind: 'destructive', text: body, button, name };
}

function planned(decided: Decided): Outcome {
  const { context, comparison, chosen, drops } = decided;
  const right = whereText(context, comparison.right);
  const one = chosen.length === 1 ? chosen[0] : undefined;
  const title =
    one === undefined
      ? text.apply.titleMany(right, whereText(context, comparison.left))
      : text.apply.titleOne(right, differenceName(one));
  const steps = runningSteps(chosen, drops);
  const connection = connectionId(comparison.right.connection);
  const after: readonly After[] = [{ kind: 'refresh', connection }];
  return run({
    title,
    steps: steps.map((step) => engineStep(step, connection, comparison.right.database)),
    danger: dangerOf(decided, steps, `${title}?`),
    touches: plural(steps.length, 'change'),
    undo: { cannot: text.apply.notRecorded },
    publishes: false,
    after,
  });
}

/** Asks whether to apply the drops when it must, reads the counts of what is dropped, then gives the plan. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = pageArgs(answers);
  const start = checked(context, args);
  if ('kind' in start) {
    return start;
  }
  const { comparison, chosen } = start;
  const counts = stepCounts(chosen);
  if (chosen.length > 1 && counts.changes > 0 && counts.drops > 0 && answers[dropsKey] === undefined) {
    return dropsQuestion(chosen);
  }
  const drops = dropsOf(chosen, answers);
  const dropped = droppedCollections(runningSteps(chosen, drops));
  if (dropped.length > 0 && !(countsKey in answers)) {
    const args: Json = {
      connection: comparison.right.connection,
      database: comparison.right.database,
      collections: [...dropped],
    };
    return needRead(countsKey, 'tree.count', args);
  }
  return planned({ context, comparison, chosen, drops, counts: answers[countsKey] });
}

/**
 * What follows the steps, from their replies in the order of the steps (a failure in place of a reply, nothing for a
 * step that did not run): *Applied 6 changes to Production › shop.* or *Nothing was changed in Production › shop.*,
 * then the differences that failed with the server's error; the tree is refreshed when something changed.
 */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): readonly After[] {
  const args = pageArgs(answers);
  const comparison = args.comparison;
  if (comparison === undefined) {
    return [];
  }
  const right = whereText(context, comparison.right);
  const chosen = chosenDifferences(args, comparison);
  const steps = runningSteps(chosen, dropsOf(chosen, answers));
  let done = 0;
  const failures: string[] = [];
  steps.forEach((step, at) => {
    const reply = replies[at];
    const failure = failureOf(reply);
    if (failure !== undefined) {
      failures.push(`${differenceName(step.difference)}: ${failure.message}`);
    } else if (reply !== undefined) {
      done += 1;
    }
  });
  const said = [
    done > 0 ? text.apply.applied(done, right) : text.apply.nothingChanged(right),
    ...(failures.length > 0 ? [text.apply.failed(failures.length, failures)] : []),
  ].join(' ');
  const connection = connectionId(comparison.right.connection);
  return [
    { kind: 'notify', level: failures.length > 0 ? 'warning' : 'success', text: said },
    ...(done > 0 ? [{ kind: 'refresh', connection } as const] : []),
  ];
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('structure.apply'), plan };
