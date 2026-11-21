/**
 * The page the Views of the Pub/Sub page are drawn from: the app's page, with what the window keeps of the tab (the
 * kind and the filter as typed, the rows selected, the row inspected); and what a Pub/Sub tab adds to the active tab
 * for the status line and the inspector island (`nav.status-line`, `nav.inspector`): *37 of 1,204 messages*, and the
 * message selected, when one is; with no row selected the inspector island is hidden (`pubsub.inspect`).
 */
import { noPrefixNotice } from '../../../features/pubsub/follow-oplog';
import { view as inspectView } from '../../../features/pubsub/inspect';
import type { LinkedConnection, ShowInput } from '../../../features/pubsub/show';
import { text } from '../../../features/pubsub/text';
import { keptRows, pubsubPageOf, type PubSubPage } from '../../../features/pubsub/types';
import type { Inspection } from '../../../features/nav/types';
import { countsText, isFiltering, messageCount, shownMessages } from '../../../features/pubsub/filter';
import type { ConnectionView } from '../../../shared/connection';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { savedConnection } from '../../../shared/state/connections';
import { pubsubTabOf, type PubSubTab } from './pubsub-store';

/** The rows selected that the list still keeps: a row dropped by the limit or by **Clear** is not selected any more. */
function keptSelection(page: PubSubPage, tab: PubSubTab): readonly number[] {
  if (tab.selected.length === 0) {
    return tab.selected;
  }
  const kept = new Set(keptRows(page.kept).map((row) => row.number));
  return tab.selected.filter((number) => kept.has(number));
}

/** The page as the window shows it. */
export function shownPage(page: PubSubPage, tab: PubSubTab): PubSubPage {
  const { inspected: _page, ...rest } = page;
  return {
    ...rest,
    nameKind: tab.nameKind,
    filter: tab.filter,
    selected: keptSelection(page, tab),
    ...(tab.inspected === undefined ? {} : { inspected: tab.inspected }),
  };
}

/** The page of a tab as the window shows it, while the main process has it. */
export function pageOfTab(app: AppState, tab: PubSubTab): PubSubPage | undefined {
  const page = pubsubPageOf(app, tab.connection);
  return page === undefined ? undefined : shownPage(page, tab);
}

/** The MongoDB connections linked to a Redis connection, for **Events of**. */
export function linkedOf(app: AppState, connection: ConnectionId): readonly LinkedConnection[] {
  return app.connections.saved
    .filter((each) => each.engine === 'mongodb' && each.publishesTo === connection)
    .map((each) => ({ id: each.id, name: each.name }));
}

/** The connection of a page as the Views need it, while it is saved. */
export function connectionOf(app: AppState, id: ConnectionId): ConnectionView | undefined {
  return savedConnection(app.connections, id);
}

/** What `pubsub.show` is drawn from. */
export function showInput(app: AppState, page: PubSubPage, connection: ConnectionView, now: number): ShowInput {
  const mongo = page.eventsOf === undefined ? undefined : connectionOf(app, page.eventsOf);
  const notice = mongo === undefined ? undefined : noPrefixNotice(mongo, connection);
  return {
    page,
    connectionName: connection.name,
    readOnly: connection.readOnly,
    linked: linkedOf(app, connection.id),
    ...(notice === undefined ? {} : { noPrefix: notice }),
    now,
  };
}

/** The tooltip of what publishes, on a read-only connection. */
export function readOnlyTooltip(connection: ConnectionView): string | undefined {
  return connection.readOnly ? text.show.readOnlyPublish(connection.name) : undefined;
}

/** What a Pub/Sub tab adds to the active tab: the counts, and the message selected for the inspector island. */
export function pubsubExtras(app: AppState, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = pubsubTabOf(tabId);
  const page = tab === undefined ? undefined : pageOfTab(app, tab);
  if (page === undefined) {
    return {};
  }
  const all = messageCount(page.kept.listed);
  const count = countsText(messageCount(shownMessages(page.kept.listed, page.filter)), all, isFiltering(page.filter));
  const inspected = inspectView({ page });
  if (inspected === undefined) {
    return { count };
  }
  return { count, inspection: { selected: Math.max(1, page.selected.length), title: inspected.title, emptyLine: '' } };
}
