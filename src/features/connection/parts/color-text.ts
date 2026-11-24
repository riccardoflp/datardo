/**
 * The text of the colors, wherever something is colored: the names of the presets, the items of the lists of
 * `connection.set-color`, `tree.set-database-color` and `tree.set-collection-color`, and the dialog **Choose a
 * color** (`connection.custom-color`). The cards' words, word for word (R10.1).
 */
import type { ColorMap, PresetColor } from '../../../shared/color';

/** The names of the presets, as every list shows them. */
export const presetLabels: Readonly<Record<PresetColor, string>> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  teal: 'Teal',
  indigo: 'Indigo',
  brown: 'Brown',
  gray: 'Gray',
};

/** The items and descriptions of the lists of colors. */
export const colorText = {
  none: 'None',
  custom: 'Custom color…',
  current: 'current',
  /** A description that also says the item is the current choice: `#1e90ff · current`. */
  andCurrent: (description: string): string => `${description} · current`,
  /** The connection's or the database's color, or **none**, as the description of what is followed. */
  noColor: 'none',
  connectionsColor: "Connection's color",
  databasesColor: "Database's color",
  collectionNone: 'Plain, even in a colored database',
  databaseNone: 'No color of its own',
  pick: 'Choose',
  /** What an item of **Import connections** says of the colors a connection brings: **2 collection colors**. */
  databaseColors: (count: number): string => `${String(count)} database ${count === 1 ? 'color' : 'colors'}`,
  collectionColors: (count: number): string => `${String(count)} collection ${count === 1 ? 'color' : 'colors'}`,
} as const;

/** The dialog **Choose a color**. */
export const customColorText = {
  title: 'Choose a color',
  line: (name: string): string => `Color of ${name}`,
  picker: 'Color picker',
  field: 'Color',
  placeholder: '#rrggbb',
  invalid: 'Enter a color as #rrggbb',
  swatches: 'Presets',
  preview: 'Preview',
  previewTab: 'Tab',
  cancel: 'Cancel',
  apply: 'Apply',
  /** Whose color the form's dialog chooses while the connection has no name yet. */
  newConnection: 'the new connection',
} as const;

/** How many colors of databases and of collections a connection brings: **1 database color**, **2 collection colors**. */
export function colorCountsOf(maps: {
  readonly databaseColors?: ColorMap;
  readonly collectionColors?: ColorMap;
}): readonly string[] {
  const databases = Object.keys(maps.databaseColors ?? {}).length;
  const collections = Object.keys(maps.collectionColors ?? {}).length;
  return [
    ...(databases === 0 ? [] : [colorText.databaseColors(databases)]),
    ...(collections === 0 ? [] : [colorText.collectionColors(collections)]),
  ];
}
