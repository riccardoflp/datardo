/**
 * Feature: document.copy-value
 *
 * Copies one value of the inspected document in mongosh syntax (`query.format`): `ISODate("2024-03-15T10:00:00.000Z")`,
 * `NumberLong("9007199254740993")`, a sub-document or an array on several lines, which pastes into the query bar as it
 * is. It writes nothing, so it works on a read-only connection, on a view and in **Aggregate**.
 *
 * Started with `{ value }`, the value as canonical Extended JSON.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { formattedValue } from '../aggregate/mongosh/format';
import { text } from './text';
import { requiredArg } from './types';

/** A value as it is copied: on one line when it is a single value, every entry on its own line otherwise. */
export function copiedValue(value: Json): string {
  return formattedValue(value, { kind: 'pretty', width: 0 });
}

/** Copies the value to the clipboard; the status line says so. */
export function plan(context: Context, answers: Answers): Outcome {
  const value = requiredArg(context, answers, 'value');
  return run({
    title: text.copy.value,
    steps: [],
    danger: { kind: 'none' },
    undo: { cannot: text.undo.nothingWritten },
    publishes: false,
    after: [
      { kind: 'copy', text: copiedValue(value) },
      { kind: 'notify', level: 'info', text: text.copied },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.copy-value'), plan };
