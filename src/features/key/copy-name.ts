/**
 * Feature: key.copy-name
 *
 * Puts the name of a key, or of the selected keys, on the clipboard: as text when it is valid UTF-8 without control
 * characters, and as `value.quote` writes it otherwise; several names one a line, in the order of the table.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { text } from './text';
import type { KeyName } from './types';
import { argsOf, nameText, namesOfHex, placeOf } from './types';

/** The text put on the clipboard: one name a line. */
export function copiedText(names: readonly KeyName[]): string {
  return names.map(nameText).join('\n');
}

/** Feature: key.copy-name — no step: what follows copies the key of the target, or `args.keys` in table order. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  const selected = namesOfHex(argsOf(answers)['keys']);
  const names = selected.length > 0 ? selected : place?.key === undefined ? [] : [place.key];
  return run({
    title: text.copyName.title,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.undo.nothing },
    publishes: false,
    after: names.length === 0 ? [] : [{ kind: 'copy', text: copiedText(names) }],
  });
}
