/**
 * Feature: home.card-menu
 *
 * The menu of a connection on Home, from the `…` of its card, a right click on the card, or `Shift+F10` with the focus
 * on it: the entries of `connection.menu` for this connection, in its order and wording, with its lines. Home adds no
 * entry and leaves none out; choosing one does not make the connection the current one.
 */
import type { ConnectionView } from '../../shared/connection';
import type { ConnectionsState } from '../../shared/state/connections';
import { view as connectionMenu, type MenuView } from '../connection/menu';

/** The menu of the card of `connection`. */
export function view(state: {
  readonly connections: ConnectionsState;
  readonly connection: ConnectionView;
}): MenuView & { readonly opener: 'home.card-menu@home' } {
  return {
    ...connectionMenu({ connections: state.connections, connection: state.connection, place: 'home' }),
    opener: 'home.card-menu@home',
  };
}
