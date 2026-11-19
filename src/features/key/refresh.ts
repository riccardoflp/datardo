/**
 * Feature: key.refresh
 *
 * Scans again from the start with the same pattern and type, and forgets what was read of each key: no step on the
 * deployment; the keys tab drops its rows, its cursor and what `key.details` read, keeps its sort, its pattern and its
 * type, clears the selection, and calls `key.scan` from cursor 0 (with `DBSIZE`).
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run, noDanger } from '../../shared/feature';
import { text } from './text';
import { placeOf, refreshAfter } from './types';

/** Feature: key.refresh — a plan with no step, whose `refresh` makes the keys tab scan again from cursor 0. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.refresh needs a keys tab.');
  }
  return run({
    title: text.refresh.title,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.undo.nothing },
    publishes: false,
    after: [refreshAfter(place)],
  });
}
