/**
 * Durations and sizes as the tools write them for the model: `59 m 12 s`, `12 d 3 h`, `1.2 KB`.
 */
import { sizeText } from '../../connection/overview';

export { sizeText };

const units: readonly (readonly [number, string])[] = [
  [86_400, 'd'],
  [3600, 'h'],
  [60, 'm'],
  [1, 's'],
];

/** A duration in seconds with its two largest units: `59 m 12 s`, `12 d 3 h`, `2 h`, `3 s`; `0 s` for none. */
export function shortDuration(seconds: number): string {
  let left = Math.max(0, Math.floor(seconds));
  const parts: string[] = [];
  for (const [size, unit] of units) {
    const count = Math.floor(left / size);
    left -= count * size;
    if (count > 0 || parts.length > 0) {
      parts.push(count > 0 ? `${String(count)} ${unit}` : '');
    }
  }
  const shown = parts.slice(0, 2).filter((part) => part !== '');
  return shown.length === 0 ? '0 s' : shown.join(' ');
}
