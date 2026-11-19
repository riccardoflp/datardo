/**
 * Feature: structure.open-in-playground
 *
 * Opens the script of the last comparison in a new playground on the right connection and database, where it can be
 * read, changed and run: one app step, `playground.open`, with what the playground is opened on. Nothing runs until
 * the user runs the playground (`playground.run`), which has its own rules for writes, so it works on a read-only
 * right connection. Pressing it twice opens two playgrounds.
 *
 * The request of `playground.open` is this area's own type until the playground area (M28), written beside it, gives
 * its own: `{ connection, database, text }`, a new playground every time.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan, appStep } from '../nav/types';
import { structureScript } from './script';
import { text } from './text';
import { pageArgs, whereText } from './model/arguments';

/** The app action that opens a new playground tab with a text. */
export const openPlaygroundAction = 'playground.open';

/** What a new playground is opened with: its connection, its default database and its text. */
export type PlaygroundOpening = {
  readonly connection: string;
  readonly database: string;
  readonly text: string;
};

/** Feature: structure.open-in-playground — a new playground on the right side with the script. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = pageArgs(answers);
  const comparison = args.comparison;
  if (comparison === undefined) {
    return run(appPlan(text.playground.title, []));
  }
  const right = whereText(context, comparison.right);
  const left = whereText(context, comparison.left);
  const script = structureScript(comparison.differences, {
    database: comparison.right.database,
    left,
    right,
    drops: args.drops,
  });
  const opening: PlaygroundOpening = {
    connection: comparison.right.connection,
    database: comparison.right.database,
    text: script,
  };
  const step = appStep(text.playground.step(right, left), openPlaygroundAction, opening);
  return run(appPlan(text.playground.title, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('structure.open-in-playground'), plan };
