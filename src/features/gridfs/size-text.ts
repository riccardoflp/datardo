/**
 * Feature: gridfs.size-text
 *
 * A size in words: the bytes divided by 1,024 while they are 1,024 or more, up to four times (`B`, `KB`, `MB`, `GB`,
 * `TB`); a whole number in bytes and from 10 up, one decimal under 10 in the other units. Ported from Mongoster's
 * `size`.
 */

const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Feature: gridfs.size-text — `717 KB`, `1.5 KB`, `512 B`, `2.1 GB`. */
export function sizeText(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1);
  return `${shown} ${units[unit] ?? 'B'}`;
}
