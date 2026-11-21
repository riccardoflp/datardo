/**
 * `pubsub.show`: the page of a Pub/Sub tab, drawn from its Views: the toolbar, the state on one line, the lists
 * **Subscriptions** and **Active channels** at the left, and the list of messages with the bar of its selection. The
 * active channels are read when the page opens, 300 ms after the last key in their filter, and every 5 seconds while
 * the tab is the active tab and the window is visible (`pubsub.channels`).
 */
import { useEffect, useState } from 'react';
import { filterWaitMs, isReadDue } from '../../../features/pubsub/channels';
import { view as showView } from '../../../features/pubsub/show';
import { text } from '../../../features/pubsub/text';
import { pubsubPageOf, type PubSubPage as PageState } from '../../../features/pubsub/types';
import type { AppState } from '../../../shared/state';
import { connectionState } from '../../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { useClock } from '../keys/key-inspector';
import { holdChoices, keepHeldChoices } from './pubsub-actions';
import { readChannels } from './pubsub-channels';
import { ChannelsList, SubscriptionsList } from './pubsub-lists';
import { PubSubMenu, type OpenMenu } from './pubsub-menu';
import { MessagesTable, SelectionBar } from './pubsub-messages';
import { connectionOf, readOnlyTooltip, shownPage, showInput } from './pubsub-state';
import { forgetClosedPubSubTabs, freshPubSubTab, keepPubSubTab, pubsubTabOf, usePubSubTab } from './pubsub-store';
import { PubSubState, PubSubToolbar } from './pubsub-toolbar';
import styles from './pubsub-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** Keeps the tab's state, and reads the active channels when it opens, as their filter settles and every 5 s. */
function useReads(tabId: string, shows: PageShows, app: AppState): void {
  const page = pubsubPageOf(app, shows.connection);
  const connected = connectionState(app.connections, shows.connection) === 'connected';
  const known = page !== undefined;
  useEffect(() => {
    // The tab's state is made once the main process has the page, with the kind and the filter it restored.
    if (page !== undefined && pubsubTabOf(tabId) === undefined) {
      keepPubSubTab(tabId, freshPubSubTab(shows.connection, page.nameKind, page.filter));
    }
    // The kind and the filter of the page are read once, when the tab's state is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection, known]);
  useEffect(() => {
    keepHeldChoices(tabId);
    return () => {
      holdChoices(tabId);
    };
  }, [tabId]);
  const channelsFilter = usePubSubTab(tabId)?.channelsFilter;
  useEffect(() => {
    if (!connected) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void readChannels(tabId);
    }, filterWaitMs);
    return () => {
      clearTimeout(timer);
    };
  }, [tabId, connected, channelsFilter]);
  useEffect(() => {
    const timer = setInterval(() => {
      const state = pubsubTabOf(tabId);
      const visible = document.visibilityState === 'visible';
      // A list the server refused is read again with **Refresh** or its filter only, not every 5 seconds.
      const refused = state?.channels.refused !== undefined;
      if (connected && state !== undefined && !refused && isReadDue(true, visible, state.channelsReadAt, Date.now())) {
        void readChannels(tabId);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [tabId, connected]);
}

function PubSubTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useReads(tabId, shows, app);
  const now = useClock();
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const tab = usePubSubTab(tabId);
  const kept = pubsubPageOf(app, shows.connection);
  const connection = connectionOf(app, shows.connection);
  if (tab === undefined || kept === undefined || connection === undefined) {
    return null;
  }
  const page: PageState = shownPage(kept, tab);
  const shown = showView(showInput(app, page, connection, now));
  return (
    <div className={styles['page']}>
      <PubSubToolbar tabId={tabId} tab={tab} page={page} shown={shown} />
      <PubSubState tabId={tabId} shown={shown} />
      <div className={styles['body-area']}>
        <div className={styles['lists']}>
          <SubscriptionsList tabId={tabId} page={page} connection={connection} onMenu={setMenu} />
          <ChannelsList tabId={tabId} tab={tab} page={page} connection={connection} onMenu={setMenu} />
        </div>
        <div className={styles['main']}>
          <SelectionBar tabId={tabId} page={page} now={now} />
          <MessagesTable
            tabId={tabId}
            tab={tab}
            page={page}
            now={now}
            readOnly={readOnlyTooltip(connection)}
            onMenu={setMenu}
            label={text.show.title}
          />
        </div>
      </div>
      <PubSubMenu
        tab={tabId}
        menu={menu}
        selected={page.selected}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}

/** The page of the active Pub/Sub tab. */
export function PubSubPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosedPubSubTabs(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== 'pubsub') {
    return null;
  }
  return <PubSubTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
