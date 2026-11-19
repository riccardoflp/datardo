/**
 * One operation of the **Undo history** page (`undo.show`): its cells, **Undo** (`undo.revert@table`) and **✕**
 * (`undo.remove@table`); a click on a row that isn't undone, or `Enter` on its operation, expands it with what
 * undoing does (`undo.details@table`), drawn below it.
 */
import type { DetailItem, DetailsBox } from '../../../features/undo/details';
import type { RowView } from '../../../features/undo/show';
import { detailsText } from '../../../features/undo/text';
import { entryTarget } from '../../../features/undo/types';
import type { UndoEntry } from '../../../shared/state/undo';
import { startFeature } from '../../shell/intent';
import { toggleRow } from './undo-page-store';
import styles from './undo-page.module.css';

/** How many cells a row has: the five columns and the buttons. */
const cellCount = 6;

function Item({ item }: { readonly item: DetailItem }): React.JSX.Element {
  return (
    <li className={styles['item']}>
      <div className={styles['itemHead']}>
        <code>{item.name}</code> <span>{item.what}</span>
        {item.changedSince ? <span className={styles['changed']}>{detailsText.changedSince}</span> : null}
      </div>
      {item.note === undefined ? null : <p className={styles['note']}>{item.note}</p>}
      {item.fields === undefined || item.fields.length === 0 ? null : (
        <table className={styles['fields']}>
          <thead>
            <tr>
              <th scope="col">{detailsText.field}</th>
              <th scope="col">{detailsText.now}</th>
              <th scope="col">{detailsText.afterUndo}</th>
            </tr>
          </thead>
          <tbody>
            {item.fields.map((field) => (
              <tr key={field.field}>
                <td>{field.field}</td>
                <td title={field.nowTooltip}>{field.now}</td>
                <td title={field.afterTooltip}>{field.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {item.key === undefined ? null : (
        <dl className={styles['key']}>
          <dt>{detailsText.now}</dt>
          <dd title={item.key.now.tooltip}>{item.key.now.text}</dd>
          <dt>{detailsText.afterUndo}</dt>
          <dd title={item.key.after.tooltip}>{item.key.after.text}</dd>
        </dl>
      )}
    </li>
  );
}

function Details({ box }: { readonly box: DetailsBox }): React.JSX.Element {
  if (box.kind !== 'shown') {
    return <p className={box.kind === 'refused' ? styles['refused'] : styles['note']}>{box.text}</p>;
  }
  return (
    <>
      {box.first === undefined ? null : <p className={styles['note']}>{box.first}</p>}
      {box.changed === undefined ? null : <p className={styles['note']}>{box.changed}</p>}
      <ul className={styles['items']}>
        {box.items.map((item, index) => (
          <Item key={`${String(index)} ${item.name}`} item={item} />
        ))}
      </ul>
    </>
  );
}

/** A row of the table, and its details when it is expanded. */
export function UndoRow({ row, entry }: { readonly row: RowView; readonly entry: UndoEntry }): React.JSX.Element {
  const expand = (): void => {
    if (row.expand !== undefined) {
      void toggleRow(entry);
    }
  };
  return (
    <>
      <tr className={styles['row']} onClick={expand}>
        <td title={row.when.tooltip}>{row.when.text}</td>
        <td>{row.target}</td>
        <td className={styles['title']}>
          {row.expand === undefined ? (
            row.operation
          ) : (
            <button
              type="button"
              className={styles['disclosure']}
              data-feature={row.expand}
              aria-expanded={row.expanded}
              onClick={(event) => {
                event.stopPropagation();
                expand();
              }}
            >
              <span className={`codicon codicon-chevron-${row.expanded ? 'down' : 'right'}`} aria-hidden="true" />{' '}
              {row.operation}
            </button>
          )}
        </td>
        <td title={row.changesTooltip}>{row.changes}</td>
        <td>{row.size ?? ''}</td>
        <td className={styles['actions']}>
          <button
            type="button"
            className={styles['button']}
            data-feature={row.undo.element}
            disabled={!row.undo.enabled}
            title={row.undo.tooltip}
            onClick={(event) => {
              event.stopPropagation();
              startFeature('undo.revert', { place: 'table', target: entryTarget(entry), args: { operation: row.id } });
            }}
          >
            {row.undo.label}
          </button>
          <button
            type="button"
            className={styles['button']}
            data-feature={row.remove.element}
            title={row.remove.tooltip}
            aria-label={row.remove.tooltip}
            onClick={(event) => {
              event.stopPropagation();
              startFeature('undo.remove', { place: 'table', args: { operation: row.id } });
            }}
          >
            {row.remove.label}
          </button>
        </td>
      </tr>
      {row.expanded && row.details !== undefined ? (
        <tr className={styles['detailsRow']}>
          <td colSpan={cellCount} aria-live="polite">
            <Details box={row.details} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
