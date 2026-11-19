/**
 * Feature: tree.pages
 *
 * The pages of the current connection, at the bottom of the tree island, under **Pages of <name>**: for MongoDB
 * Overview, Monitor, Users and roles, Index advisor, Search documents, Watch changes, Playground and Scheduled tasks;
 * for Redis Overview, Server, Console and Pub/Sub. A click opens the page on the whole connection in a page tab, or
 * makes its tab active; Playground opens a new playground tab each time. The filter does not hide them.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Pin } from '../../shared/state/nav';
import { connectionPageShows, connectionPages } from '../palette/sources';
import { text as paletteText } from '../palette/text';
import { pinControl, pinsOf } from './pinned';
import { text } from './text';
import {
  currentConnection,
  menuOf,
  nodeId,
  nodeLabel,
  openControl,
  type MenuEntry,
  type TreeInput,
  type TreeNode,
} from './types';

/** A page of a connection, as `connectionPages` names it. */
export type ConnectionPage = (typeof connectionPages)[keyof typeof connectionPages][number];

/** The element of each page's control in the tree, from the card that lists the place `@tree`. */
const elements: Readonly<Record<ConnectionPage, string>> = {
  overview: 'connection.overview@tree',
  monitor: 'monitor.show@tree',
  users: 'user.show@tree',
  advisor: 'advisor.show@tree',
  search: 'search.show@tree',
  watch: 'watch.show@tree',
  playground: 'playground.open@tree',
  tasks: 'task.show@tree',
  server: 'server.show@tree',
  console: 'console.show@tree',
  pubsub: 'pubsub.show@tree',
};

const icons: Readonly<Record<ConnectionPage, string>> = {
  overview: 'info',
  monitor: 'pulse',
  users: 'person',
  advisor: 'lightbulb',
  search: 'search',
  watch: 'eye-watch',
  playground: 'play',
  tasks: 'calendar',
  server: 'server',
  console: 'terminal',
  pubsub: 'broadcast',
};

/** The heading of the part: **Pages of Local**, which follows a rename at once. */
export function heading(connection: ConnectionView): string {
  return text.parts.pagesOf(connection.name);
}

/** The pages of a connection, in the order of the part. */
export function pagesOf(connection: ConnectionView): readonly ConnectionPage[] {
  return connectionPages[connection.engine];
}

/** The pin of a page, for **Pin** and **Unpin** in its menu. */
export function pinOfPage(page: ConnectionPage): Pin {
  return { kind: 'page', page, title: paletteText.pages[page] };
}

/** Feature: tree.pages — the nodes of the part **Pages of <name>**, in their order. */
export function view(input: TreeInput): readonly TreeNode[] {
  const connection = currentConnection(input.state);
  if (connection === undefined) {
    return [];
  }
  const parent = nodeId({ kind: 'heading', part: 'pages' });
  return pagesOf(connection).map((page): TreeNode => {
    const id = nodeId({ kind: 'page', page });
    const name = paletteText.pages[page];
    return {
      kind: 'node',
      id,
      parent,
      level: 2,
      ref: { kind: 'page', page },
      name,
      icon: icons[page],
      dimmed: false,
      expandable: false,
      expanded: false,
      selected: input.island.selected === id,
      label: nodeLabel({ name, kind: text.kinds.page }),
      click: openControl(name, elements[page], connectionPageShows(connection.id, page)),
      buttons: [],
      hasMenu: true,
    };
  });
}

/** The context menu of a page: **Open**, and **Pin** or **Unpin**. */
export function menu(input: TreeInput, page: ConnectionPage): readonly MenuEntry[] {
  const connection = currentConnection(input.state);
  if (connection === undefined) {
    return [];
  }
  const open = openControl(text.menu.open, 'tree.pages@tree-menu', connectionPageShows(connection.id, page));
  return menuOf([[open, pinControl(connection.id, pinOfPage(page), pinsOf(input))]]);
}
