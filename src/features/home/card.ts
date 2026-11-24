/**
 * Feature: home.card
 *
 * One saved connection on Home: a band in its color, its name, its engine (and its version while connected), its
 * address without credentials (`home.address`), its marks, its state, and the one button its state calls for. It is made
 * from the connection as it is saved and from its state, never from the connection string.
 */
import type { ConnectionColor, ConnectionStateName, ConnectionView } from '../../shared/connection';
import type { ConnectionId } from '../../shared/ids';
import type { ConnectionsState, LiveConnection } from '../../shared/state/connections';
import { serverText } from '../connection/server-info';
import { address, addressHosts } from './address';
import { text } from './text';

/** What the card is drawn from: the saved connections and their states, the current connection, and this one. */
export interface CardInput {
  readonly connections: ConnectionsState;
  readonly current?: ConnectionId | undefined;
  readonly connection: ConnectionView;
}

/** The button of a card, by the state of its connection. */
export type CardButton =
  | { readonly kind: 'connect'; readonly label: string; readonly element: 'nav.switch-connection@home' }
  | { readonly kind: 'cancel'; readonly label: string; readonly element: 'connection.connect@home' }
  | { readonly kind: 'go-to'; readonly label: string; readonly element: 'nav.switch-connection@home' };

/** The state as the card shows it: nothing when it is not connected. */
export interface CardState {
  readonly name: ConnectionStateName;
  /** *Connecting…*, *Connected*, *Reconnecting…*, *Failed*; empty when not connected. */
  readonly text: string;
  /** The first line of the reason of a failure, shown under the state. */
  readonly line?: string;
  /** What is shown when the pointer rests on the state: the whole reason. */
  readonly tooltip?: string;
}

/** A card, as Home draws it. */
export interface CardView {
  readonly id: ConnectionId;
  readonly element: 'home.card@home';
  /** The color of the band; none for the grey one. */
  readonly color?: ConnectionColor;
  readonly name: string;
  /** **MongoDB** or **Redis**, with the version while connected: `MongoDB 8.0`. */
  readonly engine: string;
  readonly address: string;
  /** Every host, one for each line of the tooltip of the address. */
  readonly hosts: readonly string[];
  readonly marks: readonly string[];
  readonly state: CardState;
  readonly button: CardButton;
  /** The card of the current connection is marked with a line in its color. */
  readonly current: boolean;
  readonly menuLabel: string;
  /** What a screen reader says: the name, the engine, the address, the marks and the state. */
  readonly spoken: string;
}

function engineText(connection: ConnectionView, live: LiveConnection | undefined): string {
  const engine = text.card.engines[connection.engine];
  const shown = live?.state === 'connected' || live?.state === 'reconnecting' ? live.server : undefined;
  return shown === undefined ? engine : (serverText(shown).split(' · ')[0] ?? engine);
}

/** The marks, in the order of the card, each only when it applies. */
export function marksOf(connection: ConnectionView): readonly string[] {
  return [
    ...(connection.readOnly ? [text.card.marks.readOnly] : []),
    ...(connection.ssh === undefined ? [] : [text.card.marks.ssh]),
    ...(connection.engine === 'mongodb' && connection.publishesTo !== undefined ? [text.card.marks.oplog] : []),
    ...(connection.excluded === true ? [text.card.marks.excluded] : []),
  ];
}

/** The state of the card, without the latency. */
export function cardState(live: LiveConnection | undefined): CardState {
  const name = live?.state ?? 'not-connected';
  const reason = live?.reason ?? '';
  switch (name) {
    case 'not-connected':
      return { name, text: '' };
    case 'connecting':
      return { name, text: text.card.states.connecting };
    case 'connected':
      return { name, text: text.card.states.connected };
    case 'reconnecting':
      return { name, text: text.card.states.reconnecting, ...(reason === '' ? {} : { tooltip: reason }) };
    case 'failed':
      return {
        name,
        text: text.card.states.failed,
        ...(reason === '' ? {} : { line: reason.split(/\r?\n/u)[0] ?? '', tooltip: reason }),
      };
  }
}

/** The one button: **Connect**, **Cancel** while connecting, **Go to** when connected or reconnecting. */
export function buttonOf(state: ConnectionStateName): CardButton {
  switch (state) {
    case 'connecting':
      return { kind: 'cancel', label: text.card.cancel, element: 'connection.connect@home' };
    case 'connected':
    case 'reconnecting':
      return { kind: 'go-to', label: text.card.goTo, element: 'nav.switch-connection@home' };
    case 'not-connected':
    case 'failed':
      return { kind: 'connect', label: text.card.connect, element: 'nav.switch-connection@home' };
  }
}

/** The card of a connection. */
export function view(input: CardInput): CardView {
  const { connection } = input;
  const live = input.connections.live[connection.id];
  const state = cardState(live);
  const engine = engineText(connection, live);
  const where = address(connection);
  const marks = marksOf(connection);
  return {
    id: connection.id,
    element: 'home.card@home',
    ...(connection.color === undefined ? {} : { color: connection.color }),
    name: connection.name,
    engine,
    address: where,
    hosts: addressHosts(connection),
    marks,
    state,
    button: buttonOf(state.name),
    current: input.current === connection.id,
    menuLabel: text.card.menu(connection.name),
    spoken: [connection.name, engine, where, ...marks, state.text].filter((part) => part !== '').join(', '),
  };
}
