/**
 * `undo.show`: the **Undo history** page. Its toolbar has the filter, the summary, **Undo last change**
 * (`undo.last@toolbar`), **Settings** and **Clear history…** (`undo.clear@toolbar`); then the notice when the history
 * is off, the message line of the last undo started from the page, and the table of the operations, newest first.
 */
import { useEffect, useState } from 'react';
import { view, type ShowView } from '../../../features/undo/show';
import { pageText } from '../../../features/undo/text';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { setFilter, useUndoPage, withPageFields } from './undo-page-store';
import { UndoRow } from './undo-row';
import styles from './undo-page.module.css';

function Toolbar({ toolbar }: { readonly toolbar: ShowView['toolbar'] }): React.JSX.Element {
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={pageText.title}>
      <input
        className={styles['input']}
        type="search"
        placeholder={toolbar.filter.placeholder}
        aria-label={toolbar.filter.placeholder}
        value={toolbar.filter.value}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />
      <span className={styles['summary']} title={toolbar.summary.tooltip}>
        {toolbar.summary.text}
      </span>
      <span className={styles['spacer']} />
      <button
        type="button"
        className={styles['button']}
        data-feature={toolbar.undoLast.element}
        disabled={!toolbar.undoLast.enabled}
        onClick={() => {
          startFeature('undo.last', { place: 'toolbar' });
        }}
      >
        {toolbar.undoLast.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          startFeature(toolbar.settings.feature, { place: 'toolbar', args: toolbar.settings.args });
        }}
      >
        {toolbar.settings.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        data-feature={toolbar.clear.element}
        disabled={!toolbar.clear.enabled}
        onClick={() => {
          startFeature('undo.clear', { place: 'toolbar' });
        }}
      >
        {toolbar.clear.label}
      </button>
    </div>
  );
}

/** How often **when** is written again (`14:05:09` becomes `yesterday 14:05` after midnight). */
const clockMs = 30_000;

/** The time **when** is written from, read again every 30 seconds. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, clockMs);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** The **Undo history** page. */
export function UndoHistoryPage(): React.JSX.Element {
  const state = useAppState();
  const fields = useUndoPage();
  const now = useNow();
  const undo = withPageFields(state.undo, fields);
  const page = view({ undo, connections: state.connections.saved, settings: state.settings, now });
  return (
    <div className={styles['page']}>
      <Toolbar toolbar={page.toolbar} />
      {page.notice === undefined ? null : (
        <p className={styles['notice']} role="status">
          {page.notice}
        </p>
      )}
      {page.message === undefined ? null : (
        <p
          className={styles['message']}
          role={page.message.failed ? 'alert' : 'status'}
          data-failed={page.message.failed ? 'true' : undefined}
        >
          {page.message.text}
        </p>
      )}
      <div className={styles['scroller']}>
        {page.empty === undefined ? (
          <table className={styles['table']} aria-label={page.title}>
            <thead>
              <tr>
                {page.columns.map((column) => (
                  <th key={column} scope="col" className={styles['heading']}>
                    {column}
                  </th>
                ))}
                <th scope="col" className={`${styles['heading'] ?? ''} ${styles['actions'] ?? ''}`}>
                  <span className={styles['hidden']}>{pageText.undo}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => {
                const entry = state.undo.entries.find((each) => each.id === row.id);
                return entry === undefined ? null : <UndoRow key={row.id} row={row} entry={entry} />;
              })}
            </tbody>
          </table>
        ) : (
          <p className={styles['empty']}>{page.empty}</p>
        )}
      </div>
    </div>
  );
}
