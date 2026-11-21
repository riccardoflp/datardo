/**
 * The Documents section of a collection tab (`table.show`), from the top: the toolbar, the query bar, the selection
 * bar, then the grid of the documents (`table.rows`) or the message of its state (loading, empty, no match, failed with
 * **Run again** and **Reconnect**), and the paging row. `F5` in the section reads the page again (`table.refresh`).
 */
import { resetQuery } from '../../../features/query/reset';
import { view as showView, type ShowView, type ToolbarButton } from '../../../features/table/show';
import { text as tableText } from '../../../features/table/text';
import { isBuilt } from '../../query/built';
import { runQuery, type CollectionRef } from '../../query/collection-reads';
import { changeQuery, type CollectionTab } from '../../query/collection-store';
import { showStateOf } from '../../query/collection-view';
import { QueryBar } from '../../query/query-bar';
import { startFeature } from '../../shell/intent';
import { startOnDocuments } from '../document/document-actions';
import { DocumentTable } from '../../table/document-table';
import { PagingRow } from '../../table/paging-row';
import { SelectionBar } from '../../table/selection-bar';
import { refreshTable } from '../../table/table-actions';
import { tableTargetOf, useTableColumns } from '../../table/table-columns';
import { TableMenus } from '../../table/table-menus';
import type { TablePartProps } from '../../table/table-parts';
import { TableToolbar } from '../../table/table-toolbar';
import type { CollectionPageState } from './use-collection';
import styles from './collection-page.module.css';

/** What a button of the section's message does. */
function pressed(ref: CollectionRef, button: ToolbarButton): void {
  switch (button.element) {
    case 'query.run@query-bar':
      void runQuery(ref, { texts: 'bar', count: true });
      return;
    case 'query.reset@empty-state':
      changeQuery(ref.tab, resetQuery);
      void runQuery(ref, { texts: 'bar', count: true });
      return;
    case 'document.insert@empty-state':
      void startOnDocuments(ref, button.element);
      return;
    case 'connection.connect@toolbar':
      startFeature('connection.connect', {
        place: 'toolbar',
        target: { kind: 'connection', connection: ref.connection },
      });
      return;
    default:
      return;
  }
}

function Message({
  body,
  collectionRef,
}: {
  readonly body: Extract<ShowView['body'], { readonly kind: 'message' }>;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  const buttons = body.buttons.filter((button) => isBuilt(button.element));
  return (
    <div className={styles['message']} role="status">
      <p>{body.text}</p>
      {buttons.length === 0 ? null : (
        <div className={styles['message-buttons']}>
          {buttons.map((button) => (
            <button
              key={button.element}
              type="button"
              className={styles['button']}
              data-feature={button.element}
              title={button.tip}
              onClick={() => {
                pressed(collectionRef, button);
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Documents section. */
export function DocumentsSection({
  collectionRef,
  collection,
  page,
}: {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly page: CollectionPageState;
}): React.JSX.Element {
  const columns = useTableColumns(collectionRef, collection);
  const target = tableTargetOf(collection, page);
  const parts: TablePartProps = { collectionRef, collection, columns, target };
  const shown = showView(
    showStateOf(collection, {
      view: page.view,
      readOnly: page.readOnly,
      columns: columns.columns,
      layout: columns.layout,
    }),
  );
  return (
    <section
      className={styles['section']}
      aria-label={tableText.commands.show}
      onKeyDown={(event) => {
        if (event.key === 'F5' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          refreshTable(collectionRef);
        }
      }}
    >
      <TableToolbar {...parts} />
      <QueryBar collectionRef={collectionRef} collection={collection} />
      <SelectionBar {...parts} />
      {shown.body.kind === 'message' ? (
        <Message body={shown.body} collectionRef={collectionRef} />
      ) : (
        <DocumentTable {...parts} dimmed={shown.body.dimmed} />
      )}
      {shown.paging ? <PagingRow collectionRef={collectionRef} collection={collection} /> : null}
      <TableMenus {...parts} />
    </section>
  );
}
