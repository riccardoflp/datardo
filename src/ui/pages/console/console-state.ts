/**
 * What a console tab adds to the active tab for the status line and the inspector island (`nav.status-line`,
 * `nav.inspector`): *db0 · RESP3 · 12 ms*, and the string of a reply selected, when one is; with nothing selected the
 * inspector island is hidden. And the databases the menu of the toolbar lists: those the tree island shows.
 */
import { durationText } from '../../../features/console/output';
import { commandArguments } from '../../../features/console/parse-line';
import { replyLines } from '../../../features/console/reply';
import { text } from '../../../features/console/text';
import type { ConsoleState } from '../../../features/console/types';
import type { Inspection } from '../../../features/nav/types';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { treeOf } from '../../tree/tree-store';
import { consoleTabOf, type ConsoleTab } from './console-store';

/** The bytes of the string selected in the output, when it is still there. */
export function selectedBytes(console: ConsoleState, tab: ConsoleTab): Uint8Array | undefined {
  const selected = tab.selected;
  const entry = selected === undefined ? undefined : console.entries.find((each) => each.id === selected.entry);
  if (selected === undefined || entry?.reply === undefined) {
    return undefined;
  }
  const read = commandArguments(entry.line);
  const lines = replyLines(entry.reply, read.kind === 'arguments' ? read.arguments : [], entry.protocol);
  return lines[selected.line]?.strings[selected.string];
}

/** The status of the console: *db0 · RESP3 · 12 ms*. */
export function statusText(console: ConsoleState): string {
  return text.show.status(
    console.session.database,
    console.session.protocol,
    console.lastReplyMs === undefined ? undefined : durationText(console.lastReplyMs),
  );
}

/** What a console tab adds to the active tab: its status, and the value selected for the inspector island. */
export function consoleExtras(app: AppState, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = consoleTabOf(tabId);
  const console = tab === undefined ? undefined : app.consoles[tab.connection];
  if (tab === undefined || console === undefined) {
    return {};
  }
  const entry = console.entries.find((each) => each.id === tab.selected?.entry);
  const selected = entry !== undefined && selectedBytes(console, tab) !== undefined;
  return {
    count: statusText(console),
    ...(selected ? { inspection: { selected: 1, title: entry.line, emptyLine: '' } } : {}),
  };
}

/** The databases the tree island shows for the connection; none while it has not read them. */
export function databasesOf(connection: ConnectionId): readonly number[] {
  const read = treeOf(connection).island.redis.databases;
  return read.kind === 'loaded' ? read.value.databases.map((each) => each.number) : [];
}
