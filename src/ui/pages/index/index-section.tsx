/**
 * The Indexes section of a collection tab (`index.show`): the toolbar with **Create index…**, **Refresh** and the
 * summary; the table of indexes; then **Search indexes** with its own toolbar and table, or the explanation of a server
 * without search. A row is selected by a click or the arrows and shown in the inspector island (`index.inspect`);
 * `Enter` edits it, `Delete` drops it, and its menu has the actions its View gives.
 */
import { useMemo, useState } from 'react';
import { view, type IndexSectionView } from '../../../features/index/show';
import { text } from '../../../features/index/text';
import { savedConnection } from '../../../shared/state/connections';
import { useAppState } from '../../state/store';
import { refresh, type IndexPlace } from './index-actions';
import { IndexMenu, type OpenRowMenu } from './index-menu';
import { useIndexMemory, type IndexMemory } from './index-store';
import { IndexTable } from './index-table';
import { createIndex, createSearchIndex } from './row-actions';
import { SearchTable } from './search-table';
import { useIndexReads } from './use-index-reads';
import styles from './index.module.css';

/** What a part of the section is drawn with. */
export interface PartProps {
  readonly place: IndexPlace;
  readonly memory: IndexMemory;
  readonly shown: IndexSectionView;
  readonly openMenu: (menu: OpenRowMenu) => void;
}

/** The view of the section of a place, as it is now. */
export function sectionView(memory: IndexMemory, collection: string, readOnly: boolean): IndexSectionView {
  return view({
    collection,
    readOnly,
    now: Date.now(),
    shown: true,
    ...(memory.indexes === undefined ? {} : { indexes: memory.indexes }),
    ...(memory.searchIndexes === undefined ? {} : { searchIndexes: memory.searchIndexes }),
    loading: memory.loading,
    changing: memory.changing > 0,
    ...(memory.searchChangedAt === undefined ? {} : { searchChangedAt: memory.searchChangedAt }),
    ...(memory.sort === undefined ? {} : { sort: memory.sort }),
    ...(memory.selected === undefined ? {} : { selected: memory.selected }),
  });
}

function Toolbar({ place, shown }: Pick<PartProps, 'place' | 'shown'>): React.JSX.Element {
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.section}>
      {shown.create === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={shown.create.element}
          onClick={() => {
            createIndex(place, 'toolbar');
          }}
        >
          {shown.create.label}
        </button>
      )}
      <button
        type="button"
        className={styles['button']}
        title={shown.refresh.tooltip}
        onClick={() => {
          refresh(place, 'indexes');
        }}
      >
        {shown.refresh.label}
      </button>
      <span className={styles['summary']}>{shown.summary}</span>
    </div>
  );
}

function SearchToolbar({ place, shown }: Pick<PartProps, 'place' | 'shown'>): React.JSX.Element {
  const search = shown.search;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={search.heading}>
      <h2 className={styles['heading']}>{search.heading}</h2>
      {search.create === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={search.create.element}
          disabled={!search.create.enabled}
          title={search.create.tooltip}
          onClick={() => {
            createSearchIndex(place, 'toolbar');
          }}
        >
          {search.create.label}
        </button>
      )}
      <button
        type="button"
        className={styles['button']}
        title={search.refresh.tooltip}
        onClick={() => {
          refresh(place, 'search');
        }}
      >
        {search.refresh.label}
      </button>
      <span className={styles['summary']}>{search.summary}</span>
    </div>
  );
}

function SearchPart(props: PartProps): React.JSX.Element {
  const search = props.shown.search;
  return (
    <section className={styles['part']} aria-label={search.heading}>
      <SearchToolbar place={props.place} shown={props.shown} />
      {search.explanation === undefined ? null : (
        <div className={styles['explanation']}>
          <p>{search.explanation.text}</p>
          <p className={styles['muted']}>{search.explanation.message}</p>
        </div>
      )}
      {search.error === undefined ? null : <p className={styles['problem']}>{search.error}</p>}
      {search.rows.length === 0 ? null : <SearchTable {...props} />}
    </section>
  );
}

/** The Indexes section of the collection of `place`. */
export function IndexSection({ place }: { readonly place: IndexPlace }): React.JSX.Element {
  const state = useAppState();
  const memory = useIndexMemory(place.tab);
  const readOnly = savedConnection(state.connections, place.connection)?.readOnly ?? false;
  const shown = useMemo(() => sectionView(memory, place.collection, readOnly), [memory, place.collection, readOnly]);
  const [menu, setMenu] = useState<OpenRowMenu | undefined>(undefined);
  useIndexReads(place, shown.polling);
  const props: PartProps = { place, memory, shown, openMenu: setMenu };
  return (
    <div className={styles['section']} data-loading={shown.loading}>
      <Toolbar place={place} shown={shown} />
      <div className={styles['body']}>
        {shown.error === undefined ? <IndexTable {...props} /> : <p className={styles['problem']}>{shown.error}</p>}
        <SearchPart {...props} />
      </div>
      <IndexMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}
