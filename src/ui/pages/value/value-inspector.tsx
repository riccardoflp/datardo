/**
 * `value.show` in the inspector island: the selected item of a key tab's table in full, with **Text**, **JSON**,
 * **Hex** (`value.format@inspector`) and **Copy** (`value.copy@inspector`); and the compact form of the key selected
 * in a keys tab (`value.show@inspector`): the count and the beginning of the value, with nothing that writes. The
 * key's own **Open in a tab** is above it, among the key's buttons (`key.inspect`).
 */
import { useEffect, useState } from 'react';
import type { ValueCount } from '../../../features/value/count';
import { shown as shownAs, type Format } from '../../../features/value/format';
import type { HashField, ScanPage } from '../../../features/value/read-hash';
import type { ListPage } from '../../../features/value/read-list';
import type { SortedSetPage } from '../../../features/value/read-sorted-set';
import type { StreamPage } from '../../../features/value/read-stream';
import type { StringPart } from '../../../features/value/read-string';
import { view, type ValueRow, type ValueView } from '../../../features/value/show';
import { hexOf, isValueType, nameText, type ValueType } from '../../../features/value/types';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId } from '../../../shared/ids';
import { useAppState } from '../../state/store';
import { copyCell, rowsInOrder } from './value-actions';
import { selectedIndex } from './value-state';
import { changeValue, useValueTab } from './value-store';
import styles from './value.module.css';

const formats: readonly (readonly [string, Format])[] = [
  ['Text', 'text'],
  ['JSON', 'json'],
  ['Hex', 'hex'],
];

/** The column whose cell the island shows in full. */
function mainColumn(type: string): string {
  return type === 'hash' ? 'Value' : type === 'list' ? 'Element' : 'Member';
}

/** The inspector island of a key tab with one row selected: the item in full. */
export function ValueItemInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useValueTab(tabId);
  if (tab === undefined) {
    return null;
  }
  const index = selectedIndex(tab);
  const row = index === undefined ? undefined : rowsInOrder(tab)[index];
  if (row === undefined) {
    return null;
  }
  const main = mainColumn(tab.type);
  const value = row.cells[main];
  const readOnly = app.connections.saved.find((each) => each.id === tab.where.connection)?.readOnly ?? true;
  const shown = view({
    form: 'full',
    key: nameText(tab.where.key),
    type: tab.type,
    readOnly,
    status: tab.status,
    rows: rowsInOrder(tab),
    choices: tab.choices,
    selected: index ?? 0,
  });
  const format = value instanceof Uint8Array ? shownAs(value, tab.choices[main], 'full').format : undefined;
  return (
    <div className={styles['inspected']}>
      {format === undefined ? null : (
        <div className={styles['buttons']}>
          <span className={styles['formats']} role="group" aria-label="Format">
            {formats.map(([label, each]) => (
              <button
                key={label}
                type="button"
                className={styles['button']}
                data-feature="value.format@inspector"
                aria-pressed={format === each}
                onClick={() => {
                  changeValue(tabId, (now) => ({ ...now, choices: { ...now.choices, [main]: each } }));
                }}
              >
                {label}
              </button>
            ))}
          </span>
          <button
            type="button"
            className={styles['button']}
            data-feature="value.copy@inspector"
            onClick={() => {
              if (value instanceof Uint8Array) {
                void copyCell(tabId, value, 'value', 'inspector');
              }
            }}
          >
            Copy
          </button>
        </div>
      )}
      <pre className={styles['full-text']}>{shown.inspector?.text}</pre>
    </div>
  );
}

/** Where the compact form reads: the key of the keys tab's selection. */
export interface CompactWhere {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly key: Uint8Array;
  readonly type: string;
}

const compactReads: Readonly<Record<ValueType, readonly [string, Json]>> = {
  string: ['value.read-string', { form: 'compact' }],
  hash: ['value.read-hash', { form: 'compact' }],
  set: ['value.read-set', { form: 'compact' }],
  list: ['value.read-list', { form: 'compact', from: 'head', index: '0', page: 0 }],
  zset: ['value.read-sorted-set', { form: 'compact', order: 'lowest', min: '', max: '', page: 0, older: false }],
  stream: ['value.read-stream', { form: 'compact', order: 'newest', from: '', to: '' }],
};

