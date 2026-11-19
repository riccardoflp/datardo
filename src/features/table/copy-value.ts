/**
 * Feature: table.copy-value
 *
 * Copies the value of the selected cell in mongosh syntax: on one line, with its type, whole, never in the short form
 * of the cell. It writes nothing.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { formattedValue } from '../query/format';
import { text } from './text';
import { startArgs, tablePlan } from './types';

/** The text **Copy value** copies: the value as `query.format` writes it, `NumberLong(1204)`, `Double(5)`, `["a", "b"]`. */
export function copiedValue(value: Json): string {
  return formattedValue(value);
}

/**
 * Feature: table.copy-value
 *
 * No step: the value of `args.value` goes to the clipboard. A cell with no value (`args` without `value`) copies
 * nothing and leaves the clipboard as it was.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  if (!Object.hasOwn(args, 'value')) {
    return run(tablePlan(text.plans.copyValue, []));
  }
  return run(tablePlan(text.plans.copyValue, [], [{ kind: 'copy', text: copiedValue(args['value'] as Json) }]));
}
