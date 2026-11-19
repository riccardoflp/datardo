/**
 * The Documents section of a collection tab (`table.show`): the message of its state (loading, empty, no match, failed
 * with **Run again** and **Reconnect**), or the documents of the page.
 */
import { formattedValue } from '../../../features/query/format';
import { resetQuery } from '../../../features/query/reset';
import { view as showView, type ShowView, type ToolbarButton } from '../../../features/table/show';
import { text as tableText } from '../../../features/table/text';
import { isBuilt } from '../../query/built';
import { runQuery, type CollectionRef } from '../../query/collection-reads';
import { changeQuery, type CollectionTab } from '../../query/collection-store';
import { showStateOf } from '../../query/collection-view';
import { startFeature } from '../../shell/intent';
import { PagingRow } from '../../table/paging-row';
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
  const shown = showView(showStateOf(collection, { view: page.view, readOnly: page.readOnly }));
  return (
    <section className={styles['section']} aria-label={tableText.commands.show}>
      {shown.body.kind === 'message' ? (
        <Message body={shown.body} collectionRef={collectionRef} />
      ) : (
        <ol
          className={styles['documents']}
          data-dimmed={shown.body.dimmed ? 'true' : undefined}
          aria-busy={shown.body.dimmed}
        >
          {collection.documents.map((document, index) => (
            <li key={String(index)} className={styles['document']}>
              {formattedValue(document, 'indented')}
            </li>
          ))}
        </ol>
      )}
      {shown.paging ? <PagingRow collectionRef={collectionRef} collection={collection} /> : null}
    </section>
  );
}
