/**
 * The table of indexes of the Indexes section (`index.show`): **Name**, **Keys**, **Properties** (the badges of
 * `index.properties`), **Size** with its bar and **Usage**. **Name**, **Size** and **Usage** sort it: first way,
 * reversed, then the server's order. A hidden index is dimmed; an index never used is marked.
 */
import { nextSort, type IndexRow, type IndexSort, type SortColumn } from '../../../features/index/show';
import { text } from '../../../features/index/text';
import type { IndexInfo } from '../../../features/index/types';
import { selectIndex } from './index-actions';
import { IndexGrid, type GridHeader, type GridRow } from './index-grid';
import type { PartProps } from './index-section';
import { changeIndexMemory } from './index-store';
import { startRowAction } from './row-actions';
import styles from './index.module.css';

function sortedAs(sort: IndexSort | undefined, column: SortColumn): GridHeader['sorted'] {
  if (sort?.column !== column) {
    return 'none';
  }
  return sort.descending ? 'descending' : 'ascending';
}

function headers(props: PartProps): readonly GridHeader[] {
  const { columns } = props.shown;
  const sort = props.memory.sort;
  const sorting = (column: SortColumn) => ({
    sorted: sortedAs(sort, column),
    onSort: () => {
      changeIndexMemory(props.place.tab, (memory) => {
        const { sort: before, ...rest } = memory;
        const next = nextSort(before, column);
        return next === undefined ? rest : { ...rest, sort: next };
      });
    },
  });
  return [
    { label: columns.name, ...sorting('name') },
    { label: columns.keys },
    { label: columns.properties },
    { label: columns.size, ...sorting('size') },
    { label: columns.usage, ...sorting('usage') },
  ];
}

function cellsOf(row: IndexRow): GridRow['cells'] {
  return [
    <span key="name" className={styles['code']}>
      {row.name}
    </span>,
    <span key="keys" className={styles['code']}>
      {row.keys}
    </span>,
    <span key="badges" className={styles['badges']}>
      {row.badges.map((badge) => (
        <span key={badge.label} className={styles['badge']} data-warning={badge.warning} title={badge.tooltip}>
          {badge.label}
        </span>
      ))}
    </span>,
    row.size === undefined ? null : (
      <span key="size" className={styles['size']} title={row.size.tooltip}>
        <span className={styles['bar']} aria-hidden="true">
          <span style={{ width: `${String(row.size.width)}%` }} />
        </span>
        {row.size.text}
      </span>
    ),
    <span key="usage" title={row.usage?.tooltip}>
      {row.usage?.text}
      {row.neverUsed ? <span className={styles['never']}>{text.show.neverUsedMark}</span> : null}
    </span>,
  ];
}

function indexNamed(props: PartProps, name: string): IndexInfo | undefined {
  const indexes = props.memory.indexes;
  return indexes?.kind === 'list' ? indexes.list.indexes.find((index) => index.name === name) : undefined;
}

/** The table of indexes. */
export function IndexTable(props: PartProps): React.JSX.Element {
  const act = (name: string, element: string): void => {
    const index = indexNamed(props, name);
    if (index !== undefined) {
      startRowAction(props.place, element, { kind: 'index', index });
    }
  };
  const rows: readonly GridRow[] = props.shown.rows.map((row) => ({
    name: row.name,
    cells: cellsOf(row),
    selected: row.selected,
    dimmed: row.dimmed,
    menu: row.menu,
    ...(row.enter === undefined ? {} : { enter: row.enter }),
    ...(row.delete === undefined ? {} : { delete: row.delete }),
  }));
  return (
    <IndexGrid
      label={text.section}
      headers={headers(props)}
      rows={rows}
      onSelect={(name) => {
        selectIndex(props.place.tab, name === undefined ? undefined : { kind: 'index', name });
      }}
      onAction={act}
      onMenu={(name, x, y) => {
        const row = props.shown.rows.find((each) => each.name === name);
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
