/**
 * Text cut for showing without splitting what must stay whole: an escape (`\xNN`, `\"`) or a character of several
 * bytes. Used by `runner.step-text` for long values, and for the numbers the cards write with thousands separators.
 */

/** A text cut to its first units, and what says how much was left out (empty when nothing was). */
export interface CutText {
  readonly text: string;
  readonly more: string;
}

/** The first `most` units, and `… (1,804 more)` when there were more. */
export function cutUnits(units: readonly string[], most: number): CutText {
  if (units.length <= most) {
    return { text: units.join(''), more: '' };
  }
  return { text: units.slice(0, most).join(''), more: `… (${groupThousands(units.length - most)} more)` };
}

/** A whole number with a comma every three digits, as the cards write it: `52,310`. */
export function groupThousands(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.trunc(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** The characters of a text, a character of several code units staying whole. */
export function characters(text: string): readonly string[] {
  return Array.from(text);
}
