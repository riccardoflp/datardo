/**
 * Feature: nav.empty
 *
 * What the explorer shows before the first connection is saved, and while none is current. The connection island
 * says it (`nav.connection-island`); the tree island says what will be listed, or offers to choose a connection.
 */
import { currentOf } from './current-connection';
import { text } from './text';
import type { NavInput } from './types';

/** What the tree island shows when no connection is current; `undefined` while one is. */
export type EmptyTreeView =
  | { readonly kind: 'no-connection-saved'; readonly line: string }
  | {
      readonly kind: 'none-current';
      readonly line: string;
      readonly choose: { readonly label: string; readonly feature: 'nav.switch-connection' };
    };

/** The tree island with no connection current, or `undefined` while one is. */
export function view(input: NavInput): EmptyTreeView | undefined {
  if (input.connections.length === 0) {
    return { kind: 'no-connection-saved', line: text.tree.noConnectionSaved };
  }
  if (currentOf(input) === undefined) {
    return {
      kind: 'none-current',
      line: text.tree.noConnectionCurrent,
      choose: { label: text.connection.chooseConnection, feature: 'nav.switch-connection' },
    };
  }
  return undefined;
}
