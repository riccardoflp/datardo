/**
 * `server.show`: the page of a Server tab, drawn from its View: the section bar (`@section-bar`), the toolbar with
 * **Auto**, **Refresh** and the time of the last read, and the section shown. The section is read when it is chosen
 * and with **Refresh**, and by itself every few seconds while the tab is the active tab and the window is visible.
 */
import { useEffect } from 'react';
import { choicesOf, isAutoRefreshDue, view, type AutoInterval } from '../../../features/server/show';
import { text } from '../../../features/server/text';
import type { ServerSection } from '../../../features/server/types';
import type { ConnectionView } from '../../../shared/connection';
import type { AppState } from '../../../shared/state';
import { connectionState } from '../../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { useClock } from '../keys/key-inspector';
import { changeChoices, chooseSection, holdChoices, keepHeldChoices, select } from './server-changes';
import { ClientsSection } from './server-clients';
import { ConfigSection } from './server-config';
import { followAsk } from './server-largest';
import { MemorySection } from './server-memory';
import { OverviewSection, ReplicationSection } from './server-overview';
import { forgetOwnAsks, readSection } from './server-reads';
import { SlowLogSection } from './server-slow-log';
import { connectionOf, sectionOf } from './server-state';
import {
  forgetClosedServerTabs,
  freshServerTab,
  keepServerTab,
  serverTabOf,
  useServerTab,
  type ServerTab,
} from './server-store';
import styles from './server-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** Keeps the tab's state, reads its section when it is chosen, and again by itself while **Auto** says so. */
function useReads(tabId: string, shows: PageShows, app: AppState, section: ServerSection): void {
  const connected = connectionState(app.connections, shows.connection) === 'connected';
  const kept = app.tabs.tabs.find((each) => each.id === tabId)?.memory?.choices;
  useEffect(() => {
    if (serverTabOf(tabId) === undefined) {
      keepServerTab(tabId, freshServerTab(shows.connection, choicesOf(kept), Date.now()));
    }
    keepHeldChoices(tabId);
    return () => {
      holdChoices(tabId);
    };
    // The choices kept with the tab are read once, when its state is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection]);
  useEffect(() => {
    if (connected && serverTabOf(tabId)?.shown !== section) {
      void readSection(tabId, section, 'chosen');
    }
  }, [tabId, section, connected]);
  useEffect(() => {
    const timer = setInterval(() => {
      const state = serverTabOf(tabId);
      const clock = {
        auto: state?.choices.auto ?? 0,
        ...(state?.lastReadAt === undefined ? {} : { lastReadAt: state.lastReadAt }),
        tabActive: true,
        windowVisible: document.visibilityState === 'visible',
      };
      if (connected && state?.shown === section && isAutoRefreshDue(clock, Date.now())) {
        void readSection(tabId, section, 'auto');
      }
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [tabId, section, connected]);
  const remembered = app.runner.remembered;
  const keyspace = useServerTab(tabId)?.keyspace;
  useEffect(() => {
    followAsk(tabId, app);
    // The ask is followed when it comes and once the databases are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, remembered, keyspace]);
}

function SectionBar(props: { readonly tabId: string; readonly bar: ReturnType<typeof view>['sectionBar'] }) {
  const { tabId, bar } = props;
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = bar[(index + step + bar.length) % bar.length];
    if (step !== 0 && next !== undefined) {
      event.preventDefault();
      chooseSection(tabId, next.section);
      const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
      buttons?.item((index + step + bar.length) % bar.length).focus();
    }
  };
  return (
    <div className={styles['section-bar']} role="tablist" aria-label={text.window.sectionBar}>
      {bar.map((entry, index) => (
        <button
          key={entry.section}
          type="button"
          role="tab"
          className={styles['section-button']}
          aria-selected={entry.chosen}
          tabIndex={entry.chosen ? 0 : -1}
          data-feature={entry.element}
          onClick={() => {
            chooseSection(tabId, entry.section);
          }}
          onKeyDown={(event) => {
            move(event, index);
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function PageToolbar(props: {
  readonly tabId: string;
  readonly section: ServerSection;
  readonly shown: ReturnType<typeof view>;
}) {
  const { tabId, section } = props;
  const toolbar = props.shown.toolbar;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.toolbar}>
      <label className={styles['field']}>
        <span>{toolbar.auto.label}</span>
        <select
          className={styles['input']}
          value={String(toolbar.auto.value)}
          onChange={(event) => {
            const auto = Number(event.target.value) as AutoInterval;
            changeChoices(tabId, (choices) => ({ ...choices, auto }));
          }}
        >
          {toolbar.auto.choices.map((choice) => (
            <option key={choice.value} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          void readSection(tabId, section, 'refresh');
        }}
      >
        {toolbar.refresh}
      </button>
      {toolbar.lastRead === undefined ? null : (
        <time className={styles['count']} title={text.window.lastRead}>
          {toolbar.lastRead}
        </time>
      )}
    </div>
  );
}

function SectionShown(props: {
  readonly tabId: string;
  readonly tab: ServerTab;
  readonly section: ServerSection;
  readonly connection: ConnectionView;
  readonly now: number;
}): React.JSX.Element {
  const { tabId, tab, connection, now } = props;
  switch (props.section) {
    case 'overview':
      return <OverviewSection tabId={tabId} tab={tab} now={now} />;
    case 'clients':
      return <ClientsSection tabId={tabId} tab={tab} connection={connection} />;
    case 'slow-log':
      return <SlowLogSection tabId={tabId} tab={tab} connection={connection} now={now} />;
    case 'memory':
      return <MemorySection tabId={tabId} tab={tab} connection={connection} />;
    case 'replication':
      return <ReplicationSection tabId={tabId} tab={tab} />;
    case 'configuration':
      return <ConfigSection tabId={tabId} tab={tab} />;
  }
}

function ServerTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  const section = sectionOf(app, tabId);
  useReads(tabId, shows, app, section);
  const now = useClock();
  const tab = useServerTab(tabId);
  const connection = connectionOf(app, shows.connection);
  if (tab === undefined || connection === undefined) {
    return null;
  }
  const shown = view({
    connection,
    section,
    auto: tab.choices.auto,
    ...(tab.lastReadAt === undefined ? {} : { lastReadAt: tab.lastReadAt }),
  });
  return (
    <div
      className={styles['page']}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          select(tabId, () => ({}));
        }
      }}
    >
      <SectionBar tabId={tabId} bar={shown.sectionBar} />
      <PageToolbar tabId={tabId} section={section} shown={shown} />
      <div role="tabpanel" aria-label={text.sections[section]} className={styles['panel']}>
        <SectionShown tabId={tabId} tab={tab} section={section} connection={connection} now={now} />
      </div>
    </div>
  );
}

/** The page of the active Server tab. */
export function ServerPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    const open = new Set(app.tabs.tabs.map((tab) => tab.id));
    forgetClosedServerTabs(open);
    forgetOwnAsks(open);
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== 'server') {
    return null;
  }
  return <ServerTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
