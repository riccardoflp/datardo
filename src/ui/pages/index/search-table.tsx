/**
 * The table of search indexes of the Indexes section (`index.show`): **Name**, **Type**, **Status** with its colored
 * badges (and the badge of a new definition being built), **Queryable** and **Definition**, the lines of
 * `index.search-summary` joined by ` · ` with one line each in its tooltip.
 */
import type { SearchRow } from '../../../features/index/show';
import { text } from '../../../features/index/text';
import { selectIndex } from './index-actions';
import { IndexGrid, type GridRow } from './index-grid';
import type { PartProps } from './index-section';
import { startRowAction } from './row-actions';
import styles from './index.module.css';

function cellsOf(row: SearchRow): GridRow['cells'] {
  return [
    <span key="name" className={styles['code']}>
      {row.name}
    </span>,
    row.type,
    <span key="status" className={styles['badges']}>
      {row.status.map((badge) => (
        <span key={badge.label} className={styles['badge']} data-tone={badge.tone} title={badge.tooltip}>
          {badge.label}
        </span>
      ))}
    </span>,
    <span key="queryable" title={row.queryable.tooltip}>
      {row.queryable.label}
    </span>,
    <span key="definition" title={row.definitionLines.join('\n')}>
      {row.definition}
    </span>,
  ];
}

/** The table of search indexes. */
export function SearchTable(props: PartProps): React.JSX.Element {
  const list = props.memory.searchIndexes;
  const act = (name: string, element: string): void => {
    const index = list?.kind === 'indexes' ? list.indexes.find((each) => each.name === name) : undefined;
    if (index !== undefined) {
      startRowAction(props.place, element, { kind: 'search', index });
    }
  };
  const columns = text.show.searchColumns;
  const rows: readonly GridRow[] = props.shown.search.rows.map((row) => ({
    name: row.name,
    cells: cellsOf(row),
    selected: row.selected,
    menu: row.menu,
    ...(row.enter === undefined ? {} : { enter: row.enter }),
    ...(row.delete === undefined ? {} : { delete: row.delete }),
  }));
  return (
    <IndexGrid
      label={text.show.searchTable}
      headers={[columns.name, columns.type, columns.status, columns.queryable, columns.definition].map((label) => ({
        label,
      }))}
      rows={rows}
      onSelect={(name) => {
        selectIndex(props.place.tab, name === undefined ? undefined : { kind: 'search', name });
      }}
      onAction={act}
      onMenu={(name, x, y) => {
        const row = props.shown.search.rows.find((each) => each.name === name);
        if (row !== undefined) {
          props.openMenu({
            label: text.show.actions(name),
            x,
            y,
            actions: row.menu,
            choose: (action) => {
              act(name, action.element);
            },
          });
        }
      }}
    />
  );
}
