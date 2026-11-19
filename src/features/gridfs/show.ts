/**
 * Feature: gridfs.show
 *
 * The page of a bucket, in a tab of its own, one per bucket: the toolbar (the filter, the summary of the files that
 * match, **Upload…**, **Refresh**), the table of a page of 100 files sorted by the server, and the pager. `view` says
 * what is shown; the page reads `gridfs.list` when it opens, 300 ms after the filter was last typed in, when the sort
 * or the page changes, on **Refresh** and after every change, and drops a reply older than its last request. `plan` is
 * what the tree, **Open** of an upload's notification and Go to start: the tab of the bucket. Ported from
 * Mongoster's `GridFSPanel` and its view.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { localDateText } from '../key/format-expiry';
import { appPlan } from '../nav/types';
import { planOf } from '../tab/open';
import { pageFiles, type FilesPage, type FilesSort, type SortField } from './list';
import { sizeText } from './size-text';
import { text } from './text';
import {
  bucketPlace,
  fileArgs,
  isRecord,
  oneLine,
  startControl,
  type BucketPlace,
  type GridControl,
  type GridFile,
} from './types';

/** How long the page waits after the filter was last typed in before it reads, in milliseconds. */
export const filterWaitMs = 300;

/** What the page is drawn from. */
export interface GridFsPageState {
  readonly place: BucketPlace;
  readonly filter: string;
  readonly sort: FilesSort;
  /** The page, counting from 0. */
  readonly page: number;
  /** What was read (kept while it is read again), or the message that takes the place of the table. */
  readonly read?: FilesPage;
  readonly loading: boolean;
  readonly error?: string;
}

/** A column of the table, and whether a click on it sorts. */
export interface ColumnView {
  readonly key: 'filename' | 'length' | 'uploadDate' | 'type' | 'metadata' | 'id';
  readonly label: string;
  readonly sorted?: 'ascending' | 'descending';
  readonly sorts: boolean;
}

/** A row of the table. */
export interface FileRow {
  readonly id: Json;
  readonly name: string;
  readonly size: string;
  /** `734,003 bytes · chunks of 255 KB`. */
  readonly sizeTooltip: string;
  /** `2026-11-18 14:02:11`, in the local time. */
  readonly uploaded: string;
  /** The date as the server holds it. */
  readonly uploadedTooltip: string;
  readonly type: string;
  readonly metadata: string;
  readonly idText: string;
  /** **Open**, **Download…**, and **Rename…** and **Delete** when the connection is not read-only. */
  readonly menu: readonly GridControl[];
}

/** What the page shows. */
export interface GridFsPageView {
  readonly title: string;
  readonly toolbar: {
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly summary?: string;
    readonly upload?: GridControl;
    readonly refresh: { readonly label: string; readonly tooltip: string };
  };
  readonly columns: readonly ColumnView[];
  readonly rows: readonly FileRow[];
  readonly dimmed: boolean;
  readonly error?: string;
  readonly empty?: string;
  readonly pager?: {
    readonly previous: { readonly label: string; readonly enabled: boolean };
    readonly range: string;
    readonly next: { readonly label: string; readonly enabled: boolean };
  };
  readonly readOnly?: { readonly label: string; readonly tooltip: string };
}

/** The sort after a click on a column: the other direction on the same column, else its first direction. */
export function nextSort(sort: FilesSort, field: SortField): FilesSort {
  return sort.field === field ? { field, descending: !sort.descending } : { field, descending: field !== 'filename' };
}

/** The metadata without its `contentType`, on one line; empty when nothing else is there. */
export function metadataText(metadata: Json | undefined): string {
  if (!isRecord(metadata)) {
    return metadata === undefined ? '' : oneLine(metadata);
  }
  const rest = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== 'contentType'));
  return Object.keys(rest).length === 0 ? '' : oneLine(rest);
}

/** The identifiers of the controls of a file, written whole, in the menu of its row and in the inspector. */
const fileElements = {
  'row-menu': {
    open: 'gridfs.open@row-menu',
    download: 'gridfs.download@row-menu',
    rename: 'gridfs.rename@row-menu',
    delete: 'gridfs.delete@row-menu',
  },
  inspector: {
    open: 'gridfs.open@inspector',
    download: 'gridfs.download@inspector',
    rename: 'gridfs.rename@inspector',
    delete: 'gridfs.delete@inspector',
  },
} as const;

