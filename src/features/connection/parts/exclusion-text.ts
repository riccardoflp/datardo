/**
 * What the files of connections say of the exclusions from searches (`tree.excluded`), word for word as the cards
 * write it (R10.1): the detail of an item to import (`connection.import`) and the notes of an export that leaves them
 * out (`connection.write-file`).
 */
import type { ColorMap } from '../../../shared/color';
import type { Exclusions } from '../../../shared/exclusion';
import { colorCountsOf } from './color-text';

/** The text of the exclusions in the files of connections. */
export const exclusionText = {
  excluded: 'excluded from searches',
  count: (count: number): string =>
    count === 1
      ? '1 database or collection excluded from searches'
      : `${String(count)} databases or collections excluded from searches`,
  compassLeftOut: "exclusions from searches were left out (Compass doesn't have them)",
  listLeftOut: 'exclusions from searches were left out',
} as const;

/** Whether a connection of a file has anything excluded from searches: itself, or some of its databases and collections. */
export function hasExclusions(connection: {
  readonly excluded?: true | undefined;
  readonly exclusions?: Exclusions | undefined;
}): boolean {
  return connection.excluded === true || (connection.exclusions?.length ?? 0) > 0;
}

/** What the detail of an item says: **excluded from searches**, **2 databases or collections excluded from searches**. */
export function exclusionCountsOf(connection: {
  readonly excluded?: true | undefined;
  readonly exclusions?: Exclusions | undefined;
}): readonly string[] {
  const count = connection.exclusions?.length ?? 0;
  return [
    ...(connection.excluded === true ? [exclusionText.excluded] : []),
    ...(count === 0 ? [] : [exclusionText.count(count)]),
  ];
}

/**
 * What the detail of an item says of what Datardo keeps beside the connection: its colors of databases and
 * collections (`colorCountsOf`), then its exclusions from searches.
 */
export function organizeCountsOf(connection: {
  readonly databaseColors?: ColorMap;
  readonly collectionColors?: ColorMap;
  readonly excluded?: true | undefined;
  readonly exclusions?: Exclusions | undefined;
}): readonly string[] {
  return [...colorCountsOf(connection), ...exclusionCountsOf(connection)];
}
