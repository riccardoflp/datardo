/**
 * `monitor.show`: the page of a Monitor tab, drawn from its View: the section bar (`@section-bar`) with the sections
 * that are built, the toolbar with **Auto** and **Refresh**, and the section shown. The section is read when it is
 * chosen and with **Refresh**, and by itself every few seconds while the tab is the active tab and the window is
 * visible.
 */
import { useEffect } from 'react';
import { monitorChoicesOf } from '../../../features/monitor/parts/choices';
import { builtSections, isAutoRefreshDue, monitorPage, view, type AutoInterval } from '../../../features/monitor/show';
import { text } from '../../../features/monitor/text';
import type { MonitorSection } from '../../../features/monitor/types';
import type { AppState } from '../../../shared/state';
import { connectionState } from '../../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { changeChoices, chooseSection, holdChoices, keepHeldChoices, select } from './monitor-changes';
import { OperationsSection } from './monitor-operations';
import { readSection } from './monitor-reads';
import { SlowSection } from './monitor-slow';
import { connectionOf, sectionOf } from './monitor-state';
import { forgetClosedMonitorTabs, freshMonitorTab, keepMonitorTab, monitorTabOf, useMonitorTab } from './monitor-store';
import styles from '../server/server-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** Keeps the tab's state, reads its section when it is chosen, and again by itself while **Auto** says so. */
function useReads(tabId: string, shows: PageShows, app: AppState, section: MonitorSection): void {
  const connected = connectionState(app.connections, shows.connection) === 'connected';
  const kept = app.tabs.tabs.find((each) => each.id === tabId)?.memory?.choices;
  useEffect(() => {
    if (monitorTabOf(tabId) === undefined) {
      keepMonitorTab(tabId, freshMonitorTab(shows.connection, monitorChoicesOf(kept)));
    }
    keepHeldChoices(tabId);
    return () => {
      holdChoices(tabId);
    };
    // The choices kept with the tab are read once, when its state is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection]);
  useEffect(() => {
    if (connected && monitorTabOf(tabId)?.shown !== section) {
      void readSection(tabId, section, 'chosen');
    }
  }, [tabId, section, connected]);
  useEffect(() => {
    const timer = setInterval(() => {
      const state = monitorTabOf(tabId);
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
}

type SectionEntry = ReturnType<typeof view>['sectionBar'][number];

function SectionBar(props: { readonly tabId: string; readonly bar: readonly SectionEntry[] }) {
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
  readonly section: MonitorSection;
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
      {props.shown.loading ? (
        <span className={styles['count']} role="status">
          {text.window.reading}
        </span>
      ) : null}
    </div>
  );
}

function MonitorTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  const section = sectionOf(app, tabId);
  useReads(tabId, shows, app, section);
  const tab = useMonitorTab(tabId);
  const connection = connectionOf(app, shows.connection);
  if (tab === undefined || connection === undefined) {
    return null;
  }
  const shown = view({ connection, section, auto: tab.choices.auto, loading: tab.loading.length > 0 });
  const bar = shown.sectionBar.filter((entry) => builtSections.includes(entry.section));
  return (
    <div
      className={styles['page']}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          select(tabId, () => ({}));
        }
      }}
    >
      <SectionBar tabId={tabId} bar={bar} />
      <PageToolbar tabId={tabId} section={section} shown={shown} />
      <div role="tabpanel" aria-label={text.sections[section]} className={styles['panel']}>
        {section === 'operations' ? (
          <OperationsSection tabId={tabId} tab={tab} connection={connection} />
        ) : (
          <SlowSection tabId={tabId} tab={tab} connection={connection} />
        )}
      </div>
    </div>
  );
}

/** The page of the active Monitor tab. */
export function MonitorPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosedMonitorTabs(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== monitorPage) {
    return null;
  }
  return <MonitorTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
