/**
 * `history.show`: the document history page of the active tab. Its toolbar (`<database>.<collection>`, the `_id`,
 * **Open document**, **Refresh**), the line on the oplog, the message of the last restore, then the list of the writes,
 * newest first; selecting one, with a click or the arrow keys, shows its version in the inspector island
 * (`history.version-detail`), and `Enter` moves the focus there. The page reads the oplog when it opens, when it is
 * opened again for the same document, and after a write to its connection.
 */
import { useEffect } from 'react';
import { lastOpened, view, type HistoryOf, type HistoryPageView, type WriteRow } from '../../../features/history/show';
import { showText } from '../../../features/history/text';
import type { DetailControl } from '../../../features/history/version-detail';
import { featureId } from '../../../shared/ids';
import { activeTabOf } from '../../../shared/state/tabs';
import { focusIsland } from '../../shell/focus';
import { startFeature } from '../../shell/intent';
import { documentShows } from '../document/document-actions';
import { useAppState } from '../../state/store';
import {
  historyOfShows,
  offsetMinutes,
  readHistory,
  restoreVersion,
  selectWrite,
  useHistoryTab,
  type HistoryTab,
} from './history-store';
import styles from './history-page.module.css';

/** Starts a control of the page: a read, a restore, or another feature. */
export function startControl(tab: string, page: HistoryTab, control: DetailControl): void {
  if (control.disabled === true) {
    return;
  }
  if (control.feature === 'history.read-writes') {
    void readHistory(tab, page.of, control.element === 'history.read-writes@list');
    return;
  }
  if (control.feature === 'document.restore-version') {
    const key = (control.args as { readonly key?: unknown } | null)?.key;
    if (typeof key === 'string') {
      void restoreVersion(tab, key);
    }
    return;
  }
  const { of } = page;
  void window.datardo.start({
    feature: featureId(control.feature),
    target: { kind: 'collection', connection: of.connection, database: of.database, collection: of.collection },
    place: control.element.endsWith('@inspector') ? 'inspector' : 'list',
    args: control.args,
  });
}

/** **Open document**: the document as it is now in a document tab (`document.open`), or its tab made active. */
function openDocument(of: HistoryOf): void {
  startFeature('tab.open', { place: 'toolbar', args: { shows: documentShows(of, of.id) } });
}

function Toolbar(props: { readonly tab: string; readonly page: HistoryTab; readonly shown: HistoryPageView }) {
  const { toolbar } = props.shown;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={showText.command}>
      <span className={styles['place']}>{toolbar.place}</span>
      <code className={styles['id']}>{toolbar.id}</code>
      <span className={styles['spacer']} />
      <button
        type="button"
        className={styles['button']}
        title={toolbar.openDocument.tooltip}
        onClick={() => {
          openDocument(props.page.of);
        }}
      >
        {toolbar.openDocument.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        data-feature={toolbar.refresh.element}
        title={toolbar.refresh.tooltip}
        aria-disabled={toolbar.refresh.disabled === true ? true : undefined}
        onClick={() => {
          startControl(props.tab, props.page, toolbar.refresh);
        }}
      >
        {toolbar.refresh.label}
      </button>
    </div>
  );
}

function rowId(tab: string, key: string): string {
  return `history-${tab}-${key.replace(/[^\w-]/gu, '-')}`;
}

function Row(props: { readonly tab: string; readonly page: HistoryTab; readonly row: WriteRow }) {
  const { tab, page, row } = props;
  return (
    <tr
      id={rowId(tab, row.key)}
      className={styles['row']}
      aria-selected={row.selected}
      data-feature={row.select}
      onClick={() => {
        selectWrite(tab, row.key);
      }}
    >
      <td title={row.timeTip}>{row.time}</td>
      <td>{row.write}</td>
      <td className={styles['changes']}>{row.changes}</td>
      <td>
        {row.by.map((mark) => (
          <span key={mark.text} className={styles['mark']} title={mark.tooltip}>
            {mark.text}
          </span>
        ))}
      </td>
      <td>
        {row.version === undefined ? null : (
          <span className={styles['mark']} title={row.version.tooltip}>
            {row.version.text}
          </span>
        )}
      </td>
      <td className={styles['actions']}>
        {row.restore === undefined ? null : (
          <button
            type="button"
            className={styles['button']}
            data-feature={row.restore.element}
            title={row.restore.tooltip}
            aria-disabled={row.restore.disabled === true ? true : undefined}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              if (row.restore !== undefined) {
                startControl(tab, page, row.restore);
              }
            }}
          >
            {row.restore.label}
          </button>
        )}
      </td>
    </tr>
  );
}

function moveSelection(tab: string, rows: readonly WriteRow[], key: string | undefined, step: number): void {
  const index = rows.findIndex((row) => row.key === key);
  const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
  if (next !== undefined) {
    selectWrite(tab, next.key);
    document.getElementById(rowId(tab, next.key))?.scrollIntoView({ block: 'nearest' });
  }
}

