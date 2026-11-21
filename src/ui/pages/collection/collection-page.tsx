/**
 * The page of a collection tab: its section bar, then the section shown. **Documents** (`table.show`), with the query
 * bar (`query.bar`) above the documents of the query; **Schema** (`schema.show`); for a collection, **Indexes**
 * (`index.show`); for a view, **Definition** (`manage.definition`); for a collection, **Validation**
 * (`manage.validation`); and under **More**, **Explain** (`explain.show`). The window keeps what each tab read; the page restores the tab's
 * query and runs it once the connection is connected.
 */
import { useEffect, useMemo } from 'react';
import { text as indexText } from '../../../features/index/text';
import { text as manageText } from '../../../features/manage/text';
import { text as tableText } from '../../../features/table/text';
import type { TabId } from '../../../shared/ids';
import { useCollection } from '../../query/collection-store';
import { useAppState } from '../../state/store';
import { useQueryLoad } from '../saved-query/use-query-load';
import { EditorSection } from '../manage/editor-section';
import { showSection, type SectionPlace } from '../manage/section-actions';
import { IndexSection } from '../index/index-section';
import { ExplainSection } from '../explain/explain-section';
import { showSetFilter } from '../schema/schema-actions';
import { SchemaSection } from '../schema/schema-section';
import { MoreMenu, SchemaButton } from './section-more';
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
  const documents = section === 'documents';
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
      <SchemaButton place={place} section={section} />
      {place.view ? null : (
        <button
          type="button"
          className={styles['section-button']}
          data-feature="index.show@section-bar"
          aria-pressed={section === 'indexes'}
          onClick={() => {
            showSection(place, 'indexes', 'section-bar');
          }}
        >
          {indexText.section}
        </button>
      )}
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
      <MoreMenu place={place} section={section} />
    </div>
  );
}

/** The sections of a view and of a collection; any other name shows the documents. */
const viewSections: ReadonlySet<string> = new Set(['definition', 'schema', 'explain']);
const collectionSections: ReadonlySet<string> = new Set(['validation', 'indexes', 'schema', 'explain']);

/** The section a tab shows, from the name it keeps. */
function shownSection(section: string, view: boolean): string {
  return (view ? viewSections : collectionSections).has(section) ? section : 'documents';
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
  // Before the start: a query loaded by `saved-query.run` is the tab's first query, in place of the one it kept.
  useQueryLoad(ref, page, state.savedQuery.loads[tab]);
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
  const shown = shownSection(section, view);
  const filterSet = state.schema.filters[tab]?.number;
  useEffect(() => {
    if (filterSet !== undefined) {
      showSetFilter(ref);
    }
  }, [ref, filterSet]);
  return (
    <div className={styles['page']} data-collection={shows.collection}>
      <SectionBar place={place} section={shown} />
      {shown === 'documents' ? <DocumentsSection collectionRef={ref} collection={collection} page={page} /> : null}
      {shown === 'definition' ? <EditorSection place={place} kind="definition" /> : null}
      {shown === 'validation' ? <EditorSection place={place} kind="validation" /> : null}
      {shown === 'indexes' ? <IndexSection place={place} /> : null}
      {shown === 'schema' ? (
        <SchemaSection place={place} collectionRef={ref} collection={collection} page={page} />
      ) : null}
      {shown === 'explain' ? <ExplainSection collectionRef={ref} collection={collection} page={page} /> : null}
    </div>
  );
}
