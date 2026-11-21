/**
 * The commands of the GridFS area, carried out by the window the same way for their key and their row in Go to
 * (`palette.run-command`): on the active tab of a bucket, **Open GridFS bucket**, **Upload files to GridFS…** and
 * **Delete GridFS bucket…** act on the bucket, and those of a file on the selected file; **Upload files to GridFS…**
 * of `gridfs.create-bucket` acts on the database of the active tab. A command not offered now, or of a file with none
 * selected, does nothing.
 */
import { bucketOfShows } from '../../../features/gridfs/commands';
import { bucketArgs, bucketTarget, fileArgs } from '../../../features/gridfs/types';
import { intentOf } from '../../../features/palette/run-command';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { startFeature } from '../../shell/intent';
import { startIntent } from '../../shell/top-bar/start';
import { selectedFile } from './gridfs-state';
import { gridFsTabOf } from './gridfs-store';

/** The commands that act on the selected file. */
const fileCommands: ReadonlySet<string> = new Set([
  'gridfs.download',
  'gridfs.open',
  'gridfs.rename',
  'gridfs.edit-metadata',
  'gridfs.delete',
]);

/** Whether a command is one of the GridFS area's, carried out here. */
export function isGridFsCommand(id: string): boolean {
  return id.startsWith('gridfs.');
}

/** Runs a command of the GridFS area now. */
export function runGridFsCommand(id: string, state: AppState): void {
  const intent = intentOf(state, id);
  const active = activeTabOf(state.tabs);
  if (intent === undefined || active === undefined) {
    return;
  }
  const bucket = bucketOfShows(active.shows);
  if (id === 'gridfs.create-bucket' || bucket === undefined) {
    startIntent(intent);
    return;
  }
  const target = bucketTarget(bucket);
  if (!fileCommands.has(id)) {
    const from = id === 'gridfs.upload' ? { from: 'page' } : {};
    startFeature(id, { target, args: { ...bucketArgs(bucket), ...from } });
    return;
  }
  const tab = gridFsTabOf(active.id);
  const file = tab === undefined ? undefined : selectedFile(tab);
  if (file !== undefined) {
    startFeature(id, { target, args: { ...bucketArgs(bucket), ...fileArgs(file) } });
  }
}