function WriteList(props: {
  readonly tab: string;
  readonly page: HistoryTab;
  readonly body: Extract<HistoryPageView['body'], { kind: 'list' }>;
  readonly selected: string | undefined;
}) {
  const { tab, page, body, selected } = props;
  return (
    <table
      className={styles['table']}
      role="grid"
      aria-label={showText.command}
      tabIndex={0}
      aria-activedescendant={selected === undefined ? undefined : rowId(tab, selected)}
      data-feature="history.version-detail@list"
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(tab, body.rows, selected, event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          focusIsland('inspector');
        }
      }}
    >
      <thead>
        <tr>
          {body.columns.map((column) => (
            <th key={column} scope="col" className={styles['heading']}>
              {column}
            </th>
          ))}
          <th scope="col" className={styles['heading']}>
            <span className={styles['hidden']}>{showText.restore}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {body.rows.map((row) => (
          <Row key={row.key} tab={tab} page={page} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function Body(props: { readonly tab: string; readonly page: HistoryTab; readonly shown: HistoryPageView }) {
  const { tab, page, shown } = props;
  const { body } = shown;
  if (body.kind === 'list') {
    return <WriteList tab={tab} page={page} body={body} selected={shown.selected} />;
  }
  return (
    <p className={styles['note']} role={body.kind === 'message' ? 'alert' : 'status'}>
      {body.text}
    </p>
  );
}

/** What each tab's page has followed: the time it was last opened, and the writes asked to read again. */
const followed = new Map<string, { readonly opened?: number; readonly refreshed: number }>();

/**
 * Reads the oplog when the page first opens, when it is opened again for the same document (`history.show`
 * remembers when), and after a write to its connection; not when its tab is only made active again.
 */
function useReads(tab: string, of: HistoryOf): void {
  const state = useAppState();
  const opened = lastOpened(state.runner.remembered['history.show']);
  const refreshed = state.runner.refreshed;
  const openedOf = opened === undefined ? undefined : historyOfShows(opened.shows);
  const same =
    openedOf !== undefined &&
    openedOf.connection === of.connection &&
    openedOf.database === of.database &&
    openedOf.collection === of.collection &&
    JSON.stringify(openedOf.id) === JSON.stringify(of.id);
  const openedAt = same ? opened?.at : undefined;
  useEffect(() => {
    const last = followed.get(tab);
    const openedAgain = openedAt !== undefined && openedAt !== last?.opened;
    const written =
      last !== undefined &&
      refreshed.times !== last.refreshed &&
      (refreshed.connection === undefined || refreshed.connection === of.connection);
    const keptOpened = openedAt ?? last?.opened;
    followed.set(tab, { ...(keptOpened === undefined ? {} : { opened: keptOpened }), refreshed: refreshed.times });
    if (last === undefined || openedAgain || written) {
      void readHistory(tab, of);
    }
    // The page reads again when it is opened again or written to; not at every change of the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, openedAt, refreshed.times]);
}

function TabPage({ tab, of }: { readonly tab: string; readonly of: HistoryOf }): React.JSX.Element {
  const state = useAppState();
  const page = useHistoryTab(tab);
  useReads(tab, of);
  const saved = state.connections.saved.find((each) => each.id === of.connection);
  const shown =
    page === undefined
      ? undefined
      : view({
          connectionName: saved?.name ?? of.connection,
          readOnly: saved?.readOnly ?? false,
          database: of.database,
          collection: of.collection,
          idText: of.idText,
          offsetMinutes: offsetMinutes(),
          status: page.status,
          ...(page.oplog === undefined ? {} : { oplog: page.oplog }),
          ...(page.read === undefined ? {} : { read: page.read }),
          ...(page.history === undefined ? {} : { history: page.history }),
          exists: page.current !== null,
          own: page.own,
          ...(page.restoreMessage === undefined ? {} : { restoreMessage: page.restoreMessage }),
          ...(page.selected === undefined ? {} : { selected: page.selected }),
        });
  if (page === undefined || shown === undefined) {
    return (
      <div className={styles['page']}>
        <p className={styles['note']} role="status">
          {showText.loading}
        </p>
      </div>
    );
  }
  return (
    <div className={styles['page']}>
      <Toolbar tab={tab} page={page} shown={shown} />
      {shown.oplogLine === undefined ? null : <p className={styles['line']}>{shown.oplogLine}</p>}
      {shown.restoreMessage === undefined ? null : (
        <p className={styles['line']} role="status">
          {shown.restoreMessage}
        </p>
      )}
      {shown.conflict === undefined ? null : <p className={styles['warning']}>{shown.conflict}</p>}
      {shown.loadingOlder === undefined ? null : (
        <p className={styles['line']} role="status">
          {shown.loadingOlder}
        </p>
      )}
      <div className={styles['scroller']}>
        <Body tab={tab} page={page} shown={shown} />
        {shown.endNote === undefined ? null : <p className={styles['note']}>{shown.endNote}</p>}
        {shown.more === undefined ? null : (
          <div className={styles['more']}>
            <span>{shown.more.text}</span>
            <button
              type="button"
              className={styles['button']}
              data-feature={shown.more.loadOlder.element}
              title={shown.more.loadOlder.tooltip}
              aria-disabled={shown.more.loadOlder.disabled === true ? true : undefined}
              onClick={() => {
                if (shown.more !== undefined) {
                  startControl(tab, page, shown.more.loadOlder);
                }
              }}
            >
              {shown.more.loadOlder.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The document history page of the active tab. */
export function HistoryPage(): React.JSX.Element | null {
  const state = useAppState();
  const active = activeTabOf(state.tabs);
  const of = active === undefined ? undefined : historyOfShows(active.shows);
  return active === undefined || of === undefined ? null : <TabPage key={active.id} tab={active.id} of={of} />;
}
