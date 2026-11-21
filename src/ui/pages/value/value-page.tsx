/**
 * `value.show` in a key tab: the value under the key's lines, read when the tab is first shown and again after every
 * refresh of its connection (`value.refresh`, the writes of Datardo). It draws the View of the value: the notice of a
 * type that changed, what is shown in the place of the value (the key gone with **Close tab**, a module's type, an
 * error with **Retry**, an empty value), the editor of a string, or the toolbar, the selection bar and the table of
 * the other types with **Load more**; a stream has the section bar of **Entries** and **Groups**
 * (`value.stream-groups`).
 */
import { useEffect } from 'react';
import type { Control, ValueView } from '../../../features/value/show';
import { checkText, counted, itemWords, viewText } from '../../../features/value/text';
import { isValueType, nameText } from '../../../features/value/types';
import type { AppState } from '../../../shared/state';
import type { ConnectionId } from '../../../shared/ids';
import { bytesOfHex } from '../../../features/key/types';
import { startFeature } from '../../shell/intent';
import { factsOf } from '../keys/keys-state';
import { StringEditor } from './string-editor';
import { copyRows, refreshValue, removeRows, selectedRows } from './value-actions';
import { GroupsSection, StreamSectionBar } from './value-groups';
import { loadMore, loadValue } from './value-reads';
import { fullView, selectedCount } from './value-state';
import {
  changeValue,
  freshValue,
  keepValueTab,
  useValueTab,
  valueTabOf,
  type ValueTab,
  type ValueWhere,
} from './value-store';
import { ValueTable } from './value-table';
import { TableToolbar } from './value-toolbar';
import styles from './value.module.css';

/** The key of a key tab, with its name in hexadecimal: the same text from one drawing to the next. */
export interface ValueAt {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly keyHex: string;
}

/** Keeps the tab's value, reads it when the tab is first shown connected, and again after a refresh of its connection. */
function useValueReads(tabId: string, at: ValueAt, app: AppState): void {
  const connected = factsOf(app, at.connection).connected;
  const refreshed = app.runner.refreshed;
  const { connection, database, keyHex } = at;
  useEffect(() => {
    if (valueTabOf(tabId) === undefined) {
      const where: ValueWhere = { connection, database, key: bytesOfHex(keyHex) ?? new Uint8Array() };
      keepValueTab(tabId, freshValue(where, refreshed.times));
    }
    const tab = valueTabOf(tabId);
    if (tab === undefined || !connected) {
      return;
    }
    const asked =
      refreshed.times !== tab.refreshes && (refreshed.connection === undefined || refreshed.connection === connection);
    if (asked || tab.run === 0) {
      changeValue(tabId, (now) => ({ ...now, refreshes: refreshed.times }));
      void loadValue(tabId);
    }
  }, [tabId, connection, database, keyHex, connected, refreshed]);
}
/** A control of the View in the place of the value: **Close tab**, **Retry**, **Load more**, **Open the console**. */
function MessageAction(props: { readonly tabId: string; readonly tab: ValueTab; readonly control: Control }) {
  const { tabId, tab, control } = props;
  const act = (): void => {
    if (control.feature === 'tab.close') {
      startFeature('tab.close', { place: 'empty-state', args: { tab: tabId } });
    } else if (control.feature === 'value.refresh') {
      void refreshValue(tabId, 'empty-state');
    } else if (control.feature === 'console.show') {
      startFeature('console.show', {
        place: 'empty-state',
        target: { kind: 'connection', connection: tab.where.connection },
      });
    } else {
      void loadMore(tabId);
    }
  };
  return (
    <button
      type="button"
      className={styles['button']}
      {...(control.element === undefined ? {} : { 'data-feature': control.element })}
      onClick={act}
    >
      {control.label}
    </button>
  );
}

function Message(props: { readonly tabId: string; readonly tab: ValueTab; readonly shown: ValueView }) {
  const { tabId, tab, shown } = props;
  const message = shown.message;
  if (message === undefined) {
    return null;
  }
  const alert = shown.status === 'gone' || shown.status === 'error';
  return (
    <div className={styles['message']} role={alert ? 'alert' : undefined}>
      <p>{message.text}</p>
      <div className={styles['buttons']}>
        {message.actions.map((control) => (
          <MessageAction key={control.label} tabId={tabId} tab={tab} control={control} />
        ))}
      </div>
      {shown.status === 'gone' && tab.draft !== undefined ? (
        <textarea className={styles['text']} aria-label="Text not saved" readOnly value={tab.draft} />
      ) : null}
    </div>
  );
}

