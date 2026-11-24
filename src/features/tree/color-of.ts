/**
 * Feature: tree.color-of
 *
 * The rule every surface of a database or a collection follows: the collection's own color, otherwise its database's
 * own, otherwise its connection's; an own **None** is no color. An icon of the tree or of a tab takes the color only
 * when it comes from the collection or the database: the connection's color alone stays on its island, its group of
 * tabs and its card (D69). The same module keeps the maps of colors in step when one is set, and when Datardo renames
 * or drops what they name.
 */
import type { ColorMap, ConnectionColor, OwnColor } from '../../shared/color';

/** What `colorOf` needs of a connection. */
export interface ColoredConnection {
  readonly color?: ConnectionColor | undefined;
  readonly databaseColors?: ColorMap | undefined;
  readonly collectionColors?: ColorMap | undefined;
}

/**
 * What a color is looked up for: a database (a MongoDB one by its name, a Redis one by its number), or a collection,
 * a view or a bucket of a MongoDB database. A namespace or a key of Redis is its database's.
 */
export type ColorTarget =
  | { readonly kind: 'database'; readonly database: string | number }
  | { readonly kind: 'collection'; readonly database: string; readonly collection: string }
  | { readonly kind: 'bucket'; readonly database: string; readonly bucket: string };

/** Where a color comes from. */
export type ColorSource = 'collection' | 'database' | 'connection';

/** The color something takes, with where it comes from; `color` absent for no color. */
export interface TakenColor {
  readonly color?: ConnectionColor;
  readonly from: ColorSource;
}

/** The key of a database in `databaseColors`: its name, or a Redis database's number written in decimal. */
export function databaseKey(database: string | number): string {
  return typeof database === 'number' ? String(database) : database;
}

/** The key of a collection in `collectionColors`: a database's name has no `.`, so the first one separates the two. */
export function collectionKey(database: string, collection: string): string {
  return `${database}.${collection}`;
}

/** The collection whose color a GridFS bucket takes: its `.files` one. */
export function bucketCollection(bucket: string): string {
  return `${bucket}.files`;
}

/** The key of a target's own entry in `collectionColors`; none for a database. */
function ownCollectionKey(target: ColorTarget): string | undefined {
  switch (target.kind) {
    case 'database':
      return undefined;
    case 'collection':
      return collectionKey(target.database, target.collection);
    case 'bucket':
      return collectionKey(target.database, bucketCollection(target.bucket));
  }
}

function taken(own: OwnColor, from: ColorSource): TakenColor {
  return own === 'none' ? { from } : { color: own, from };
}

/**
 * Feature: tree.color-of — the color a target takes and where it comes from: the collection's entry wins, then the
 * database's, each a color or `none`; without either, the connection's color, or none.
 */
export function colorOf(connection: ColoredConnection, target: ColorTarget): TakenColor {
  const collection = ownCollectionKey(target);
  const ownOfCollection = collection === undefined ? undefined : connection.collectionColors?.[collection];
  if (ownOfCollection !== undefined) {
    return taken(ownOfCollection, 'collection');
  }
  const ownOfDatabase = connection.databaseColors?.[databaseKey(target.database)];
  if (ownOfDatabase !== undefined) {
    return taken(ownOfDatabase, 'database');
  }
  return connection.color === undefined ? { from: 'connection' } : { color: connection.color, from: 'connection' };
}

/** The color of an icon of the tree or of a tab: only when it comes from the collection or the database. */
export function iconColor(connection: ColoredConnection, target: ColorTarget): ConnectionColor | undefined {
  const found = colorOf(connection, target);
  return found.from === 'connection' ? undefined : found.color;
}

/** The icon's color as a field of what draws it: `{ color }`, or nothing when the icon keeps its usual color. */
export function iconColored(connection: ColoredConnection, target: ColorTarget): { readonly color?: ConnectionColor } {
  const color = iconColor(connection, target);
  return color === undefined ? {} : { color };
}

/** The own entry of a target, as the list of colors shows it: `undefined` when it follows what is above it. */
export function ownColor(connection: ColoredConnection, target: ColorTarget): OwnColor | undefined {
  const collection = ownCollectionKey(target);
  return collection === undefined
    ? connection.databaseColors?.[databaseKey(target.database)]
    : connection.collectionColors?.[collection];
}

