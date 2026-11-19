/**
 * Feature: table.expand
 *
 * Shows the fields of a sub-document as columns of their own, and the elements of an array of sub-documents as
 * sub-rows, without changing the query. The expanded paths are remembered for the collection of the connection.
 */
import { run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { text } from './text';
import { collectionLabel, collectionOf, saveColumnsStep, startArgs, tablePlan, textOf, textsOf } from './types';

/** The expanded paths with those added, in the order they were expanded, each once. */
export function expandedWith(expanded: readonly string[], added: readonly string[]): readonly string[] {
  return [...new Set([...expanded, ...added])];
}

/**
 * Feature: table.expand
 *
 * One app step that remembers the expanded paths of the collection with `args.key` added, or with `args.below` too for
 * all levels (the expandable paths under it in the page, `expandableBelow`). `args.expanded` are the paths expanded
 * now.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const key = textOf(args, 'key');
  const below = textsOf(args, 'below');
  const allLevels = args['allLevels'] === true;
  const expanded = expandedWith(textsOf(args, 'expanded'), allLevels ? [key, ...below] : [key]);
  const label = collectionLabel(context, where);
  const stepText = allLevels ? text.plans.expandAllStep(key, label) : text.plans.expandStep(key, label);
  return run(tablePlan(text.plans.expand, [saveColumnsStep(stepText, where, { expanded })]));
}
