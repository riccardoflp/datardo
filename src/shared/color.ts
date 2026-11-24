/**
 * The colors that mark a connection, a database and a collection (glossary, "color"; D69): eleven presets, drawn with
 * a token of each theme, and custom colors `#rrggbb`, drawn as they are. How a color is read from a field, a file or
 * a setting is here, where the stored files, the features and the window all reach it
 * (`connection.color-presets`, `tree.color-of`).
 */

/** The presets, in the order every list shows them. */
export const presetColors = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'teal',
  'indigo',
  'brown',
  'gray',
] as const;

/** One of the eleven presets (glossary, "preset"). */
export type PresetColor = (typeof presetColors)[number];

/** A custom color: `#` and six hexadecimal digits in lower case (glossary, "custom color"). */
export type HexColor = `#${string}`;

/** A color: a preset or a custom color. */
export type ConnectionColor = PresetColor | HexColor;

/** The own color of a database or a collection: a color, or **None**, which is no color even in a colored connection. */
export type OwnColor = ConnectionColor | 'none';

/** The own colors of the databases or of the collections of a connection, by their key (`tree.color-of`). */
export type ColorMap = Readonly<Record<string, OwnColor>>;

/** Whether a value is the name of a preset, in lower case. */
export function isPresetColor(value: unknown): value is PresetColor {
  return typeof value === 'string' && (presetColors as readonly string[]).includes(value);
}

/** Whether a value is a custom color as it is kept: `#rrggbb` in lower case. */
export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/u.test(value);
}

/**
 * A color read from a text: trimmed, its case ignored; a preset's name is that preset; `#rrggbb` and `#rgb`, with or
 * without `#`, a custom color, `#rgb` doubling each digit; anything else, and what is not a text, no color.
 */
export function colorOfText(value: unknown): ConnectionColor | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const text = value.trim().toLowerCase();
  if (isPresetColor(text)) {
    return text;
  }
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/u.exec(text)?.[1];
  if (hex === undefined) {
    return undefined;
  }
  return `#${hex.length === 3 ? hex.replace(/./gu, '$&$&') : hex}`;
}

/** An own color read from a text: `none`, or what {@link colorOfText} reads. */
export function ownColorOfText(value: unknown): OwnColor | undefined {
  return typeof value === 'string' && value.trim().toLowerCase() === 'none' ? 'none' : colorOfText(value);
}

/** The keys of the two maps: a database's name has no `.`; a collection's is `<database>.<collection>`. */
const mapKeys = {
  databases: /^[^.]+$/u,
  collections: /^[^.]+\..+$/u,
} as const;

/**
 * The valid entries of a map of colors read from a file: a key that names a database or a collection, and an own
 * color; `undefined` when none is left, or when the value is not an object.
 */
export function colorMapOf(value: unknown, keys: keyof typeof mapKeys): ColorMap | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, color]) => {
    const own = ownColorOfText(color);
    return mapKeys[keys].test(key) && own !== undefined ? [[key, own] as const] : [];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}
