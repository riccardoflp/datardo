/**
 * The commands of the GridFS area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. Those that act on a file act on the selected row of the page of a bucket, or on what the inspector shows.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf, type TabShows } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { text } from './text';
import type { BucketRef } from './types';

/** The commands of the GridFS area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [
  command('gridfs.show', text.commands.show),
  command('gridfs.upload', text.commands.upload),
  command('gridfs.create-bucket', text.commands.createBucket),
  command('gridfs.download', text.commands.download),
  command('gridfs.open', text.commands.open),
  command('gridfs.rename', text.commands.rename),
  command('gridfs.edit-metadata', text.commands.editMetadata),
  command('gridfs.delete', text.commands.delete),
  command('gridfs.drop-bucket', text.commands.dropBucket),
];

/** The bucket of a tab, when it shows the page of a bucket. */
export function bucketOfShows(shows: TabShows): BucketRef | undefined {
  if (shows.kind !== 'page' || shows.page !== 'gridfs' || shows.database === undefined) {
    return undefined;
  }
  const bucket = shows.of?.[0];
  return bucket === undefined ? undefined : { connection: shows.connection, database: shows.database, bucket };
}

/** The database a tab shows something of. */
function databaseOfShows(shows: TabShows): string | undefined {
  return shows.kind === 'collection' || shows.kind === 'document' || shows.kind === 'page' ? shows.database : undefined;
}

/**
 * Whether a command of this area is offered now. **Upload files to GridFS…** of `gridfs.create-bucket` is for the
 * database of the active tab when it is not the page of a bucket, whose own **Upload files to GridFS…** is
 * `gridfs.upload`; every other acts on the bucket of the active tab, and those of a file on its selected file. A
 * read-only connection does not hide them: the feature refuses, and says why.
 */
export function isGridFsCommandOffered(state: AppState, id: string): boolean {
  const shows = activeTabOf(state.tabs)?.shows;
  if (shows === undefined) {
    return false;
  }
  const bucket = bucketOfShows(shows);
  if (id === 'gridfs.create-bucket') {
    return bucket === undefined && databaseOfShows(shows) !== undefined;
  }
  return bucket !== undefined;
}
