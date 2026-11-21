/**
 * `gridfs.show`: the page of a bucket, drawn from its View: the toolbar (the filter, the summary, **Upload…**,
 * **Refresh**), the table of a page of files or what takes its place (an error, an empty bucket, no file that
 * matches), and the pager. The files are read when the tab is first shown connected, 300 ms after the filter was last
 * typed in, when the sort or the page changes, on **Refresh**, and after every refresh of its connection (the writes
 * of this area, of the document tab); a refresh also forgets the previews read.
 */
import { useEffect, useMemo, useState } from 'react';
import { bucketOfShows } from '../../../features/gridfs/commands';
import { filterWaitMs, view, type FileRow, type GridFsPageView } from '../../../features/gridfs/show';
import type { BucketRef } from '../../../features/gridfs/types';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { startControl } from './gridfs-actions';
import { FileMenu, type OpenFileMenu } from './gridfs-menu';
import { readFiles } from './gridfs-reads';
import { isConnected, pageStateOf, placeOf } from './gridfs-state';
import { changeTab, forgetClosed, freshTab, gridFsTabOf, keepTab, useGridFsTab, type GridFsTab } from './gridfs-store';
import { GridFsTable } from './gridfs-table';
import styles from './gridfs-page.module.css';

/** **Refresh**, and a refresh of the connection: the page read again, the previews forgotten. */
export function readAgain(tabId: string, change: (state: GridFsTab) => GridFsTab = (state) => state): void {
  changeTab(tabId, (state) => ({ ...change(state), previews: new Map() }));
  void readFiles(tabId);
}

/** Keeps the tab's state, reads when it is first shown connected, and again after a refresh of its connection. */
function useReads(tabId: string, ref: BucketRef, app: AppState): void {
  const connected = isConnected(app, ref);
  const refreshed = app.runner.refreshed;
  useEffect(() => {
    if (gridFsTabOf(tabId) === undefined) {
      keepTab(tabId, freshTab(ref, refreshed.times));
    }
    const tab = gridFsTabOf(tabId);
    if (tab === undefined || !connected) {
      return;
    }
    const asked =
      refreshed.times !== tab.refreshes &&
      (refreshed.connection === undefined || refreshed.connection === ref.connection);
    if (asked) {
      readAgain(tabId, (state) => ({ ...state, refreshes: refreshed.times }));
    } else if (tab.read === undefined && !tab.loading && tab.error === undefined) {
      void readFiles(tabId);
    }
  }, [tabId, ref, connected, refreshed]);
}

/** Reads 300 ms after the filter was last typed in, from the first page. */
function useFilterRead(tabId: string, tab: GridFsTab | undefined): void {
  const typed = tab?.typed;
  const filter = tab?.filter;
  useEffect(() => {
    if (typed === undefined || typed === filter) {
      return undefined;
    }
    const timer = setTimeout(() => {
      changeTab(tabId, (state) => ({ ...state, filter: state.typed, page: 0 }));
      void readFiles(tabId);
    }, filterWaitMs);
    return () => {
      clearTimeout(timer);
    };
  }, [tabId, typed, filter]);
}

function Toolbar(props: { readonly tabId: string; readonly tab: GridFsTab; readonly page: GridFsPageView }) {
  const { tabId, tab, page } = props;
  const upload = page.toolbar.upload;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={page.title}>
      <input
        type="search"
        className={styles['filter']}
        aria-label={page.toolbar.filter.placeholder}
        placeholder={page.toolbar.filter.placeholder}
        spellCheck={false}
        value={tab.typed}
        onChange={(event) => {
          const typed = event.currentTarget.value;
          changeTab(tabId, (state) => ({ ...state, typed }));
        }}
      />
      <span className={styles['summary']} role="status">
        {page.toolbar.summary ?? ''}
      </span>
      <span className={styles['spacer']} />
      {upload?.kind === 'start' ? (
        <button
          type="button"
          className={styles['button']}
          data-feature={upload.element}
          title={upload.tooltip}
          onClick={() => {
            startControl(upload, 'toolbar');
          }}
        >
          {upload.label}
        </button>
      ) : null}
      <button
        type="button"
        className={styles['button']}
        title={page.toolbar.refresh.tooltip}
        onClick={() => {
          readAgain(tabId);
        }}
      >
        {page.toolbar.refresh.label}
      </button>
    </div>
  );
}

function Pager(props: { readonly tabId: string; readonly page: GridFsPageView }) {
  const pager = props.page.pager;
  if (pager === undefined) {
    return null;
  }
  const go = (by: number): void => {
    changeTab(props.tabId, (state) => ({ ...state, page: Math.max(0, state.page + by) }));
    void readFiles(props.tabId);
  };
  return (
    <div className={styles['pager']} role="navigation" aria-label={pager.range}>
      <button
        type="button"
        className={styles['button']}
        disabled={!pager.previous.enabled}
        onClick={() => {
          go(-1);
        }}
      >
        {pager.previous.label}
      </button>
      <span>{pager.range}</span>
      <button
        type="button"
        className={styles['button']}
        disabled={!pager.next.enabled}
        onClick={() => {
          go(1);
        }}
      >
        {pager.next.label}
      </button>
    </div>
  );
}

function GridFsTabPage(props: { readonly tabId: string; readonly bucket: BucketRef; readonly app: AppState }) {
  const { tabId, app } = props;
  const { connection, database, bucket } = props.bucket;
  const ref = useMemo(() => ({ connection, database, bucket }), [connection, database, bucket]);
  useReads(tabId, ref, app);
  const tab = useGridFsTab(tabId);
  useFilterRead(tabId, tab);
  const [menu, setMenu] = useState<OpenFileMenu | undefined>(undefined);
  if (tab === undefined) {
    return null;
  }
  const page = view(pageStateOf(tab, placeOf(app, ref)));
  const openRowMenu = (row: FileRow, x: number, y: number): void => {
    setMenu({ label: row.name, x, y, controls: row.menu });
  };
  return (
    <div className={styles['page']}>
      <Toolbar tabId={tabId} tab={tab} page={page} />
      {page.error !== undefined ? (
        <p className={styles['error']} role="alert">
          {page.error}
        </p>
      ) : page.empty !== undefined ? (
        <p className={styles['empty']}>{page.empty}</p>
      ) : (
        <GridFsTable tabId={tabId} tab={tab} page={page} openRowMenu={openRowMenu} />
      )}
      <Pager tabId={tabId} page={page} />
      <FileMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}

/** The page of the active tab of a bucket. */
export function GridFsPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosed(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  const bucket = active === undefined ? undefined : bucketOfShows(active.shows);
  if (active === undefined || bucket === undefined) {
    return null;
  }
  return <GridFsTabPage key={active.id} tabId={active.id} bucket={bucket} app={app} />;
}
