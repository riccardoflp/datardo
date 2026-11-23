/**
 * The state `key.show`, `key.select` and `key.inspect` are drawn from, made of what a keys tab keeps and the app's
 * state; and what a keys tab adds to the active tab for the status line and the inspector island (`nav.status-line`,
 * `nav.inspector`).
 */
import { view as selectView } from '../../../features/key/select';
import { countText, view as showView, type KeysPageState } from '../../../features/key/show';
import { nameText } from '../../../features/key/types';
import type { Inspection } from '../../../features/nav/types';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { connectionState, savedConnection } from '../../../shared/state/connections';
import type { KeysTab } from './keys-store';
import { keysTabOf } from './keys-store';

/** What the page needs of its connection. */
export interface ConnectionFacts {
  readonly name: string;
  readonly readOnly: boolean;
  readonly connected: boolean;
}

/** What the page knows of a connection it reads before the app's state is at hand. */
const unknownFacts: ConnectionFacts = { name: '', readOnly: true, connected: true };

/** The connection of a tab as the page needs it. */
export function factsOf(app: AppState, connection: ConnectionId): ConnectionFacts {
  const saved = savedConnection(app.connections, connection);
  return {
    name: saved?.name ?? '',
    readOnly: saved?.readOnly ?? true,
    connected: connectionState(app.connections, connection) === 'connected',
  };
}

/** The state of `key.show`, from what the tab keeps. */
export function pageStateOf(tab: KeysTab, facts: ConnectionFacts = unknownFacts, now = 0): KeysPageState {
  return {
    connection: { id: tab.where.connection, ...facts },
    database: tab.where.database,
    ...(tab.where.namespace === undefined ? {} : { namespace: tab.where.namespace }),
    field: tab.field,
    last: tab.last,
    ...(tab.scan === undefined ? {} : { scan: tab.scan }),
    ...(tab.previous === undefined ? {} : { previous: tab.previous }),
    ...(tab.error === undefined ? {} : { error: tab.error }),
    details: tab.details,
    sizesRefused: tab.sizesRefused,
    sort: tab.sort,
    selection: tab.selection,
    now,
  };
}

/** The keys of the tab in the order of the table, and the selection drawn from them (`key.select`). */
export function selectionOf(app: AppState, tab: KeysTab) {
  const page = showView(pageStateOf(tab, factsOf(app, tab.where.connection)));
  return selectView({
    selection: tab.selection,
    rows: page.rows.filter((row) => !row.gone).map((row) => row.name),
    readOnly: factsOf(app, tab.where.connection).readOnly,
  });
}

/** What a keys tab adds to the active tab: the count of the status line and the inspection of the island. */
export function keysExtras(app: AppState, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = keysTabOf(tabId);
  if (tab === undefined) {
    return {};
  }
  const count = countText(pageStateOf(tab));
  const selected = selectionOf(app, tab);
  const inspector = selected.inspector;
  const inspection: Inspection =
    inspector.kind === 'one'
      ? { selected: 1, title: nameText(inspector.key), emptyLine: '' }
      : { selected: selected.count, emptyLine: inspector.line };
  return { ...(count === '' ? {} : { count }), inspection };
}
