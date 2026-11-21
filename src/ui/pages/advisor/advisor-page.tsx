/**
 * `advisor.show`: the page of an Index advisor tab, drawn from its View: the toolbar with the scope, the time of the
 * last analysis and **Refresh**, the summary, where the slow operations come from, and the three lists of advices.
 * The page analyzes when it opens, on **Refresh** and after an action of the page that ran; nothing on a timer.
 */
import { useEffect } from 'react';
import { advisorPage, view } from '../../../features/advisor/show';
import type { Scope } from '../../../features/advisor/types';
import type { AppState } from '../../../shared/state';
import { connectionState, savedConnection } from '../../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { useClock } from '../keys/key-inspector';
import { AdviceSection, Sources } from './advisor-parts';
import { analyze } from './advisor-reads';
import {
  advisorTabOf,
  forgetClosedAdvisorTabs,
  freshAdvisorTab,
  keepAdvisorTab,
  useAdvisorTab,
  type AdvisorTab,
} from './advisor-store';
import styles from './advisor-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** The scope a tab shows: its database and collection, else the whole connection. */
export function scopeOfShows(shows: PageShows): Scope {
  const database = shows.database;
  const collection = shows.of?.[0];
  if (database === undefined) {
    return { kind: 'connection' };
  }
  return collection === undefined ? { kind: 'database', database } : { kind: 'collection', database, collection };
}

/** Keeps the tab's state and analyzes once its connection is connected. */
function useAnalysis(tabId: string, shows: PageShows, app: AppState): void {
  const connected = connectionState(app.connections, shows.connection) === 'connected';
  useEffect(() => {
    if (advisorTabOf(tabId) === undefined) {
      keepAdvisorTab(tabId, freshAdvisorTab(shows.connection, scopeOfShows(shows)));
    }
    // The scope of a tab never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection]);
  useEffect(() => {
    const state = advisorTabOf(tabId);
    if (connected && state !== undefined && state.run === 0) {
      void analyze(tabId);
    }
  }, [tabId, connected]);
}

function Toolbar(props: { readonly tabId: string; readonly shown: ReturnType<typeof view> }) {
  const { toolbar } = props.shown;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={props.shown.title}>
      <span className={styles['scope']}>{toolbar.scope}</span>
      {toolbar.analyzedAt === undefined ? null : <span className={styles['count']}>{toolbar.analyzedAt}</span>}
      <button
        type="button"
        className={styles['button']}
        title={toolbar.refresh.tooltip}
        aria-disabled={toolbar.refresh.enabled ? undefined : true}
        onClick={() => {
          if (toolbar.refresh.enabled) {
            void analyze(props.tabId);
          }
        }}
      >
        {toolbar.refresh.label}
      </button>
    </div>
  );
}

function Analysis(props: { readonly tabId: string; readonly tab: AdvisorTab; readonly app: AppState }) {
  const { tabId, tab, app } = props;
  const now = useClock();
  const saved = savedConnection(app.connections, tab.connection);
  if (saved === undefined) {
    return null;
  }
  const shown = view({
    connection: { id: tab.connection, name: saved.name, readOnly: saved.readOnly },
    scope: tab.scope,
    now,
    analyzing: tab.analyzing,
    ...(tab.analyzedAt === undefined ? {} : { analyzedAt: tab.analyzedAt }),
    ...(tab.read === undefined ? {} : { read: tab.read }),
    expanded: tab.expanded,
  });
  const lists = shown.lists;
  return (
    <div className={styles['page']}>
      <Toolbar tabId={tabId} shown={shown} />
      <div className={styles['body']}>
        <p role="status">{shown.summary}</p>
        {shown.sources === undefined ? null : <Sources tab={tabId} sources={shown.sources} />}
        {shown.error === undefined ? null : (
          <p className={styles['error']} role="alert">
            {shown.error}
          </p>
        )}
        {lists === undefined ? null : (
          <>
            <AdviceSection tab={tabId} list={lists.create} />
            <AdviceSection tab={tabId} list={lists.redundant} />
            <AdviceSection tab={tabId} list={lists.unused} note={lists.unused.note} />
          </>
        )}
      </div>
    </div>
  );
}

/** The page of the active Index advisor tab. */
export function AdvisorPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosedAdvisorTabs(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== advisorPage) {
    return null;
  }
  return <AdvisorTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}

function AdvisorTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useAnalysis(tabId, shows, app);
  const tab = useAdvisorTab(tabId);
  return tab === undefined ? null : <Analysis tabId={tabId} tab={tab} app={app} />;
}
