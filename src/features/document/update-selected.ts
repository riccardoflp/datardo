/**
 * Feature: document.update-selected
 *
 * Runs **Update many** on exactly the documents selected in the table, whatever the filter of the query bar is: its
 * filter is `{ _id: { $in: [2, 3, 5] } }` of the selected rows, each document once. Started with `{ ids }`, the `_id`
 * of each selected row as canonical Extended JSON. It asks, confirms and refuses as `document.update-many`, whose
 * codes its refusals carry.
 */
import { refuse, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { selectedIds } from './delete-selected';
import { text } from './text';
import { requiredPlace } from './types';
import { afterReplies as updateAfterReplies, planUpdate, updateInput } from './update-many';
import { refusedWrite } from './write/guard';
import { countNeed, type WrittenFilter } from './write/many';
import { idsFilter } from './write/steps';
import { oneLineText } from './write/values';
import type { ReplyOutcome } from './types';

/** The filter of the selected documents, written as the form shows it. */
export function selectedFilter(context: Context, answers: Answers): WrittenFilter | undefined {
  const ids = selectedIds(context, answers);
  if (ids.length === 0) {
    return undefined;
  }
  const value = idsFilter(ids) as WrittenFilter['value'];
  return { written: oneLineText(value), value, empty: false };
}

/** Counts the selected documents, asks the update, and updates them. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.update-many/read-only', 'document.update-many/view');
  if (refused !== undefined) {
    return refused;
  }
  const filter = selectedFilter(context, answers);
  if (filter === undefined) {
    return refuse('document.update-many/invalid-filter', text.many.invalidFilter);
  }
  const input = updateInput(context, answers, place, filter);
  return input === undefined ? countNeed(place, filter, context.now) : planUpdate(context, answers, input);
}

/** What follows, from the reply of `updateMany`, as `document.update-many` says it. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  return updateAfterReplies(context, answers, replies);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.update-selected'), plan };
