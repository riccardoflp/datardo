/**
 * The commands of the GridFS area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. Those that act on a file act on the selected row of the page of a bucket, or on what the inspector shows.
 */
import { command, type Command } from '../command';
import { text } from './text';

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