/** The controls of a file: **Open**, **Download…**, and on a connection that is not read-only **Rename…** and **Delete**. */
export function fileControls(place: BucketPlace, file: GridFile, at: 'row-menu' | 'inspector'): readonly GridControl[] {
  const args = fileArgs(file);
  const elements = fileElements[at];
  const open = startControl(
    text.menu.open,
    { element: elements.open, feature: 'gridfs.open', tooltip: text.menu.openTooltip },
    place,
    args,
  );
  const download = startControl(
    text.menu.download,
    { element: elements.download, feature: 'gridfs.download', tooltip: text.menu.downloadTooltip },
    place,
    args,
  );
  if (place.readOnly) {
    return [open, download];
  }
  return [
    open,
    download,
    startControl(text.menu.rename, { element: elements.rename, feature: 'gridfs.rename' }, place, args),
    startControl(
      text.menu.delete,
      { element: elements.delete, feature: 'gridfs.delete', tooltip: text.menu.deleteTooltip },
      place,
      args,
    ),
  ];
}

function rowOf(place: BucketPlace, file: GridFile): FileRow {
  return {
    id: file.id,
    name: file.filename,
    size: sizeText(file.length),
    sizeTooltip: text.page.sizeTooltip(file.length, sizeText(file.chunkSize)),
    uploaded: file.uploadDate === undefined ? '' : localDateText(file.uploadDate),
    uploadedTooltip: file.uploadDate === undefined ? '' : new Date(file.uploadDate).toISOString(),
    type: file.contentType ?? '',
    metadata: metadataText(file.metadata),
    idText: file.idText,
    menu: fileControls(place, file, 'row-menu'),
  };
}

function columnsOf(sort: FilesSort): readonly ColumnView[] {
  const sortable = (key: SortField, label: string): ColumnView => ({
    key,
    label,
    sorts: true,
    ...(sort.field === key ? { sorted: sort.descending ? 'descending' : 'ascending' } : {}),
  });
  return [
    sortable('filename', text.page.columns.name),
    sortable('length', text.page.columns.size),
    sortable('uploadDate', text.page.columns.uploaded),
    { key: 'type', label: text.page.columns.type, sorts: false },
    { key: 'metadata', label: text.page.columns.metadata, sorts: false },
    { key: 'id', label: text.page.columns.id, sorts: false },
  ];
}

/** The pager, only when more than 100 files match: `101–200 of 1,234`. */
export function pagerOf(page: number, total: number): GridFsPageView['pager'] {
  if (total <= pageFiles) {
    return undefined;
  }
  const first = page * pageFiles + 1;
  const last = Math.min(total, (page + 1) * pageFiles);
  return {
    previous: { label: text.page.previous, enabled: page > 0 },
    range: text.page.range(first, last, total),
    next: { label: text.page.next, enabled: last < total },
  };
}

function emptyText(state: GridFsPageState): string {
  if (state.filter.trim() !== '') {
    return text.page.noMatch;
  }
  return state.place.readOnly ? text.page.emptyReadOnly : text.page.empty;
}

/** Feature: gridfs.show — what the page of the bucket shows. */
export function view(state: GridFsPageState): GridFsPageView {
  const place = state.place;
  const read = state.read;
  const files = read?.files ?? [];
  const showsEmpty = state.error === undefined && !state.loading && read !== undefined && files.length === 0;
  const pager = state.error === undefined && read !== undefined ? pagerOf(state.page, read.total) : undefined;
  return {
    title: place.bucket,
    toolbar: {
      filter: { placeholder: text.page.filter, value: state.filter },
      ...(read === undefined || read.total === 0
        ? {}
        : { summary: text.page.summary(read.total, sizeText(read.bytes)) }),
      ...(place.readOnly
        ? {}
        : {
            upload: startControl(
              text.page.upload,
              { element: 'gridfs.upload@toolbar', feature: 'gridfs.upload', tooltip: text.page.uploadTooltip },
              place,
              { from: 'page' },
            ),
          }),
      refresh: { label: text.page.refresh, tooltip: text.page.refreshTooltip },
    },
    columns: columnsOf(state.sort),
    rows: state.error === undefined ? files.map((file) => rowOf(place, file)) : [],
    dimmed: state.loading,
    ...(state.error === undefined ? {} : { error: state.error }),
    ...(showsEmpty ? { empty: emptyText(state) } : {}),
    ...(pager === undefined ? {} : { pager }),
    ...(place.readOnly ? { readOnly: { label: text.page.readOnly, tooltip: text.page.readOnlyTooltip } } : {}),
  };
}

/** Feature: gridfs.show — the tab of the bucket: made active when it is open, opened otherwise. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  if (!context.state.connections.saved.some((each) => each.id === place.connection && each.engine === 'mongodb')) {
    return run(appPlan(text.page.openPlan, []));
  }
  return planOf(context.state, {
    shows: {
      kind: 'page',
      connection: place.connection,
      page: 'gridfs',
      title: place.bucket,
      database: place.database,
      of: [place.bucket],
    },
    background: false,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.show'), plan };
