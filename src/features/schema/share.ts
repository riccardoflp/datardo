/**
 * Feature: schema.share
 *
 * The percentage shown beside a presence, a type or a value: one decimal below 10, a whole number otherwise, and a
 * whole number from 99.95 and below 0.05, so that a share is never written `100.0%` or `0.0%`.
 */

/** Feature: schema.share — `count` of `of` as a percentage followed by `%`; empty when `of` is 0. */
export function share(count: number, of: number): string {
  if (of === 0) {
    return '';
  }
  const percent = (count / of) * 100;
  if (percent >= 99.95 || percent < 0.05) {
    return `${String(Math.round(percent))}%`;
  }
  const tenths = Math.round(percent * 10) / 10;
  return tenths < 10 ? `${tenths.toFixed(1)}%` : `${String(Math.round(percent))}%`;
}