/** The key a target's own color is kept under, and in which map. */
export function entryOf(target: ColorTarget): {
  readonly map: 'databaseColors' | 'collectionColors';
  readonly key: string;
} {
  const collection = ownCollectionKey(target);
  return collection === undefined
    ? { map: 'databaseColors', key: databaseKey(target.database) }
    : { map: 'collectionColors', key: collection };
}

function orNothing(entries: readonly (readonly [string, OwnColor])[]): ColorMap | undefined {
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/**
 * The map with the entry of `key` set to the color, or removed when `color` is undefined (the target follows what is
 * above it again); nothing when it is left empty.
 */
export function withColor(
  colors: ColorMap | undefined,
  key: string,
  color: OwnColor | undefined,
): ColorMap | undefined {
  if (colors?.[key] === color) {
    return colors;
  }
  const others = Object.entries(colors ?? {}).filter(([each]) => each !== key);
  return orNothing(color === undefined ? others : [...others, [key, color]]);
}

/** The map with the entry of `database.from` moved to `database.to`; unchanged when it has none. */
export function renamedColors(
  colors: ColorMap | undefined,
  database: string,
  from: string,
  to: string,
): ColorMap | undefined {
  const fromKey = collectionKey(database, from);
  const color = colors?.[fromKey];
  if (colors === undefined || color === undefined) {
    return colors;
  }
  return withColor(withColor(colors, fromKey, undefined), collectionKey(database, to), color);
}

/** What was dropped: a collection or a view, a bucket, or a whole database. */
export type Dropped =
  | { readonly kind: 'collection'; readonly database: string; readonly collection: string }
  | { readonly kind: 'bucket'; readonly database: string; readonly bucket: string }
  | { readonly kind: 'database'; readonly database: string };

function isDropped(dropped: Dropped, key: string): boolean {
  switch (dropped.kind) {
    case 'collection':
      return key === collectionKey(dropped.database, dropped.collection);
    case 'bucket':
      return (
        key === collectionKey(dropped.database, bucketCollection(dropped.bucket)) ||
        key === collectionKey(dropped.database, `${dropped.bucket}.chunks`)
      );
    case 'database':
      return key.startsWith(`${dropped.database}.`);
  }
}

function without(colors: ColorMap | undefined, dropped: (key: string) => boolean): ColorMap | undefined {
  if (colors === undefined) {
    return undefined;
  }
  const kept = Object.entries(colors).filter(([key]) => !dropped(key));
  return kept.length === Object.keys(colors).length ? colors : orNothing(kept);
}

/** The two maps of a connection, as `droppedColors` gives them back. */
export interface ColorMaps {
  readonly databaseColors?: ColorMap | undefined;
  readonly collectionColors?: ColorMap | undefined;
}

/**
 * The maps without the entry of a dropped collection or view; of a dropped bucket, the entries of its `.files` and
 * `.chunks` collections; of a dropped database, its entry in `databaseColors` and every entry of `collectionColors`
 * that starts with `database.`. A map is the same object when nothing changes, and nothing when it is left empty.
 */
export function droppedColors(connection: ColorMaps, dropped: Dropped): ColorMaps {
  return {
    databaseColors:
      dropped.kind === 'database'
        ? without(connection.databaseColors, (key) => key === dropped.database)
        : connection.databaseColors,
    collectionColors: without(connection.collectionColors, (key) => isDropped(dropped, key)),
  };
}

/** Whether a drop would forget an entry of the connection's maps: whether the plan has the step that forgets them. */
export function hasColorsOf(connection: ColorMaps, dropped: Dropped): boolean {
  const after = droppedColors(connection, dropped);
  return after.databaseColors !== connection.databaseColors || after.collectionColors !== connection.collectionColors;
}

/**
 * The color both sides of a comparison share, or the only color one side has, or none: two sides of different colors
 * take none.
 */
export function sharedColor(sides: readonly (ConnectionColor | undefined)[]): ConnectionColor | undefined {
  const colors = [...new Set(sides.filter((each): each is ConnectionColor => each !== undefined))];
  return colors.length === 1 ? colors[0] : undefined;
}
