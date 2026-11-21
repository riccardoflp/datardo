/**
 * The table of the Schema section (`schema.show`): **Field**, **Present**, **Types** and **Values**, one row per field,
 * the nested fields of an expanded field under it, indented. A click on the name of a field with nested fields shows
 * or hides them; the whole path is its hint.
 */
import type { SchemaRow, SchemaSectionView } from '../../../features/schema/show';
import { text } from '../../../features/schema/text';
import { TypesView, ValuesView, type OnFilter } from './schema-values';
import styles from './schema.module.css';

/** What the table is drawn with. */
export interface TableProps {
  readonly shown: SchemaSectionView;
  readonly onFilter: OnFilter;
  readonly onExpand: (expanded: readonly string[]) => void;
}

function FieldCell({ row, onExpand }: { readonly row: SchemaRow; readonly onExpand: TableProps['onExpand'] }) {
  const indent = { paddingInlineStart: `calc(var(--space-4) * ${String(row.depth)})` };
  const { toggle } = row;
  return (
    <td className={styles['field']} style={indent}>
      {toggle === undefined ? (
        <span className={styles['name']} title={row.label}>
          <span className={styles['twisty']} aria-hidden="true" />
          {row.name}
        </span>
      ) : (
        <button
          type="button"
          className={styles['name-button']}
          title={row.label}
          aria-expanded={toggle.expanded}
          onClick={() => {
            onExpand(toggle.next);
          }}
        >
          <span className={styles['twisty']} aria-hidden="true">
            {toggle.expanded ? '▾' : '▸'}
          </span>
          {row.name}
        </button>
      )}
      {row.moreFields === undefined ? null : <span className={styles['muted']}> {row.moreFields}</span>}
    </td>
  );
}

function Row({ row, props }: { readonly row: SchemaRow; readonly props: TableProps }) {
  return (
    <tr>
      <FieldCell row={row} onExpand={props.onExpand} />
      <td className={styles['present']} title={row.present.hint}>
        <span className={styles['present-bar']} aria-hidden="true">
          <span className={styles['present-fill']} style={{ width: `${String(row.present.part * 100)}%` }} />
        </span>
        <span>{row.present.share}</span>
      </td>
      <td>
        <TypesView cell={row.types} onFilter={props.onFilter} />
      </td>
      <td>
        <ValuesView values={row.values} onFilter={props.onFilter} />
      </td>
    </tr>
  );
}

/** The table, dimmed while a newer sample is read. */
export function SchemaTable(props: TableProps): React.JSX.Element {
  const { shown } = props;
  return (
    <table className={styles['table']} aria-label={text.section} data-dimmed={shown.dimmed ? 'true' : undefined}>
      <thead>
        <tr>
          {shown.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.rows.map((row) => (
          <Row key={row.label} row={row} props={props} />
        ))}
      </tbody>
    </table>
  );
}
