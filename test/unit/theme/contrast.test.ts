/**
 * R10.10: the contrast of the colors the styles draw together, computed from `src/ui/theme/tokens.css` for each theme
 * (D65). Text is at least 4.5:1 against every surface it is drawn on; the border of a field and the focus at least
 * 3:1 against the surfaces fields sit on; the text of a filled button at least 4.5:1 against its fill.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(import.meta.dirname, '..', '..', '..', 'src', 'ui', 'theme', 'tokens.css'), 'utf8');

/** The color tokens of a block of declarations, by name without `--color-`. */
function colorsOf(block: string): Map<string, string> {
  const colors = new Map<string, string>();
  for (const match of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{3,6});/giu)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      colors.set(name, value);
    }
  }
  return colors;
}

const [darkBlock = '', lightBlock = ''] = source.split('@media (prefers-color-scheme: light)');
const dark = colorsOf(darkBlock);
/** The light theme: the dark one's tokens, with those the light block gives again. */
const light = new Map([...dark, ...colorsOf(lightBlock)]);

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The relative luminance of a color written `#rgb` or `#rrggbb` (WCAG 2.2). */
function luminance(hex: string): number {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? digits.replace(/./gu, (digit) => digit + digit) : digits;
  const [r, g, b] = [0, 2, 4].map((at) => channel(Number.parseInt(full.slice(at, at + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** The contrast ratio of two colors, from 1 to 21. */
function contrast(first: string, second: string): number {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

/** The surfaces text and controls are drawn on. */
const surfaces = ['canvas', 'island', 'raised', 'hover', 'selected'];

/** The colors text is written in, on any surface. */
const texts = [
  'text',
  'text-muted',
  'accent',
  'success',
  'warning',
  'danger',
  'connection-red',
  'connection-orange',
  'connection-yellow',
  'connection-green',
  'connection-blue',
  'connection-purple',
  'connection-pink',
  'connection-teal',
  'connection-indigo',
  'connection-brown',
  'connection-gray',
  'syntax-key',
  'syntax-op',
  'syntax-string',
  'syntax-ref',
  'syntax-number',
  'syntax-bool',
  'syntax-oid',
  'syntax-date',
  'syntax-regex',
  'syntax-comment',
];

/** The text of a filled control, on its fill. */
const fills: readonly (readonly [string, string])[] = [
  ['accent-text', 'accent'],
  ['accent-text', 'accent-hover'],
  ['danger-text', 'danger'],
];

/** Where a field and the focus are drawn: never on a selected line, where a field is not shown. */
const fieldSurfaces = ['canvas', 'island', 'raised', 'hover'];

function color(theme: Map<string, string>, name: string): string {
  const value = theme.get(name);
  if (value === undefined) {
    throw new Error(`tokens.css has no --color-${name}.`);
  }
  return value;
}

/** Every pair that falls below its ratio, as `text on surface: ratio`. */
function failures(theme: Map<string, string>): string[] {
  const failed: string[] = [];
  const check = (front: string, back: string, least: number): void => {
    const ratio = contrast(color(theme, front), color(theme, back));
    if (ratio < least) {
      failed.push(`${front} on ${back}: ${ratio.toFixed(2)} < ${String(least)}`);
    }
  };
  for (const text of texts) {
    for (const surface of surfaces) {
      check(text, surface, 4.5);
    }
  }
  for (const [text, fill] of fills) {
    check(text, fill, 4.5);
  }
  for (const line of ['control-border', 'focus']) {
    for (const surface of fieldSurfaces) {
      check(line, surface, 3);
    }
  }
  return failed;
}

/** The colors of the formatting rules (`table.format-table`), mixed into the canvas of the table. */
const formatColors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'teal', 'indigo', 'brown', 'gray'];

/** The text colors of a cell: its text, the muted text of a row number or a missing value, the syntax colors. */
const cellTexts = texts.filter((name) => name === 'text' || name === 'text-muted' || name.startsWith('syntax-'));

/** `color-mix(in srgb, color share%, surface)`: each 8-bit channel mixed linearly. */
function mixed(front: string, back: string, share: number): string {
  const channels = (hex: string): number[] => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const [a, b] = [channels(front), channels(back)];
  const mix = a.map((value, index) => Math.round((value * share + (b[index] ?? 0) * (100 - share)) / 100));
  return `#${mix.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Every text color under 4.5:1 over a formatting color mixed into the canvas, at every share up to a cell's 45%. */
function formatFailures(theme: Map<string, string>): string[] {
  const shares = Array.from({ length: 46 }, (_each, share) => share);
  return formatColors.flatMap((name) =>
    shares.flatMap((share) => {
      const back = mixed(color(theme, `format-${name}`), color(theme, 'canvas'), share);
      return cellTexts
        .map((text) => ({ text, ratio: contrast(color(theme, text), back) }))
        .filter(({ ratio }) => ratio < 4.5)
        .map(({ text, ratio }) => `${text} on format-${name} at ${String(share)}%: ${ratio.toFixed(2)}`);
    }),
  );
}

describe('table.format-table', () => {
  it('keeps every text of a cell at 4.5:1 over each formatting color at 22% and 45% of the canvas, in both themes', () => {
    expect(mixed('#ffffff', '#000000', 45)).toBe('#737373');
    expect(formatFailures(dark)).toEqual([]);
    expect(formatFailures(light)).toEqual([]);
  });
});

describe('the contrast of the tokens (R10.10)', () => {
  it('computes the ratios of WCAG 2.2', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#fff', '#fff')).toBe(1);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('has every color both themes need', () => {
    for (const name of [...texts, ...surfaces, ...fills.flat(), 'control-border', 'focus', 'island-border']) {
      expect(dark.has(name), `dark --color-${name}`).toBe(true);
      expect(light.has(name), `light --color-${name}`).toBe(true);
    }
  });

  it('passes in the dark theme', () => {
    expect(failures(dark)).toEqual([]);
  });

  it('passes in the light theme', () => {
    expect(failures(light)).toEqual([]);
  });

  it('keeps a selected line apart from a hovered one and from its island', () => {
    for (const theme of [dark, light]) {
      expect(contrast(color(theme, 'selected'), color(theme, 'island'))).toBeGreaterThan(1.1);
      expect(color(theme, 'selected')).not.toBe(color(theme, 'hover'));
    }
  });
});
