/**
 * Feature: server.clients
 *
 * The Clients section of the Server page: who is connected to the server, what each is doing, and **Disconnect…** on
 * each. The table is sorted by **ID** to start with; the filter looks, without case, in the address, the name, the
 * user, the command and the state; a row selected stays selected across refreshes by its `id`.
 */
import type { ConnectionView } from '../../shared/connection';
import { disconnectControl } from './kill-client';
import type { ServerClient } from './read-clients';
import { text } from './text';
import {
  bytesTooltip,
  clockText,
  countText,
  holdsWithoutCase,
  numberOfText,
  sentenceOf,
  sizeOrMissing,
  timeOrMissing,
  valueOf,
  type Inspection,
  type PartRead,
  type ServerControl,
} from './types';

/** The columns of the table, in their order. */
export type ClientColumn =
  'id' | 'address' | 'name' | 'user' | 'db' | 'age' | 'idle' | 'command' | 'state' | 'subscriptions' | 'memory';

/** The columns, in the order of the table. */
export const clientColumns: readonly ClientColumn[] = [
  'id',
  'address',
  'name',
  'user',
  'db',
  'age',
  'idle',
  'command',
  'state',
  'subscriptions',
  'memory',
];

/** The order of a column. */
export type SortDirection = 'ascending' | 'descending';

/** How the table is sorted. */
export interface ClientSort {
  readonly column: ClientColumn;
  readonly direction: SortDirection;
}

/** The sort to start with: by **ID**. */
export const initialClientSort: ClientSort = { column: 'id', direction: 'ascending' };

/** The columns a first click sorts the largest first: the times, the subscriptions, the memory (Datardo's choice). */
const largestFirst: ReadonlySet<ClientColumn> = new Set(['age', 'idle', 'subscriptions', 'memory']);

