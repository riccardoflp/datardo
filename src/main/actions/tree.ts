/**
 * The actions of the tree area the runner carries out for app steps: the own colors of databases and collections,
 * kept on the connection's entry of `connections.json` (`tree.set-database-color`, `tree.set-collection-color`), the
 * exclusions from searches kept beside them (`tree.exclude-from-searches`), and both forgotten when Datardo drops
 * what they name (`manage.drop-collection`, `manage.drop-database`, `gridfs.drop-bucket`). The maps and the list
 * change through the pure functions of `tree.color-of` and `tree.excluded`.
 */
import { ownColorOfText, type ColorMap } from '../../shared/color';
import type { SavedConnection } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import { connectionId } from '../../shared/ids';
import { droppedColors, withColor, type ColorMaps, type Dropped } from '../../features/tree/color-of';
import { droppedExclusions, renamedExclusions, withExclusions } from '../../features/tree/excluded';
import type { Exclusions } from '../../shared/exclusion';
import { jsonFields } from '../../features/connection/types';
import { findConnection, writeConnection } from '../connections';
import { forgetDroppedFormatting } from '../formatting';
import type { MainServices } from '../services';
import type { AreaActions } from '.';

function fields(args: Json): Readonly<Record<string, Json>> {
  return jsonFields(args);
}

function textField(args: Json, name: string): string {
  const value = fields(args)[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

function connectionOf(args: Json): SavedConnection {
  const id = connectionId(textField(args, 'connection'));
  const connection = findConnection(id);
  if (connection === undefined) {
    throw new Error(`No connection is saved with the id ${id}.`);
  }
  return connection;
}

/** The connection with its two maps as given, each left out when it is empty. */
export function withMaps(connection: SavedConnection, maps: ColorMaps): SavedConnection {
  const { databaseColors: _databases, collectionColors: _collections, ...rest } = connection;
  const keep = (map: ColorMap | undefined): map is ColorMap => map !== undefined;
  return {
    ...rest,
    ...(keep(maps.databaseColors) ? { databaseColors: maps.databaseColors } : {}),
    ...(keep(maps.collectionColors) ? { collectionColors: maps.collectionColors } : {}),
  };
}

/** The connection with the list of its exclusions as given, left out when it is empty. */
function withList(connection: SavedConnection, exclusions: Exclusions | undefined): SavedConnection {
  const { exclusions: _exclusions, ...rest } = connection;
  return exclusions === undefined ? rest : { ...rest, exclusions };
}

/**
 * `tree.exclude-from-searches` `{ connection, keys?, excluded }`: the keys added to `exclusions`, or removed; without
 * keys, the connection's `excluded` written, or removed.
 */
function setExcluded(args: Json): Promise<void> {
  const connection = connectionOf(args);
  const values = fields(args);
  const excluded = values['excluded'] === true;
  const keys = values['keys'];
  if (keys === undefined) {
    const { excluded: _excluded, ...rest } = connection;
    writeConnection(excluded ? { ...rest, excluded: true } : rest);
    return Promise.resolve();
  }
  if (!Array.isArray(keys) || !keys.every((key): key is string => typeof key === 'string')) {
    throw new Error('The action needs the keys of databases and collections.');
  }
  writeConnection(withList(connection, withExclusions(connection.exclusions, keys, excluded)));
  return Promise.resolve();
}

/**
 * The exclusion of a collection renamed from Datardo moves to the new name (`manage.rename-collection`); the saved
 * connections are read and written only when it has one.
 */
export function moveExclusion(
  services: MainServices,
  renamed: { readonly connection: string; readonly database: string; readonly from: string; readonly to: string },
): void {
  const shown = services.state.get().connections.saved.find((each) => each.id === renamed.connection);
  if (renamedExclusions(shown?.exclusions, renamed.database, renamed.from, renamed.to) === shown?.exclusions) {
    return;
  }
  const connection = findConnection(connectionId(renamed.connection));
  if (connection !== undefined) {
    writeConnection(
      withList(connection, renamedExclusions(connection.exclusions, renamed.database, renamed.from, renamed.to)),
    );
  }
}

/** `tree.set-color` `{ connection, map, key, color }`: a color or `none` for the entry, or `null` to remove it. */
function setColor(args: Json): Promise<void> {
  const connection = connectionOf(args);
  const map = textField(args, 'map');
  if (map !== 'databaseColors' && map !== 'collectionColors') {
    throw new Error(`The action needs a map of colors, not ${map}.`);
  }
  const given = fields(args)['color'];
  const color = given === null || given === undefined ? undefined : ownColorOfText(given);
  if (given !== null && given !== undefined && color === undefined) {
    throw new Error('The action needs a color, none, or null.');
  }
  const maps = { databaseColors: connection.databaseColors, collectionColors: connection.collectionColors };
  writeConnection(withMaps(connection, { ...maps, [map]: withColor(maps[map], textField(args, 'key'), color) }));
  return Promise.resolve();
}

function droppedOf(args: Json): Dropped {
  const database = textField(args, 'database');
  const values = fields(args);
  if (typeof values['bucket'] === 'string') {
    return { kind: 'bucket', database, bucket: values['bucket'] };
  }
  return typeof values['collection'] === 'string'
    ? { kind: 'collection', database, collection: values['collection'] }
    : { kind: 'database', database };
}

/** The collections whose formatting rules a drop forgets: a collection, the two of a bucket, or the whole database. */
function droppedCollections(dropped: Dropped): readonly string[] | 'whole-database' {
  switch (dropped.kind) {
    case 'collection':
      return [dropped.collection];
    case 'bucket':
      return [`${dropped.bucket}.files`, `${dropped.bucket}.chunks`];
    case 'database':
      return 'whole-database';
  }
}

/**
 * `tree.forget-colors` `{ connection, database, collection? | bucket? }`: the entries of colors and the exclusions of
 * what was dropped, as the connection holds them now, and its formatting rules (`table.format-scopes`).
 */
function forgetColors(services: MainServices, args: Json): Promise<void> {
  const connection = connectionOf(args);
  const dropped = droppedOf(args);
  const kept = withMaps(connection, droppedColors(connection, dropped));
  writeConnection(withList(kept, droppedExclusions(connection.exclusions, dropped)));
  forgetDroppedFormatting(services, {
    connection: connection.id,
    database: dropped.database,
    collections: droppedCollections(dropped),
  });
  return Promise.resolve();
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'tree.set-color': setColor,
  'tree.forget-colors': (args) => forgetColors(services, args),
  'tree.exclude-from-searches': setExcluded,
});
