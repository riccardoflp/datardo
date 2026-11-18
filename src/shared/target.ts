/**
 * What a feature was started on: nothing in particular, a connection, a database, a collection, keys, a tab. Each
 * engine's areas add the kinds they need, here, as one more member of the union.
 */
import type { ConnectionId, TabId } from './ids';

/** What a feature was started on. */
export type Target =
  | { readonly kind: 'app' }
  | { readonly kind: 'tab'; readonly tab: TabId }
  | { readonly kind: 'connection'; readonly connection: ConnectionId }
  | { readonly kind: 'database'; readonly connection: ConnectionId; readonly database: string }
  | {
      readonly kind: 'collection';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
    }
  | { readonly kind: 'redis-database'; readonly connection: ConnectionId; readonly database: number }
  | { readonly kind: 'key'; readonly connection: ConnectionId; readonly database: number; readonly key: Uint8Array };

/** The target of a feature about Datardo itself. */
export const appTarget: Target = { kind: 'app' };

/** The connection a target is on, when it is on one. */
export function targetConnection(target: Target): ConnectionId | undefined {
  switch (target.kind) {
    case 'app':
    case 'tab':
      return undefined;
    case 'connection':
    case 'database':
    case 'collection':
    case 'redis-database':
    case 'key':
      return target.connection;
  }
}
