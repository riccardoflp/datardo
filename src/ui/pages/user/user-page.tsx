/**
 * `user.show`: the page of a Users and roles tab, drawn from its View: the section bar (**Users**, **Roles**), the
 * toolbar (**Database**, the filter, **Refresh**), who the connection is signed in as, and the section shown. The page
 * is read when it opens, when **Database** or **Built-in roles** changes, on **Refresh**, after every change made and,
 * for who signs in, when the connection is edited. **Database** asks `user.show` for the database, which keeps it with
 * the tab as its section; the page follows the section of its tab.
 */
import { useEffect, useId } from 'react';
import { databaseOfSection, usersPage, view, type UsersPageView } from '../../../features/user/show';
import { text } from '../../../features/user/text';
import { featureId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { connectionState, savedConnection } from '../../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { readPage } from './user-reads';
import { RolesSection, UsersSection } from './user-sections';
import { pageStateOf } from './user-state';
import {
  changeUsersTab,
  forgetClosedUsersTabs,
  freshUsersTab,
  keepUsersTab,
  usersTabOf,
  useUsersTab,
} from './user-store';
import styles from '../server/server-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** What the connection is now, as far as who signs in goes: when it changes, who signs in is read again. */
function connectionSignature(app: AppState, shows: PageShows): string {
  return JSON.stringify(savedConnection(app.connections, shows.connection) ?? null);
}

/** Keeps the tab's state, and reads the page when it opens, when its section changes, after a change and an edit. */
function useReads(tabId: string, shows: PageShows, app: AppState): void {
  const connected = connectionState(app.connections, shows.connection) === 'connected';
  const section = app.tabs.tabs.find((each) => each.id === tabId)?.section ?? '';
  const refreshed = app.runner.refreshed;
  const signature = connectionSignature(app, shows);
  useEffect(() => {
    if (usersTabOf(tabId) === undefined) {
      keepUsersTab(tabId, freshUsersTab(shows.connection, refreshed.times));
    }
    // The count of the changes is the one when the tab's state is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection]);
  useEffect(() => {
    const tab = usersTabOf(tabId);
    if (!connected || tab === undefined || tab.followed === section) {
      return;
    }
    const opened = tab.followed === undefined;
    const database = databaseOfSection(section);
    changeUsersTab(tabId, ({ database: _was, selected: _selected, ...rest }) => ({
      ...rest,
      ...(database === undefined ? {} : { database }),
      followed: section,
      ...(opened ? { connectionSeen: signature } : {}),
    }));
    void readPage(tabId, opened ? 'opened' : 'database');
    // The signature is taken as the page opens; its changes are followed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, section, connected]);
  useEffect(() => {
    const tab = usersTabOf(tabId);
    if (tab === undefined || tab.refreshes === refreshed.times) {
      return;
    }
    changeUsersTab(tabId, (state) => ({ ...state, refreshes: refreshed.times }));
    const ours = refreshed.connection === undefined || refreshed.connection === shows.connection;
    if (connected && ours && tab.followed !== undefined) {
      void readPage(tabId, 'changed');
    }
  }, [tabId, refreshed.times, refreshed.connection, shows.connection, connected]);
  useEffect(() => {
    const tab = usersTabOf(tabId);
    if (tab?.connectionSeen === undefined || tab.connectionSeen === signature) {
      return;
    }
    changeUsersTab(tabId, (state) => ({ ...state, connectionSeen: signature }));
    if (connected) {
      void readPage(tabId, 'connection-edited');
    }
  }, [tabId, signature, connected]);
}

function SectionBar(props: { readonly tabId: string; readonly bar: UsersPageView['sectionBar'] }) {
  const { tabId, bar } = props;
  const choose = (section: (typeof bar)[number]['section']): void => {
    changeUsersTab(tabId, (state) => ({ ...state, section }));
  };
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = bar[(index + step + bar.length) % bar.length];
    if (step !== 0 && next !== undefined) {
      event.preventDefault();
      choose(next.section);
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
          onClick={() => {
            choose(entry.section);
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

function PageToolbar(props: { readonly tabId: string; readonly shows: PageShows; readonly shown: UsersPageView }) {
  const { tabId, shows } = props;
  const toolbar = props.shown.toolbar;
  const databaseId = useId();
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.toolbar}>
      <span className={styles['field']}>
        <label htmlFor={databaseId}>{toolbar.database.label}</label>
        <select
          id={databaseId}
          className={styles['input']}
          value={toolbar.database.value}
          onChange={(event) => {
            void window.datardo.start({
              feature: featureId('user.show'),
              target: { kind: 'connection', connection: shows.connection },
              place: 'toolbar',
              args: { connection: shows.connection, database: event.target.value },
            });
          }}
        >
          {toolbar.database.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </span>
      <input
        type="search"
        className={styles['input']}
        aria-label={toolbar.filter.placeholder}
        placeholder={toolbar.filter.placeholder}
        value={toolbar.filter.value}
        onChange={(event) => {
          const filter = event.target.value;
          changeUsersTab(tabId, (state) => ({ ...state, filter }));
        }}
      />
      <button
        type="button"
        className={styles['button']}
        title={toolbar.refresh.tooltip}
        onClick={() => {
          void readPage(tabId, 'refresh');
        }}
      >
        {toolbar.refresh.label}
      </button>
    </div>
  );
}

function UsersTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useReads(tabId, shows, app);
  const tab = useUsersTab(tabId);
  if (tab === undefined) {
    return null;
  }
  const shown = view(pageStateOf(app, tab));
  return (
    <div
      className={styles['page']}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          changeUsersTab(tabId, ({ selected: _was, ...rest }) => rest);
        }
      }}
    >
      <SectionBar tabId={tabId} bar={shown.sectionBar} />
      <PageToolbar tabId={tabId} shows={shows} shown={shown} />
      {shown.signedIn === undefined ? null : (
        <p className={`${styles['notice']} ${styles['section']}`} role="status">
          {shown.signedIn}
        </p>
      )}
      <div role="tabpanel" aria-label={text.sections[tab.section]} className={styles['panel']}>
        {tab.section === 'users' ? (
          <UsersSection tabId={tabId} tab={tab} section={shown.users} />
        ) : (
          <RolesSection
            tabId={tabId}
            tab={tab}
            section={shown.roles}
            onBuiltIn={(builtIn) => {
              changeUsersTab(tabId, (state) => ({ ...state, builtIn }));
              void readPage(tabId, 'built-in');
            }}
          />
        )}
      </div>
    </div>
  );
}

/** The page of the active Users and roles tab. */
export function UsersPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosedUsersTabs(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== usersPage) {
    return null;
  }
  return <UsersTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
