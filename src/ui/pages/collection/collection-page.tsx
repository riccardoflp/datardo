/**
 * The page of a collection tab: its query bar (`query.bar`) above the documents of the query (`table.show`). The
 * window keeps what each tab read; the page restores the tab's query and runs it once the connection is connected.
 */
import type { TabId } from '../../../shared/ids';
import { QueryBar } from '../../query/query-bar';
import { useCollection } from '../../query/collection-store';
import { useAppState } from '../../state/store';
import { DocumentsSection } from './documents-section';
import { collectionPageState, useCollectionRef, useCollectionStart, type CollectionShows } from './use-collection';
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
  useCollectionStart(ref, page);
  const collection = useCollection(tab);
  return (
    <div className={styles['page']} data-collection={shows.collection}>
      <QueryBar collectionRef={ref} collection={collection} />
      <DocumentsSection collectionRef={ref} collection={collection} page={page} />
    </div>
  );
}
