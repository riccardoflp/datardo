/**
 * The list of the differences of the comparison page (`compare.show`, `@table`): the kind, the `_id` in mongosh
 * syntax and what differs, then the buttons of the row (`compare.copy-document`). A click or the arrow keys select a
 * row, whose difference the inspector island shows; `Enter` moves the focus there.
 */
import type { ComparePageView } from '../../../features/compare/show';
import type { RowView } from '../../../features/compare/page/rows';
import { text } from '../../../features/compare/text';
import { idKey } from '../../../features/compare/types';
import { focusIsland } from '../../shell/focus';
import { compareTabOf } from './compare-store';
import { copyDocument, selectRow } from './compare-writes';
import styles from './compare-page.module.css';

/** The column headings of the list. */
const columns = [text.list.kind, text.list.id, text.list.what] as const;

function rowId(tab: string, row: RowView): string {
  return `${tab}-difference-${String(Math.abs(hashOf(idKey(row.id))))}`;
}

function hashOf(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return hash;
}

function Row(props: { readonly tab: string; readonly row: RowView; readonly selected: boolean }): React.JSX.Element {
  const { tab, row, selected } = props;
  return (
    <tr
      id={rowId(tab, row)}
      className={styles['row']}
      aria-selected={selected}
      data-kind={row.kind}
      onClick={() => void selectRow(tab, row.id)}
    >
      <td>{row.kindLabel}</td>
      <td className={styles['code']}>{row.idText}</td>
      <td className={styles['what']} title={row.what}>
        {row.what}
      </td>
      <td className={styles['actions']}>
        {row.buttons.map((button) => (
          <button
            key={`${button.to}-${button.label}`}
            type="button"
            className={styles['button']}
            data-feature={button.element}
            title={button.hint}
            aria-disabled={button.enabled ? undefined : true}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              if (button.enabled) void copyDocument(tab, row.id, button.to);
            }}
          >
            {button.label}
          </button>
        ))}
      </td>
    </tr>
  );
}

function moveSelection(tab: string, rows: readonly RowView[], step: number): void {
  const selected = compareTabOf(tab)?.page.selected?.id;
  const index = selected === undefined ? -1 : rows.findIndex((row) => idKey(row.id) === idKey(selected));
  const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
  if (next !== undefined) {
    void selectRow(tab, next.id);
    document.getElementById(rowId(tab, next))?.scrollIntoView({ block: 'nearest' });
  }
}

/** The list, or the sentence that stands for it when it is empty. */
export function CompareList({ tab, shown }: { readonly tab: string; readonly shown: ComparePageView }) {
  const selected = compareTabOf(tab)?.page.selected?.id;
  const selectedRow = selected === undefined ? undefined : shown.rows.find((row) => idKey(row.id) === idKey(selected));
  if (shown.rows.length === 0) {
    return shown.empty === undefined ? null : <p className={styles['note']}>{shown.empty}</p>;
  }
  return (
    <div className={styles['scroller']}>
      <table
        className={styles['table']}
        role="grid"
        aria-label={shown.title}
        tabIndex={0}
        aria-activedescendant={selectedRow === undefined ? undefined : rowId(tab, selectedRow)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(tab, shown.rows, event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            focusIsland('inspector');
          }
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className={styles['heading']}>
                {column}
              </th>
            ))}
            <th scope="col" className={styles['heading']}>
              <span className={styles['hidden']}>{text.list.write}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.rows.map((row) => (
            <Row key={idKey(row.id)} tab={tab} row={row} selected={row === selectedRow} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
