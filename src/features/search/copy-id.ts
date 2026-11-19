/**
 * Feature: search.copy-id
 *
 * Copies the `_id` of a result as the page shows it, in mongosh syntax (`ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")`,
 * `"A-17"` with its quotes), to paste it in a filter or in another search, where **Contains** finds the same document
 * by its `_id`. It changes only the clipboard: it neither selects the item nor opens the document.
 *
 * Started with `{ id }`, the `_id` as canonical Extended JSON.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { formattedValue } from '../query/format';
import { appPlan, appStep, startArgs } from '../nav/types';
import { text } from './text';

/** The app action that puts a text on the clipboard. */
export const copyAction = 'nav.copy';

/** The `_id` as it is copied: in mongosh syntax, on one line. */
export function copiedId(id: Json): string {
  return formattedValue(id, 'one-line');
}

/** Feature: search.copy-id — the `_id` to the clipboard, and *Copied to the clipboard*. */
export function plan(_context: Context, answers: Answers): Outcome {
  const { id } = startArgs(answers);
  const empty = { ...appPlan(text.copy.title, []), undo: { cannot: text.copy.nothingWritten } };
  if (id === undefined) {
    return run(empty);
  }
  const copied = copiedId(id as Json);
  return run({
    ...empty,
    steps: [appStep(text.copy.step(copied), copyAction, { text: copied })],
    after: [{ kind: 'notify', level: 'info', text: text.copy.copied }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('search.copy-id'), plan };
