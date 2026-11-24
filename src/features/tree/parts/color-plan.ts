/**
 * What `tree.set-collection-color` and `tree.set-database-color` share: what they were started on (the node of the
 * tree, or from Go to the active tab), and the plan of one app step that writes the entry of the map on the connection
 * (`tree.color-of`).
 */
import type { OwnColor } from '../../../shared/color';
import type { ConnectionView } from '../../../shared/connection';
import { noDanger, run, type Answers, type AppStep, type Context, type Outcome } from '../../../shared/feature';
import { connectionId } from '../../../shared/ids';
import { savedConnection } from '../../../shared/state/connections';
import { activeTabOf, tabConnectionOf, type TabShows } from '../../../shared/state/tabs';
import { colorLabel } from '../../connection/color-presets';
import { entryOf, ownColor, type ColorTarget } from '../color-of';
import { text } from '../text';
import { isObject } from '../types';

/** What the color is set on: the connection, the target, its name in the list and its words in a step. */
export interface ColorPlace {
  readonly connection: ConnectionView;
  readonly target: ColorTarget;
}

/** The arguments a feature was started with. */
export function argumentsOf(answers: Answers): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return isObject(args) ? args : {};
}

function connectionOf(context: Context, args: Readonly<Record<string, unknown>>): ConnectionView | undefined {
  const given = args['connection'];
  const id = typeof given === 'string' ? connectionId(given) : context.state.nav.current;
  return id === undefined ? undefined : savedConnection(context.state.connections, id);
}

/** The target the node of the tree gave: `{ database, collection }`, `{ database, bucket }`, or `{ database }`. */
function targetOfArgs(args: Readonly<Record<string, unknown>>): ColorTarget | undefined {
  const database = args['database'];
  if (typeof database === 'number') {
    return { kind: 'database', database };
  }
  if (typeof database !== 'string' || database === '') {
    return undefined;
  }
  const collection = args['collection'];
  const bucket = args['bucket'];
  if (typeof collection === 'string' && collection !== '') {
    return { kind: 'collection', database, collection };
  }
  return typeof bucket === 'string' && bucket !== ''
    ? { kind: 'bucket', database, bucket }
    : { kind: 'database', database };
}

/** The collection, view or bucket a tab was opened on: a collection tab, a document tab, the page of a bucket. */
export function collectionOfShows(shows: TabShows): ColorTarget | undefined {
  switch (shows.kind) {
    case 'collection':
    case 'document':
      return { kind: 'collection', database: shows.database, collection: shows.collection };
    case 'page': {
      const bucket = shows.page === 'gridfs' ? shows.of?.[0] : undefined;
      return bucket === undefined || shows.database === undefined
        ? undefined
        : { kind: 'bucket', database: shows.database, bucket };
    }
    case 'app':
    case 'keys':
    case 'key':
    case 'playground':
    case 'console':
      return undefined;
  }
}

/** The database a tab was opened on: that of a collection tab, a GridFS page, a keys or key tab, a page of one. */
export function databaseOfShows(shows: TabShows): ColorTarget | undefined {
  switch (shows.kind) {
    case 'collection':
    case 'document':
      return { kind: 'database', database: shows.database };
    case 'keys':
    case 'key':
      return { kind: 'database', database: shows.database };
    case 'page':
      return shows.database === undefined ? undefined : { kind: 'database', database: shows.database };
    case 'app':
    case 'playground':
    case 'console':
      return undefined;
  }
}

/** What a color is set on: the node it was started on, or from Go to what the active tab shows. */
export function colorPlaceOf(
  context: Context,
  answers: Answers,
  ofShows: (shows: TabShows) => ColorTarget | undefined,
): ColorPlace | undefined {
  const args = argumentsOf(answers);
  const given = targetOfArgs(args);
  if (given !== undefined) {
    const connection = connectionOf(context, args);
    return connection === undefined ? undefined : { connection, target: given };
  }
  const active = activeTabOf(context.state.tabs);
  const target = active === undefined ? undefined : ofShows(active.shows);
  const id = active === undefined ? undefined : tabConnectionOf(active);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  return target === undefined || connection === undefined ? undefined : { connection, target };
}

/** The name in the title of the list: `orders`, `fs`, `shop`, `db3`. */
export function nameOf(target: ColorTarget): string {
  switch (target.kind) {
    case 'database':
      return typeof target.database === 'number' ? `db${String(target.database)}` : target.database;
    case 'collection':
      return target.collection;
    case 'bucket':
      return target.bucket;
  }
}

/** How a step names the target: `shop.orders`, `the GridFS bucket shop.fs`, `the database shop`, `db3`. */
function wordsOf(target: ColorTarget): string {
  switch (target.kind) {
    case 'database':
      return typeof target.database === 'number' ? nameOf(target) : text.colors.database(target.database);
    case 'collection':
      return `${target.database}.${target.collection}`;
    case 'bucket':
      return text.colors.bucket(target.database, target.bucket);
  }
}

function stepOf(place: ColorPlace, color: OwnColor | undefined): AppStep {
  const entry = entryOf(place.target);
  const words = wordsOf(place.target);
  const name = place.connection.name;
  return {
    kind: 'app',
    action: 'tree.set-color',
    args: { connection: place.connection.id, map: entry.map, key: entry.key, color: color ?? null },
    text:
      color === undefined
        ? text.colors.remove(words, name)
        : text.colors.set(words, name, color === 'none' ? 'none' : colorLabel(color).toLowerCase()),
  };
}

/**
 * The plan of one app step that sets the own color of the target to a color or `none`, or removes it when `color` is
 * undefined; with nothing to do when the entry is already so.
 */
export function colorPlan(place: ColorPlace, color: OwnColor | undefined): Outcome {
  const unchanged = ownColor(place.connection, place.target) === color;
  return run({
    title: text.colors.title(nameOf(place.target)),
    steps: unchanged ? [] : [stepOf(place, color)],
    danger: noDanger,
    undo: { cannot: text.colors.cannotUndo },
    publishes: false,
    after: [],
  });
}
