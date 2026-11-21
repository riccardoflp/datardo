/**
 * The page of a collection tab: its section bar, then the section shown. **Documents** (`table.show`), with the query
 * bar (`query.bar`) above the documents of the query; for a view, **Definition** (`manage.definition`); for a
 * collection, **Validation** (`manage.validation`). The window keeps what each tab read; the page restores the tab's
 * query and runs it once the connection is connected.
 */
import { useMemo } from 'react';
import { text as manageText } from '../../../features/manage/text';
import { text as tableText } from '../../../features/table/text';
import type { TabId } from '../../../shared/ids';
import { useCollection } from '../../query/collection-store';
import { useAppState } from '../../state/store';
import { EditorSection } from '../manage/editor-section';
import { showSection, type SectionPlace } from '../manage/section-actions';
import { DocumentsSection } from './documents-section';
import {
  collectionPageState,
  useCollectionRef,
  useCollectionStart,
  useRefreshAfterWrites,
  type CollectionShows,
} from './use-collection';
import styles from './collection-page.module.css';

/** The sections of a tab: Documents, then Definition for a view or Validation for a collection. */
function SectionBar({ place, section }: { readonly place: SectionPlace; readonly section: string }): React.JSX.Element {
  const documents = section !== 'definition' && section !== 'validation';
  return (
    <div className={styles['section-bar']} role="toolbar" aria-label={tableText.names.sections}>
      <button
        type="button"
        className={styles['section-button']}
        data-feature="table.show@section-bar"
        aria-pressed={documents}
        onClick={() => {
          if (documents) {
            document.querySelector<HTMLElement>('[role="grid"]')?.focus();
          } else {
            showSection(place, 'documents', 'section-bar');
          }
        }}
      >
        {tableText.commands.show}
      </button>
      {place.view ? (
        <button
          type="button"
          className={styles['section-button']}
          data-feature="manage.definition@section-bar"
          aria-pressed={section === 'definition'}
          onClick={() => {
            showSection(place, 'definition', 'section-bar');
          }}
        >
          {manageText.sections.definition}
        </button>
      ) : (
        <button
          type="button"
          className={styles['section-button']}
          data-feature="manage.validation@section-bar"
          aria-pressed={section === 'validation'}
          onClick={() => {
            showSection(place, 'validation', 'section-bar');
          }}
        >
          {manageText.sections.validation}
        </button>
      )}
    </div>
  );
}

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
  useRefreshAfterWrites(ref, state.runner.refreshed);
  const collection = useCollection(tab);
  const view = shows.view === true;
  const place = useMemo(
    (): SectionPlace => ({
      tab,
      connection: shows.connection,
      database: shows.database,
      collection: shows.collection,
      view,
    }),
    [tab, shows.connection, shows.database, shows.collection, view],
  );
  const section = state.tabs.tabs.find((each) => each.id === tab)?.section ?? 'documents';
  const shown = view
    ? section === 'definition'
      ? section
      : 'documents'
    : section === 'validation'
      ? section
      : 'documents';
  return (
    <div className={styles['page']} data-collection={shows.collection}>
      <SectionBar place={place} section={shown} />
      {shown === 'documents' ? <DocumentsSection collectionRef={ref} collection={collection} page={page} /> : null}
      {shown === 'definition' ? <EditorSection place={place} kind="definition" /> : null}
      {shown === 'validation' ? <EditorSection place={place} kind="validation" /> : null}
    </div>
  );
}
