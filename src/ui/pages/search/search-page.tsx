/**
 * `search.show`: the Search documents page of a MongoDB connection, drawn from its View: the search row, the scope row
 * and the options row (`@toolbar`), the error line, and the documents found, grouped by collection (`@list`). The
 * search runs in the main process; the page shows it as the app's state holds it. `Esc` stops a search that runs.
 */
import { useEffect } from 'react';
import { keptInput, runOfTab } from '../../../features/search/model/page';
import { searchPage, view, type SearchPageView } from '../../../features/search/show';
import { text } from '../../../features/search/text';
import type { ReadLimit, SearchMode } from '../../../features/search/types';
import type { AppState } from '../../../shared/state';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { refreshTree } from '../../tree/tree-reads';
import { useTree } from '../../tree/tree-store';
import { changeInput, followAsk, holdInput, keepHeldInput, startSearch, stopSearch } from './search-changes';
import { SearchResults } from './search-results';
import { forgetClosedSearchTabs, keepSearchTab, searchTabOf, useSearchTab, type SearchTab } from './search-store';
import styles from './search-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** Keeps the tab's state, made from the input kept with the tab, and follows what the main process asks. */
function useTabState(tabId: string, shows: PageShows, app: AppState): void {
  const kept = app.tabs.tabs.find((each) => each.id === tabId)?.memory?.choices;
  const ask = app.search.tabs[tabId]?.ask;
  useEffect(() => {
    if (searchTabOf(tabId) === undefined) {
      keepSearchTab(tabId, { connection: shows.connection, input: keptInput(kept), folded: [], askFollowed: 0 });
    }
    keepHeldInput(tabId);
    return () => {
      holdInput(tabId);
    };
    // The input kept with the tab is read once, when its state is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection]);
  useEffect(() => {
    followAsk(tabId, ask);
  }, [tabId, ask]);
}

/** The names of the lists of **In** and **Collections**, as the tree island last read them. */
function useNames(app: AppState, tab: SearchTab | undefined) {
  const tree = useTree(tab?.connection).island.mongodb;
  const database = tab?.input.database;
  const contents = database === undefined ? undefined : tree.contents[database];
  useEffect(() => {
    if (tab !== undefined && database !== undefined && (contents === undefined || contents.kind === 'idle')) {
      void refreshTree(app, tab.connection, { kind: 'database', database }, 'read-even-collapsed');
    }
    // The collections of a database are read once, when it is chosen and the tree has not read them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.connection, database, contents?.kind]);
  const databases = tree.databases.kind === 'loaded' ? tree.databases.value.map((each) => each.name) : [];
  const entries = contents?.kind === 'loaded' ? contents.value.entries : [];
  return {
    databases: database === undefined || databases.includes(database) ? databases : [...databases, database],
    collections: entries.map((entry) => ({ name: entry.name, view: entry.kind === 'view' })),
  };
}

function SearchRow(props: { readonly tabId: string; readonly row: SearchPageView['searchRow'] }) {
  const { tabId, row } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.searchRow}>
      <input
        type="search"
        className={styles['text']}
        aria-label={text.window.text}
        placeholder={row.text.placeholder}
        value={row.text.value}
        autoFocus={row.text.focused}
        onChange={(event) => {
          const typed = event.target.value;
          changeInput(tabId, (input) => ({ ...input, text: typed }));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            startSearch(tabId);
          }
        }}
      />
      <select
        className={styles['input']}
        aria-label={text.mode.label}
        title={row.mode.tooltip}
        value={row.mode.value}
        onChange={(event) => {
          const mode = event.target.value as SearchMode;
          changeInput(tabId, (input) => ({ ...input, mode }));
        }}
      >
        {row.mode.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          if (row.button.stops) {
            stopSearch(tabId);
          } else {
            startSearch(tabId);
          }
        }}
      >
        {row.button.label}
      </button>
    </div>
  );
}