/** The rows of a compact read, by type. */
function compactRows(type: ValueType, result: unknown): readonly ValueRow[] {
  switch (type) {
    case 'hash':
      return (result as ScanPage<HashField>).items.map((item) => ({ cells: { Field: item.field, Value: item.value } }));
    case 'set':
      return (result as ScanPage<Uint8Array>).items.map((member) => ({ cells: { Member: member } }));
    case 'list':
      return (result as ListPage).elements.map((each) => ({
        cells: { Index: String(each.index), Element: each.element },
      }));
    case 'zset':
      return (result as SortedSetPage).members.map((each) => ({
        cells: { Rank: String(each.rank ?? ''), Member: each.member, Score: each.score },
      }));
    case 'stream':
      return (result as StreamPage).entries.map((entry) => ({ cells: {}, entry }));
    case 'string':
      return [];
  }
}

/** Reads the count and the beginning of the value, again after each refresh of the app. */
function useCompactRead(where: CompactWhere, refreshed: number): ValueView | undefined {
  const [shown, setShown] = useState<ValueView | undefined>(undefined);
  const keyText = nameText(where.key);
  const keyHex = hexOf(where.key);
  useEffect(() => {
    let current = true;
    const type = where.type;
    if (!isValueType(type)) {
      return undefined;
    }
    const target = { kind: 'key' as const, connection: where.connection, database: where.database, key: where.key };
    const [feature, args] = compactReads[type];
    void Promise.all([
      window.datardo.start({ feature: featureId('value.count'), target, place: 'inspector', args: { type } }),
      window.datardo.start({ feature: featureId(feature), target, place: 'inspector', args }),
    ]).then(([count, first]) => {
      if (!current) {
        return;
      }
      const failed = count.kind !== 'read' ? count : first.kind !== 'read' ? first : undefined;
      const total = count.kind === 'read' ? (count.result as ValueCount).count : 0;
      const part = type === 'string' && first.kind === 'read' ? (first.result as StringPart) : undefined;
      setShown(
        view({
          form: 'compact',
          key: keyText,
          type,
          readOnly: true,
          status: failed === undefined ? 'ready' : 'error',
          ...(failed?.kind === 'failed' || failed?.kind === 'refused' ? { error: failed.message } : {}),
          count: total,
          ...(part === undefined ? {} : { string: { length: part.length, loaded: part.bytes ?? new Uint8Array() } }),
          rows: first.kind === 'read' ? compactRows(type, first.result) : [],
        }),
      );
    });
    return () => {
      current = false;
    };
    // The key is followed by its bytes in hexadecimal: the array itself is made again at each drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where.connection, where.database, keyHex, where.type, refreshed]);
  return shown;
}

/** The compact form of the value of the key selected in a keys tab. */
export function ValueCompact({ where }: { readonly where: CompactWhere }): React.JSX.Element | null {
  const refreshed = useAppState().runner.refreshed.times;
  const shown = useCompactRead(where, refreshed);
  return (
    <section
      className={styles['compact']}
      aria-label="Value"
      data-feature="value.show@inspector"
      aria-busy={shown === undefined ? true : undefined}
    >
      {shown?.message === undefined ? null : <p className={styles['muted']}>{shown.message.text}</p>}
      {shown?.editor === undefined ? null : (
        <>
          <pre className={styles['compact-text']}>{shown.editor.text}</pre>
          {shown.editor.note === undefined ? null : <p className={styles['muted']}>{shown.editor.note}</p>}
        </>
      )}
      {shown?.table === undefined || shown.message !== undefined ? null : (
        <>
          <table className={styles['compact-table']}>
            <thead>
              <tr>
                {shown.table.columns.map((column) => (
                  <th key={column.name} scope="col">
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.table.rows.map((cells, index) => (
                <tr key={String(index)}>
                  {cells.map((cell, at) => (
                    <td key={String(at)} title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.table.note === undefined ? null : <p className={styles['muted']}>{shown.table.note}</p>}
        </>
      )}
    </section>
  );
}
