/**
 * Feature: relation.open-referenced
 *
 * Opens the collection a reference leads to, filtered on the documents the value names (`relation.targets`). Started
 * from a line of **Go from here**, a cell or its menu with `{ connection, database, outgoing, path, value, label? }`:
 * the outgoing references of the collection, the field's path and its value; `label` (`users._id`) when the line or
 * the entry names one target. When the field refers to several collections and none is named, the user picks one.
 */
import type { Json } from '../../shared/engine-request';
import { ask, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { appPlan } from '../nav/types';
import { jsonArg, relationsArg, requiredStart } from './model/args';
import { openFilteredPlan } from './model/open-filtered';
import { referenceTargets } from './targets';
import { text } from './text';
import type { ReferenceTarget } from './types';

/** The question when the field refers to several collections: one of their labels, each with its filter. */
export function targetQuestion(targets: readonly ReferenceTarget[]): Question {
  return {
    title: text.open.referencedTitle,
    button: text.open.pickButton,
    fields: [
      {
        kind: 'pick-one',
        key: 'target',
        label: text.open.pick,
        choices: targets.map((each) => ({ value: each.label, label: each.label, description: each.filterText })),
      },
    ],
  };
}

function chosen(targets: readonly ReferenceTarget[], label: unknown): ReferenceTarget | undefined {
  return typeof label === 'string' ? targets.find((each) => each.label === label) : undefined;
}

/** Feature: relation.open-referenced — `open shop.users with the filter { _id: ObjectId("…") }`. */
export function plan(context: Context, answers: Answers): Outcome {
  const { args, place } = requiredStart(context, answers);
  const path = typeof args['path'] === 'string' ? args['path'] : '';
  const value: Json | undefined = jsonArg(args, 'value');
  const targets = referenceTargets(relationsArg(args, 'outgoing'), path, value, place.database);
  const [only] = targets;
  const named = chosen(targets, args['label']) ?? chosen(targets, answers['target']);
  const target = targets.length === 1 ? only : named;
  if (target !== undefined) {
    return openFilteredPlan(place, target, text.open.referencedTitle);
  }
  return targets.length > 1 && !('target' in answers)
    ? ask(targetQuestion(targets))
    : run(appPlan(text.open.referencedTitle, []));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('relation.open-referenced'), plan };
