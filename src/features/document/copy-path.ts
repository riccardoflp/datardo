/**
 * Feature: document.copy-path
 *
 * Copies the dotted path of a field of the inspected document, to paste it into a filter, a sort or a projection: the
 * names joined by dots, an element of an array by its position (`items.2.qty`), a name with a dot or a `$` as it is.
 *
 * Started with `{ path }`, the names and positions from the top of the document: `["items", 2, "qty"]`.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { requiredArg } from './types';

/** The field path of names and array positions: `items.2.qty`. */
export function fieldPath(parts: readonly (string | number)[]): string {
  return parts.map(String).join('.');
}

/** Copies the field path to the clipboard; the status line says so. */
export function plan(context: Context, answers: Answers): Outcome {
  const path = requiredArg(context, answers, 'path');
  const parts = Array.isArray(path)
    ? (path as readonly unknown[]).filter(
        (part): part is string | number => typeof part === 'string' || typeof part === 'number',
      )
    : typeof path === 'string'
      ? [path]
      : [];
  return run({
    title: text.copy.path,
    steps: [],
    danger: { kind: 'none' },
    undo: { cannot: text.undo.nothingWritten },
    publishes: false,
    after: [
      { kind: 'copy', text: fieldPath(parts) },
      { kind: 'notify', level: 'info', text: text.copied },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.copy-path'), plan };
