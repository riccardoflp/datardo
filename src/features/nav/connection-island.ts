/**
 * Feature: nav.connection-island
 *
 * The first island of the explorer: the current connection and its state, one button that opens the connection
 * switcher, the buttons its state needs, and the connection's menu.
 */
import { currentOf } from './current-connection';
import { view as linkedRows, type LinkedRow } from './linked-connection';
import { isSlow, latencyOf, latencyText } from './ping';
import { dotOf, type Dot } from './switch-connection';
import { text } from './text';
import type { NavInput, SavedConnection } from './types';

/** A button of the island's second line, and the feature it starts on the current connection. */
export interface IslandButton {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** The island with a connection current. */
export interface CurrentConnectionView {
  readonly kind: 'current';
  readonly name: string;
  readonly dot: Dot;
  readonly readOnly?: string;
  readonly line: string;
  /** The whole reason of a drop or a failure, shown when the pointer rests on the line. */
  readonly lineTooltip?: string;
  /** Whether the latency of the line is shown in the warning color. */
  readonly slow: boolean;
  readonly buttons: readonly IslandButton[];
  readonly menu: { readonly label: string; readonly element: 'connection.menu@connection-island' };
  readonly linked: readonly LinkedRow[];
}

/** What the connection island shows. */
export type ConnectionIslandView =
  | {
      readonly kind: 'no-connection-saved';
      readonly heading: string;
      readonly add: { readonly label: string; readonly feature: 'connection.add'; readonly element: string };
    }
  | { readonly kind: 'none-current'; readonly heading: string }
  | CurrentConnectionView;

/** The button that opens the connection switcher, as wide as the island. */
export const switcherElement = 'nav.switch-connection@connection-island';
/** The island itself. */
export const islandElement = 'nav.connection-island@connection-island';

function button(label: string, feature: string, element: string): IslandButton {
  return { label, feature, element };
}

function firstLine(reason: string): string {
  return reason.split('\n')[0] ?? '';
}

function stateLine(
  input: NavInput,
  connection: SavedConnection,
): Omit<CurrentConnectionView, 'kind' | 'name' | 'dot' | 'menu' | 'linked'> {
  const engine = text.engines[connection.engine];
  const status = connection.status;
  switch (status.kind) {
    case 'not-connected':
      return {
        line: `${engine} · ${text.connection.notConnected}`,
        slow: false,
        buttons: [button(text.connection.connect, 'connection.connect', 'connection.connect@connection-island')],
      };
    case 'connecting':
      return {
        line: text.connection.connecting,
        slow: false,
        buttons: [button(text.connection.cancel, 'connection.disconnect', 'connection.disconnect@connection-island')],
      };
    case 'connected': {
      const latency = latencyOf(input, connection);
      const parts = [`${engine} ${status.server.version}`, status.server.topology];
      const withLatency = input.nav.latency?.connection === connection.id ? [...parts, latencyText(latency)] : parts;
      return { line: withLatency.join(' · '), slow: isSlow(latency), buttons: [] };
    }
    case 'reconnecting':
      return {
        line: `${engine} · ${text.connection.reconnecting}`,
        lineTooltip: status.reason,
        slow: false,
        buttons: [button(text.connection.reconnect, 'connection.reconnect', 'connection.reconnect@connection-island')],
      };
    case 'failed':
      return {
        line: `${text.connection.failed} · ${firstLine(status.reason)}`,
        lineTooltip: status.reason,
        slow: false,
        buttons: [
          button(text.connection.retry, 'connection.connect', 'connection.connect@connection-island'),
          button(text.connection.reconnect, 'connection.reconnect', 'connection.reconnect@connection-island'),
          button(text.connection.edit, 'connection.edit', 'connection.edit@connection-island'),
        ],
      };
  }
}

/** What the connection island shows for the nav input given. */
export function view(input: NavInput): ConnectionIslandView {
  if (input.connections.length === 0) {
    return {
      kind: 'no-connection-saved',
      heading: text.connection.noConnectionsYet,
      add: { label: text.connection.addConnection, feature: 'connection.add', element: 'connection.add@tree' },
    };
  }
  const current = currentOf(input);
  if (current === undefined) {
    return { kind: 'none-current', heading: text.connection.chooseConnection };
  }
  return {
    kind: 'current',
    name: current.name,
    dot: dotOf(current.status),
    ...(current.readOnly ? { readOnly: text.connection.readOnly } : {}),
    ...stateLine(input, current),
    menu: { label: text.connection.menu, element: 'connection.menu@connection-island' },
    linked: linkedRows(input),
  };
}
