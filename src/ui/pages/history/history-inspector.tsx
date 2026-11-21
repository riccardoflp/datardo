/**
 * `history.version-detail`: the version of the write selected on the document history page, in the inspector island,
 * with **Restore this version…** (or **Insert again…**) and **Copy version**, its notes, the table of what changed and
 * the document after the write, with `?` for its unknown values. Also what the page adds to its tab for the island
 * (`nav.inspector`): whether a write is selected, and its time as the island's title.
 */
import { view as detailView, type DiffCell, type TextSegment } from '../../../features/history/version-detail';
import { detailText } from '../../../features/history/text';
import type { Inspection } from '../../../features/nav/types';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { startControl } from './history-page';
import { historyTabOf, newestFirst, offsetMinutes, useHistoryTab, type HistoryTab } from './history-store';
import styles from './history-page.module.css';

function Segments({ segments }: { readonly segments: readonly TextSegment[] }): React.JSX.Element {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span key={index} className={styles['unknown']} title={segment.tooltip}>
            {segment.text}
          </span>
        ),
      )}
    </>
  );
}

function Cell({ cell }: { readonly cell: DiffCell }): React.JSX.Element {
  if (cell.kind === 'value') {
    return (
      <td>
        <Segments segments={cell.segments} />
        {cell.type === undefined ? null : <span className={styles['type']}> {cell.type}</span>}
      </td>
    );
  }
  return (
    <td className={cell.kind === 'unknown' ? styles['unknown'] : styles['type']} title={cell.tooltip}>
      {cell.text}
    </td>
  );
}

/** The write selected on a page: the one chosen, or the newest. */
function selectedVersion(page: HistoryTab) {
  const versions = newestFirst(page);
  return versions.find((version) => version.key === page.selected) ?? versions[0];
}

function detailOf(app: AppState, page: HistoryTab) {
  const version = selectedVersion(page);
  const saved = app.connections.saved.find((each) => each.id === page.of.connection);
  const current = version !== undefined && page.current !== null && version === newestFirst(page)[0];
  const ownTitle = version === undefined ? undefined : page.own[version.key];
  return detailView({
    pageReady: page.status.kind === 'loaded' || (page.status.kind === 'loading' && page.status.older),
    ...(version === undefined ? {} : { version }),
    current,
    exists: page.current !== null,
    ...(ownTitle === undefined ? {} : { ownTitle }),
    ...(saved?.readOnly === true ? { readOnly: saved.name } : {}),
    loading: page.status.kind === 'loading',
    offsetMinutes: offsetMinutes(),
  });
}

/** The version of the selected write, as the inspector island draws it. */
export function HistoryInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const page = useHistoryTab(tabId);
  if (page === undefined) {
    return null;
  }
  const detail = detailOf(app, page);
  if (detail.kind === 'empty') {
    return null;
  }
  if (detail.kind === 'nothing-selected') {
    return <p className={styles['note']}>{detail.text}</p>;
  }
  return (
    <div className={styles['detail']}>
      <h2 className={styles['detailHeading']}>{detail.heading}</h2>
      <div className={styles['buttons']}>
        {detail.buttons.map((button) => (
          <button
            key={button.element}
            type="button"
            className={styles['button']}
            data-feature={button.element}
            title={button.tooltip}
            aria-disabled={button.disabled === true ? true : undefined}
            onClick={() => {
              startControl(tabId, page, button);
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
      {detail.notes.map((note) => (
        <p key={note} className={styles['note']}>
          {note}
        </p>
      ))}
      {detail.noChange === undefined ? null : <p className={styles['note']}>{detail.noChange}</p>}
      {detail.table === undefined ? null : (
        <table className={styles['diff']} aria-label={detailText.columns.field}>
          <thead>
            <tr>
              {detail.table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.table.lines.map((line) => (
              <tr key={line.field} data-kind={line.kind}>
                <th scope="row">{line.field}</th>
                <Cell cell={line.before} />
                <Cell cell={line.after} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detail.document === undefined ? null : (
        <details open={detail.document.open}>
          <summary className={styles['summary']}>{detail.document.title}</summary>
          <pre className={styles['document']}>
            <Segments segments={detail.document.segments} />
          </pre>
        </details>
      )}
    </div>
  );
}

/** What a history tab adds to the active tab for the inspector island: the write selected, and its time. */
export function historyExtras(app: AppState, tabId: string): { inspection?: Inspection } {
  const page = historyTabOf(tabId);
  if (page === undefined || activeTabOf(app.tabs)?.id !== tabId) {
    return {};
  }
  const detail = detailOf(app, page);
  if (detail.kind === 'version') {
    return { inspection: { selected: 1, title: detail.heading, emptyLine: '' } };
  }
  return { inspection: { selected: 0, emptyLine: detail.kind === 'nothing-selected' ? detail.text : '' } };
}
