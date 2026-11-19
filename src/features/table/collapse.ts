/**
 * Feature: table.collapse
 *
 * Puts an expanded sub-document or array back into one column. The paths expanded under it stay remembered, so that
 * expanding it again shows them as they were.
 */
import { run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { text } from './text';
import { collectionLabel, collectionOf, saveColumnsStep, startArgs, tablePlan, textOf, textsOf } from './types';

/** The expanded paths without the one collapsed; those under it are kept. */
export function expandedWithout(expanded: readonly string[], key: string): readonly string[] {
  return expanded.filter((each) => each !== key);
}

/**
 * Feature: table.collapse
 *
 * One app step that remembers the expanded paths of the collection without `args.key`; `args.expanded` are the paths
 * expanded now.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const key = textOf(args, 'key');
  const expanded = expandedWithout(textsOf(args, 'expanded'), key);
  return run(
    tablePlan(text.plans.collapse, [
      saveColumnsStep(text.plans.collapseStep(key, collectionLabel(context, where)), where, { expanded }),
    ]),
  );
}
