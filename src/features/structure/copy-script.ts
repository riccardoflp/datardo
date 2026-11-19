/**
 * Feature: structure.copy-script
 *
 * Copies the script of the last comparison (`structure.script`), with the drops commented out or not as **Include
 * drops in the script** says, or the steps of one difference alone (`args.difference`), to paste them in a shell, a
 * migration or a review. It changes only the clipboard, so it works on a read-only right connection. Started with
 * the arguments of the page (`model/arguments.ts`).
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan, appStep } from '../nav/types';
import { differenceScript, structureScript } from './script';
import { text } from './text';
import { pageArgs, whereText } from './model/arguments';
import { differenceName } from './model/order';

/** The app action that puts a text on the clipboard. */
export const copyAction = 'nav.copy';

/** Feature: structure.copy-script — the script, or the steps of one difference, to the clipboard. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = pageArgs(answers);
  const comparison = args.comparison;
  if (comparison === undefined) {
    return run(appPlan(text.copy.title, []));
  }
  const right = whereText(context, comparison.right);
  const left = whereText(context, comparison.left);
  const one = comparison.differences.find((difference) => difference.id === args.difference);
  const step =
    one === undefined
      ? appStep(text.copy.whole(right, left), copyAction, {
          text: structureScript(comparison.differences, {
            database: comparison.right.database,
            left,
            right,
            drops: args.drops,
          }),
        })
      : appStep(text.copy.one(differenceName(one)), copyAction, {
          text: differenceScript(one, comparison.right.database, args.drops),
        });
  return run({
    ...appPlan(text.copy.title, [step]),
    danger: noDanger,
    after: [{ kind: 'notify', level: 'success', text: text.copy.copied }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('structure.copy-script'), plan };