function ScopeRow(props: { readonly tabId: string; readonly row: SearchPageView['scopeRow'] }) {
  const { tabId, row } = props;
  const collections = row.collections;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.scopeRow}>
      <label className={styles['field']}>
        <span>{row.in.label}</span>
        <select
          className={styles['input']}
          value={row.in.value}
          onChange={(event) => {
            const database = event.target.value;
            changeInput(tabId, ({ database: _database, ...input }) =>
              database === '' ? { ...input, collections: [] } : { ...input, database, collections: [] },
            );
          }}
        >
          {row.in.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      {collections === undefined ? null : (
        <fieldset className={styles['ticks']}>
          <legend>{collections.label}</legend>
          {collections.choices.map((choice) => (
            <label key={choice.value === '' ? '\u0000all' : choice.value} className={styles['tick']}>
              <input
                type="checkbox"
                checked={choice.ticked}
                onChange={() => {
                  changeInput(tabId, (input) => ({
                    ...input,
                    collections:
                      choice.value === ''
                        ? []
                        : input.collections.includes(choice.value)
                          ? input.collections.filter((name) => name !== choice.value)
                          : [...input.collections, choice.value],
                  }));
                }}
              />
              <span>{choice.label}</span>
              {choice.view ? <span className={styles['badge']}>{text.scope.view}</span> : null}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function Check(props: {
  readonly label: string;
  readonly tooltip?: string;
  readonly checked: boolean;
  readonly enabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles['field']} title={props.tooltip}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.enabled === false}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
      />
      <span>{props.label}</span>
    </label>
  );
}

function OptionsRow(props: { readonly tabId: string; readonly row: SearchPageView['optionsRow'] }) {
  const { tabId, row } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.optionsRow}>
      <Check
        label={row.matchCase.label}
        checked={row.matchCase.checked}
        onChange={(matchCase) => {
          changeInput(tabId, (input) => ({ ...input, matchCase }));
        }}
      />
      <Check
        label={row.fieldNames.label}
        tooltip={row.fieldNames.tooltip}
        checked={row.fieldNames.checked}
        onChange={(fieldNames) => {
          changeInput(tabId, (input) => ({ ...input, fieldNames }));
        }}
      />
      <Check
        label={row.views.label}
        tooltip={row.views.tooltip}
        checked={row.views.checked}
        enabled={row.views.enabled}
        onChange={(views) => {
          changeInput(tabId, (input) => ({ ...input, views }));
        }}
      />
      <label className={styles['field']}>
        <span>{row.read.label}</span>
        <select
          className={styles['input']}
          value={String(row.read.value)}
          onChange={(event) => {
            const read = Number(event.target.value) as ReadLimit;
            changeInput(tabId, (input) => ({ ...input, read }));
          }}
        >
          {row.read.choices.map((choice) => (
            <option key={choice.value} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </select>
        <span>{row.read.after}</span>
      </label>
      {row.summary === undefined ? null : (
        <span className={styles['summary']} role="status">
          {row.summary}
        </span>
      )}
    </div>
  );
}

function SearchTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useTabState(tabId, shows, app);
  const tab = useSearchTab(tabId);
  const names = useNames(app, tab);
  if (tab === undefined) {
    return null;
  }
  const run = runOfTab(app.search.tabs[tabId]);
  const readOnly = app.connections.saved.find((each) => each.id === tab.connection)?.readOnly ?? false;
  const shown = view({
    connection: tab.connection,
    input: tab.input,
    ...names,
    readOnly,
    ...(run === undefined ? {} : { run }),
    ...(tab.error === undefined ? {} : { error: tab.error }),
    folded: tab.folded,
    ...(tab.selected === undefined ? {} : { selected: { key: tab.selected.key, idText: tab.selected.idText } }),
  });
  return (
    <div
      className={styles['page']}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && shown.searchRow.button.stops) {
          event.preventDefault();
          stopSearch(tabId);
        }
      }}
    >
      <SearchRow tabId={tabId} row={shown.searchRow} />
      <ScopeRow tabId={tabId} row={shown.scopeRow} />
      <OptionsRow tabId={tabId} row={shown.optionsRow} />
      {shown.error === undefined ? null : (
        <p className={styles['error']} role="alert">
          {shown.error}
        </p>
      )}
      {shown.empty === undefined ? null : <p className={styles['empty']}>{shown.empty}</p>}
      <SearchResults tabId={tabId} groups={shown.groups} />
    </div>
  );
}

/** The page of the active Search documents tab. */
export function SearchPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosedSearchTabs(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== searchPage) {
    return null;
  }
  return <SearchTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
