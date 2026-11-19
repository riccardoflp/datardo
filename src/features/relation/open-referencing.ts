/**
 * Feature: relation.open-referencing
 *
 * Opens a collection whose field refers to the collection of a document, filtered on the documents that refer to that
 * one (`relation.referrers`). Started from a line under **Referenced by** or an entry of **Find referencing
 * documents** with `{ connection, database, incoming, document, label }`: the incoming references of the collection,
 * the document, and the label of the line (`orders.userId`).
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan } from '../nav/types';
import { jsonArg, relationsArg, requiredStart } from './model/args';
import { openFilteredPlan } from './model/open-filtered';
import { referencingTargets } from './referrers';
import { text } from './text';

/** Feature: relation.open-referencing — `open shop.orders with the filter { userId: ObjectId("…") }`. */
export function plan(context: Context, answers: Answers): Outcome {
  const { args, place } = requiredStart(context, answers);
  const targets = referencingTargets(relationsArg(args, 'incoming'), jsonArg(args, 'document') ?? null);
  const label = args['label'];
  const [only] = targets;
  const target =
    typeof label === 'string' ? targets.find((each) => each.label === label) : targets.length === 1 ? only : undefined;
  return target === undefined
    ? run(appPlan(text.open.referencingTitle, []))
    : openFilteredPlan(place, target, text.open.referencingTitle);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('relation.open-referencing'), plan };
