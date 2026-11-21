/**
 * The page of a collection tab: its Documents section (`table.show`), with the query bar (`query.bar`) above the
 * documents of the query. The window keeps what each tab read; the page restores the tab's query and runs it once the
 * connection is connected.
 */
import type { TabId } from '../../../shared/ids';
import { useCollection } from '../../query/collection-store';
import { useAppState } from '../../state/store';
import { useQueryLoad } from '../saved-query/use-query-load';
import { DocumentsSection } from './documents-section';
import {
  collectionPageState,
  useCollectionRef,
  useCollectionStart,
  useRefreshAfterWrites,
  type CollectionShows,
} from './use-collection';
import { text as tableText } from '../../../features/table/text';
import styles from './collection-page.module.css';

/** The page of a collection tab. */
export function CollectionPage({
  tab,
  shows,
}: {
  readonly tab: TabId;
  readonly shows: CollectionShows;
}): React.JSX.Element {
  const state = useAppState();
  const page = collectionPageState(state, tab, shows);
  const ref = useCollectionRef(page);
  // Before the start: a query loaded by `saved-query.run` is the tab's first query, in place of the one it kept.
  useQueryLoad(ref, page, state.savedQuery.loads[tab]);
  useCollectionStart(ref, page);
  useRefreshAfterWrites(ref, state.runner.refreshed);
  const collection = useCollection(tab);
  return (
    <div className={styles['page']} data-collection={shows.collection}>
      <div className={styles['section-bar']} role="toolbar" aria-label={tableText.names.sections}>
        <button
          type="button"
          className={styles['section-button']}
          data-feature="table.show@section-bar"
          aria-pressed="true"
          onClick={() => {
            document.querySelector<HTMLElement>('[role="grid"]')?.focus();
          }}
        >
          {tableText.commands.show}
        </button>
      </div>
      <DocumentsSection collectionRef={ref} collection={collection} page={page} />
    </div>
  );
}