/** The notice of a type that changed: with text typed and not saved, the view stays, with **Reload**. */
function Notice(props: { readonly tabId: string; readonly tab: ValueTab; readonly shown: ValueView }) {
  const { tabId, tab, shown } = props;
  const text =
    tab.found === undefined ? shown.notice : checkText.typeChangedNotice(nameText(tab.where.key), tab.found, tab.type);
  if (text === undefined) {
    return null;
  }
  return (
    <div className={styles['notice']} role="status">
      {text}{' '}
      {tab.found === undefined ? null : (
        <button type="button" className={styles['button']} onClick={() => void refreshValue(tabId)}>
          {viewText.reload}
        </button>
      )}
    </div>
  );
}

/** **Remove…** of the selection bar, by the type of the value. */
const removeElements: Readonly<Partial<Record<string, string>>> = {
  hash: 'value.remove-fields@selection-bar',
  list: 'value.remove-elements@selection-bar',
  set: 'value.remove-members@selection-bar',
  zset: 'value.remove-scored-members@selection-bar',
  stream: 'value.delete-entries@selection-bar',
};

/** The selection bar, while more than one row is selected. */
function SelectionBar(props: { readonly tabId: string; readonly tab: ValueTab; readonly readOnly: boolean }) {
  const { tabId, tab, readOnly } = props;
  const count = selectedCount(tab);
  if (count < 2 || !isValueType(tab.type)) {
    return null;
  }
  const [one, many] = itemWords[tab.type];
  const label = `${counted(count, one, many)} selected`;
  const rows = selectedRows(tab);
  return (
    <div className={styles['selection-bar']} role="toolbar" aria-label={label}>
      <span role="status">{label}</span>
      <button
        type="button"
        className={styles['button']}
        data-feature="value.copy@selection-bar"
        onClick={() => void copyRows(tabId, rows, 'rows', 'selection-bar')}
      >
        Copy
      </button>
      <button
        type="button"
        className={styles['button']}
        data-feature="value.copy@selection-bar"
        onClick={() => void copyRows(tabId, rows, 'command', 'selection-bar')}
      >
        Copy as command
      </button>
      {readOnly || removeElements[tab.type] === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={removeElements[tab.type]}
          onClick={() => void removeRows(tabId, rows, 'selection-bar')}
        >
          Remove…
        </button>
      )}
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          changeValue(tabId, (now) => ({ ...now, selection: { keys: new Set() } }));
        }}
      >
        Clear
      </button>
    </div>
  );
}

function TableSection(props: {
  readonly tabId: string;
  readonly tab: ValueTab;
  readonly shown: ValueView;
  readonly readOnly: boolean;
}) {
  const { tabId, tab, shown, readOnly } = props;
  const table = shown.table;
  if (table === undefined) {
    return null;
  }
  return (
    <>
      <TableToolbar tabId={tabId} tab={tab} shown={shown} />
      <SelectionBar tabId={tabId} tab={tab} readOnly={readOnly} />
      {shown.message === undefined ? (
        <ValueTable tabId={tabId} tab={tab} table={table} readOnly={readOnly} />
      ) : (
        <Message tabId={tabId} tab={tab} shown={shown} />
      )}
      {table.loadMore === undefined && table.note === undefined ? null : (
        <div className={styles['more']}>
          {table.note === undefined ? null : <span className={styles['muted']}>{table.note}</span>}
          {table.loadMore === undefined || shown.message !== undefined ? null : (
            <button
              type="button"
              className={styles['button']}
              data-feature={table.loadMore.element}
              disabled={tab.loadingMore}
              onClick={() => void loadMore(tabId)}
            >
              {table.loadMore.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** The value of a key tab. */
export function ValueSection(props: {
  readonly tabId: string;
  readonly at: ValueAt;
  readonly app: AppState;
}): React.JSX.Element {
  const { tabId, at, app } = props;
  useValueReads(tabId, at, app);
  const tab = useValueTab(tabId);
  if (tab === undefined) {
    return <section className={styles['section']} aria-label="Value" aria-busy="true" />;
  }
  const readOnly = factsOf(app, at.connection).readOnly;
  const shown = fullView(app, tab);
  const stringShown = tab.type === 'string' && tab.status === 'ready';
  const streamShown = tab.type === 'stream' && tab.status === 'ready' && tab.found === undefined;
  const groupsShown = streamShown && tab.section === 'groups';
  return (
    <section className={styles['section']} aria-label="Value" aria-busy={shown.status === 'loading' ? true : undefined}>
      <Notice tabId={tabId} tab={tab} shown={shown} />
      {streamShown ? <StreamSectionBar tabId={tabId} tab={tab} /> : null}
      {shown.table === undefined ? <Message tabId={tabId} tab={tab} shown={shown} /> : null}
      {stringShown ? <StringEditor tabId={tabId} tab={tab} shown={shown} /> : null}
      {groupsShown ? (
        <GroupsSection tabId={tabId} tab={tab} />
      ) : (
        <TableSection tabId={tabId} tab={tab} shown={shown} readOnly={readOnly} />
      )}
    </section>
  );
}
