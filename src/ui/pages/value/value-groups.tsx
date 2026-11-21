/**
 * `value.stream-groups`: the **Groups** section of a stream's key tab, drawn from its View, and the section bar that
 * chooses between **Entries** and **Groups** (`@section-bar`). It shows the stream's lines, the table of groups, the
 * consumers of the group selected and the entries pending, a page at a time with **Load more**; a click on a pending ID
 * shows that entry in **Entries**. Nothing here writes: the console does (**Open the console**).
 */
import { useEffect } from 'react';
import { view, type GroupsTable } from '../../../features/value/stream-groups';
import { startFeature } from '../../shell/intent';
import { loadGroups, morePending, selectConsumer, selectGroup } from './value-groups-reads';
import { readFromToolbar } from './value-pages';
import { changeValue, type ValueTab } from './value-store';
import styles from './value.module.css';

/** Chooses the section of a stream's key tab; **Groups** is read when it opens. */
function chooseSection(tabId: string, section: ValueTab['section']): void {
  changeValue(tabId, (now) => ({ ...now, section }));
  if (section === 'groups') {
    void loadGroups(tabId);
  }
}

/** Shows an entry pending in **Entries**: the stream read from its ID to its ID, the entry selected. */
function showEntry(tabId: string, id: string): void {
  changeValue(tabId, (now) => ({
    ...now,
    section: 'entries',
    typed: { ...now.typed, From: id, To: id },
    selectFirst: true,
  }));
  void readFromToolbar(tabId, { from: id, to: id });
}

/** The section bar of a stream's key tab: **Entries** and **Groups**; the arrows move between them. */
export function StreamSectionBar({ tabId, tab }: { readonly tabId: string; readonly tab: ValueTab }) {
  const sections = [
    { section: 'entries', label: 'Entries' },
    { section: 'groups', label: 'Groups' },
  ] as const;
  return (
    <div className={styles['section-bar']} role="tablist" aria-label="Sections">
      {sections.map((entry, index) => (
        <button
          key={entry.section}
          type="button"
          role="tab"
          className={styles['section-button']}
          aria-selected={tab.section === entry.section}
          tabIndex={tab.section === entry.section ? 0 : -1}
          {...(entry.section === 'groups' ? { 'data-feature': 'value.stream-groups@section-bar' } : {})}
          onClick={() => {
            chooseSection(tabId, entry.section);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              const next = sections[(index + 1) % sections.length];
              if (next !== undefined) {
                chooseSection(tabId, next.section);
                const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
                buttons?.item((index + 1) % sections.length).focus();
              }
            }
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** A table of the section; the first cell of a row is a button when a click on it does something. */
function Table(props: {
  readonly label: string;
  readonly table: GroupsTable;
  readonly chosen?: string;
  readonly choose?: (name: string) => void;
}) {
  const { table, choose } = props;
  return (
    <>
      <table className={styles['groups-table']} aria-label={props.label}>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((cells, index) => (
            <tr key={`${cells[0] ?? ''}-${String(index)}`}>
              {cells.map((cell, at) => (
                <td key={String(at)}>
                  {at === 0 && choose !== undefined ? (
                    <button
                      type="button"
                      className={styles['link']}
                      aria-pressed={props.chosen === undefined ? undefined : props.chosen === cell}
                      onClick={() => {
                        choose(cell);
                      }}
                    >
                      {cell}
                    </button>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.empty === undefined ? null : <p className={styles['muted']}>{table.empty}</p>}
    </>
  );
}

/** The selected group's consumers and pending entries, with **Load more**. */
function GroupParts({ tabId, tab }: { readonly tabId: string; readonly tab: ValueTab }) {
  const groups = tab.groups ?? { status: 'loading' as const };
  const shown = view(groups);
  return (
    <>
      {shown.consumers === undefined ? null : (
        <Table
          label={`Consumers of ${groups.group ?? ''}`}
          table={shown.consumers}
          chosen={groups.consumer ?? ''}
          choose={(name) => void selectConsumer(tabId, name === groups.consumer ? undefined : name)}
        />
      )}
      {shown.pending === undefined ? null : (
        <Table
          label="Pending entries"
          table={shown.pending}
          choose={(id) => {
            showEntry(tabId, id);
          }}
        />
      )}
      {shown.loadMore === undefined ? null : (
        <div className={styles['buttons']}>
          <button
            type="button"
            className={styles['button']}
            onClick={() => void morePending(tabId, shown.loadMore?.after ?? '')}
          >
            {shown.loadMore.label}
          </button>
        </div>
      )}
    </>
  );
}

/** The **Groups** section of a stream's key tab. */
export function GroupsSection({ tabId, tab }: { readonly tabId: string; readonly tab: ValueTab }) {
  const unread = tab.groups === undefined;
  useEffect(() => {
    if (unread) {
      void loadGroups(tabId);
    }
  }, [tabId, unread]);
  const groups = tab.groups ?? { status: 'loading' as const };
  const shown = view(groups);
  return (
    <div className={styles['groups']} role="tabpanel" aria-label="Groups" aria-busy={shown.status === 'loading'}>
      {shown.error === undefined ? null : (
        <div role="alert">
          <p>{shown.error}</p>
          <button type="button" className={styles['button']} onClick={() => void loadGroups(tabId)}>
            {shown.retry?.label}
          </button>
        </div>
      )}
      <dl className={styles['stream-lines']}>
        {shown.lines.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {shown.groups === undefined ? null : (
        <Table
          label="Consumer groups"
          table={shown.groups}
          chosen={groups.group ?? ''}
          choose={(name) => void selectGroup(tabId, name)}
        />
      )}
      <GroupParts tabId={tabId} tab={tab} />
      <p className={styles['muted']}>
        {shown.readOnlyLine}{' '}
        <button
          type="button"
          className={styles['button']}
          onClick={() => {
            startFeature('console.show', { target: { kind: 'connection', connection: tab.where.connection } });
          }}
        >
          {shown.openConsole.label}
        </button>
      </p>
    </div>
  );
}
