/**
 * Feature: table.copy-path
 *
 * Copies the dotted path of the field of a cell or of a column, as a query uses it: `items.sku`, with no position for
 * an element of an expanded array. It writes nothing.
 */
import { run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { text } from './text';
import { startArgs, tablePlan, textOf } from './types';

/**
 * Feature: table.copy-path
 *
 * No step: the key of the column, `args.key`, goes to the clipboard without quotes.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const key = textOf(startArgs(answers), 'key');
  return run(tablePlan(text.plans.copyPath, [], key === '' ? [] : [{ kind: 'copy', text: key }]));
}