/** The sort after a click on a column header: by it, or the other way on a second click. */
export function sortedBy(sort: ClientSort, column: ClientColumn): ClientSort {
  if (sort.column === column) {
    return { column, direction: sort.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { column, direction: largestFirst.has(column) ? 'descending' : 'ascending' };
}

/** **State**: the letters of `flags` as words, separated by commas; `N` is nothing; a letter not known as it is. */
export function stateWords(flags: string | undefined): string {
  const words: string[] = [];
  for (const letter of flags ?? '') {
    const word = letter === 'N' ? undefined : (text.states[letter] ?? letter);
    if (word !== undefined && !words.includes(word)) {
      words.push(word);
    }
  }
  return words.join(', ');
}

/** The subscriptions of a client: `sub` + `psub` + `ssub`. */
export function subscriptionsOf(client: ServerClient): number {
  return (client.channels ?? 0) + (client.patterns ?? 0) + (client.shardChannels ?? 0);
}

/** The tooltip of **Subscriptions**: *2 channels, 1 pattern*. */
export function subscriptionsTooltip(client: ServerClient): string {
  return [
    client.channels ? text.clients.channels(client.channels) : '',
    client.patterns ? text.clients.patterns(client.patterns) : '',
    client.shardChannels ? text.clients.shardChannels(client.shardChannels) : '',
  ]
    .filter((part) => part !== '')
    .join(', ');
}

/** What the Clients section is drawn from: the clients read, and what the tab keeps of the section. */
export interface ClientsState {
  readonly connection: ConnectionView;
  readonly clients?: PartRead<readonly ServerClient[]>;
  /** When the clients were read, in milliseconds since 1970. */
  readonly readAt?: number;
  readonly filter: string;
  /** **Idle ≤**, as typed; empty for every client. */
  readonly idleAtMost: string;
  readonly sort: ClientSort;
  /** The `id` of the client selected. */
  readonly selected?: string;
  /** The `id` of the clients whose disconnection runs. */
  readonly disconnecting: readonly string[];
}

/** A row of the table. */
export interface ClientRow {
  readonly id: string;
  readonly address: string;
  readonly name: string;
  /** **Datardo** and **this page**. */
  readonly marks: readonly string[];
  readonly user: string;
  readonly db: string;
  readonly age: string;
  readonly idle: string;
  readonly command: string;
  readonly state: string;
  readonly subscriptions: string;
  readonly subscriptionsTooltip?: string;
  readonly memory: string;
  readonly memoryTooltip?: string;
  readonly selected: boolean;
  /** **Disconnect…**, **Copy address**, **Copy row**: the context menu and the `…` button. */
  readonly menu: readonly ServerControl[];
}

/** What the Clients section shows. */
export interface ClientsView {
  readonly toolbar: {
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly idle: { readonly label: string; readonly value: string };
    readonly count?: string;
  };
  readonly error?: string;
  /** The table, once the clients were read: none when `CLIENT LIST` was refused. */
  readonly table?: {
    readonly columns: readonly {
      readonly column: ClientColumn;
      readonly label: string;
      readonly sorted?: SortDirection;
    }[];
    readonly rows: readonly ClientRow[];
  };
  readonly noMatch?: string;
  readonly inspector?: Inspection;
}

function textOrMissing(value: string | undefined): string {
  return value === undefined || value === '' ? text.missing : value;
}

function sortValue(client: ServerClient, column: ClientColumn): number | string {
  switch (column) {
    case 'id':
      return numberOfText(client.id) ?? 0;
    case 'address':
      return client.address ?? '';
    case 'name':
      return client.name ?? '';
    case 'user':
      return client.user ?? '';
    case 'db':
      return client.database ?? -1;
    case 'age':
      return client.ageSeconds ?? -1;
    case 'idle':
      return client.idleSeconds ?? -1;
    case 'command':
      return client.command ?? '';
    case 'state':
      return stateWords(client.flags);
    case 'subscriptions':
      return subscriptionsOf(client);
    case 'memory':
      return client.memoryBytes ?? -1;
  }
}

/** The clients in the order of the sort; two equal values by `id`. */
export function sortedClients(clients: readonly ServerClient[], sort: ClientSort): readonly ServerClient[] {
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return clients.toSorted((one, other) => {
    const first = sortValue(one, sort.column);
    const second = sortValue(other, sort.column);
    const compared =
      typeof first === 'number' && typeof second === 'number'
        ? first - second
        : String(first).localeCompare(String(second), 'en');
    return sign * compared || (numberOfText(one.id) ?? 0) - (numberOfText(other.id) ?? 0);
  });
}

/** Whether a client is shown with the filter and **Idle ≤**. */
export function isClientShown(client: ServerClient, filter: string, idleAtMost: string): boolean {
  const most = numberOfText(idleAtMost.trim());
  if (most !== undefined && (client.idleSeconds === undefined || client.idleSeconds > most)) {
    return false;
  }
  const needle = filter.trim();
  const haystack = [client.address, client.name, client.user, client.command, stateWords(client.flags)];
  return needle === '' || haystack.some((each) => each !== undefined && holdsWithoutCase(each, needle));
}

function clientRow(state: ClientsState, client: ServerClient): ClientRow {
  const subscriptions = subscriptionsOf(client);
  const memoryTooltip = bytesTooltip(client.memoryBytes);
  const element = 'server.kill-client@row-menu';
  return {
    id: client.id,
    address: textOrMissing(client.address),
    name: textOrMissing(client.name),
    marks: [
      ...(client.datardo || client.own ? [text.clients.datardo] : []),
      ...(client.own ? [text.clients.thisPage] : []),
    ],
    user: textOrMissing(client.user),
    db: countText(client.database),
    age: timeOrMissing(client.ageSeconds),
    idle: timeOrMissing(client.idleSeconds),
    command: textOrMissing(client.command),
    state: stateWords(client.flags),
    subscriptions: subscriptions === 0 ? '' : countText(subscriptions),
    ...(subscriptions === 0 ? {} : { subscriptionsTooltip: subscriptionsTooltip(client) }),
    memory: sizeOrMissing(client.memoryBytes),
    ...(memoryTooltip === undefined ? {} : { memoryTooltip }),
    selected: client.id === state.selected,
    menu: [
      disconnectControl(state.connection, client, { element, running: state.disconnecting.includes(client.id) }),
      { kind: 'copy', label: text.clients.copyAddress, text: client.address ?? '' },
      {
        kind: 'copy',
        label: text.clients.copyRow,
        text: client.fields.map(([name, value]) => `${name}=${value}`).join(' '),
      },
    ],
  };
}

/** **Disconnect…** of the inspector island, for the client selected. */
export function inspectorDisconnect(state: ClientsState, client: ServerClient): ServerControl {
  return disconnectControl(state.connection, client, {
    element: 'server.kill-client@inspector',
    running: state.disconnecting.includes(client.id),
  });
}

/** Feature: server.clients — what the Clients section shows. */
export function view(state: ClientsState): ClientsView {
  const error = sentenceOf(state.clients);
  const read = valueOf(state.clients);
  const clients = read ?? [];
  const shown = sortedClients(
    clients.filter((client) => isClientShown(client, state.filter, state.idleAtMost)),
    state.sort,
  );
  const selected = clients.find((client) => client.id === state.selected);
  const counted = read !== undefined && state.readAt !== undefined;
  const header = clientColumns.map((column) => ({
    column,
    label: text.clients.columns[column],
    ...(state.sort.column === column ? { sorted: state.sort.direction } : {}),
  }));
  return {
    toolbar: {
      filter: { placeholder: text.clients.filter, value: state.filter },
      idle: { label: text.clients.idle, value: state.idleAtMost },
      ...(counted ? { count: text.clients.count(shown.length, clients.length, clockText(state.readAt ?? 0)) } : {}),
    },
    ...(error === undefined ? {} : { error }),
    ...(read === undefined
      ? {}
      : { table: { columns: header, rows: shown.map((client) => clientRow(state, client)) } }),
    ...(clients.length > 0 && shown.length === 0 ? { noMatch: text.clients.noMatch } : {}),
    ...(selected === undefined ? {} : { inspector: { title: selected.id, fields: selected.fields } }),
  };
}
