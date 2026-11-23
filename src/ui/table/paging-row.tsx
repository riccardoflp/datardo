/**
 * The paging row under the documents (`table.paging`): the range with its total, **Previous page**, **Next page** and
 * **Page size**. A page turn runs the query as it was last run, without counting again; an estimated total, or one
 * that could not be counted, is a button that counts exactly (`query.count`). While the total is counted again, the
 * one counted before stays, dimmed after a moment, so that the row keeps its width.
 */
import { text as queryText } from '../../features/query/text';
import { isPageSize } from '../../features/query/types';
import { view, type PagingButton } from '../../features/table/paging';
import { text as tableText } from '../../features/table/text';
import { countTab, runQuery, type CollectionRef } from '../query/collection-reads';
import type { CollectionTab } from '../query/collection-store';
import { pagingStateOf } from '../query/collection-view';
import styles from './table.module.css';

function PageButton({
  button,
  collectionRef,
}: {
  readonly button: PagingButton;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['paging-button']}
      data-feature={button.element}
      aria-label={button.name}
      title={button.name}
      aria-disabled={button.enabled ? undefined : true}
      onClick={() => {
        if (button.enabled) {
          void runQuery(collectionRef, { texts: 'ran', page: button.page, count: false });
        }
      }}
    >
      {button.label}
    </button>
  );
}

/** The paging row. */
export function PagingRow({
  collectionRef,
  collection,
}: {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
}): React.JSX.Element {
  const paging = view(pagingStateOf(collection));
  const { total } = paging;
  const before = paging.range.slice(0, paging.range.length - total.text.length);
  const clickable = total.estimated || total.text === queryText.count.failed;
  return (
    <div className={styles['paging']} role="group" aria-label={tableText.paging.label}>
      <span className={styles['range']} role="status">
        {before}
        <span className={styles['total-shown']} data-counting={total.counting ? 'true' : undefined}>
          {clickable ? (
            <button
              type="button"
              className={styles['total']}
              data-feature="query.count@paging"
              title={total.tip}
              onClick={() => {
                countTab(collectionRef.tab, 'paging');
              }}
            >
              {total.text}
            </button>
          ) : (
            total.text
          )}
        </span>
      </span>
      <PageButton button={paging.previous} collectionRef={collectionRef} />
      <PageButton button={paging.next} collectionRef={collectionRef} />
      <label className={styles['page-size']}>
        {paging.pageSize.label}
        <select
          data-feature={paging.pageSize.element}
          value={paging.pageSize.value}
          onChange={(event) => {
            const size = Number(event.target.value);
            if (isPageSize(size)) {
              void runQuery(collectionRef, { texts: 'ran', page: 1, pageSize: size, count: false });
            }
          }}
        >
          {paging.pageSize.choices.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
