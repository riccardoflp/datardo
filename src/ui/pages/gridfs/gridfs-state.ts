/**
 * The states `gridfs.show` and `gridfs.inspect` are drawn from, made of what a tab of a bucket keeps and the app's
 * state; and what such a tab adds to the active tab for the inspector island (`nav.inspector`).
 */
import type { GridFsPageState } from '../../../features/gridfs/show';
import { text } from '../../../features/gridfs/text';
import type { BucketPlace, BucketRef, GridFile } from '../../../features/gridfs/types';
import type { Inspection } from '../../../features/nav/types';
import type { AppState } from '../../../shared/state';
import { connectionState, savedConnection } from '../../../shared/state/connections';
import { gridFsTabOf, type GridFsTab } from './gridfs-store';

/** The bucket with how its connection is now: its name, and whether it is read-only. */
export function placeOf(app: AppState, ref: BucketRef): BucketPlace {
  const saved = savedConnection(app.connections, ref.connection);
  return { ...ref, connectionName: saved?.name ?? ref.connection, readOnly: saved?.readOnly ?? true };
}

/** Whether the connection of the bucket is connected. */
export function isConnected(app: AppState, ref: BucketRef): boolean {
  return connectionState(app.connections, ref.connection) === 'connected';
}

/** The state of `gridfs.show`, from what the tab keeps. */
export function pageStateOf(tab: GridFsTab, place: BucketPlace): GridFsPageState {
  return {
    place,
    filter: tab.filter,
    sort: tab.sort,
    page: tab.page,
    ...(tab.read === undefined ? {} : { read: tab.read }),
    loading: tab.loading,
    ...(tab.error === undefined ? {} : { error: tab.error }),
  };
}

/** The file selected, as the page read it. */
export function selectedFile(tab: GridFsTab): GridFile | undefined {
  return tab.selected === undefined ? undefined : tab.read?.files.find((file) => file.idText === tab.selected);
}

/** What a tab of a bucket adds to the active tab: the inspection of the island. */
export function gridFsExtras(_app: AppState, tabId: string): { inspection?: Inspection } {
  const tab = gridFsTabOf(tabId);
  if (tab === undefined) {
    return {};
  }
  const file = selectedFile(tab);
  return {
    inspection:
      file === undefined
        ? { selected: 0, emptyLine: text.inspector.nothing }
        : { selected: 1, title: file.filename, emptyLine: text.inspector.nothing },
  };
}
