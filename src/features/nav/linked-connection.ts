/**
 * Feature: nav.linked-connection
 *
 * Under the current connection in the connection island, the connection it is linked to for redis-oplog, one click
 * away: for a MongoDB connection the Redis connection it publishes to; for a Redis connection the MongoDB connections
 * that publish to it, three at most.
 */
import type { ConnectionId } from '../../shared/ids';
import { currentOf } from './current-connection';
import { dotOf, type Dot } from './switch-connection';
import { text } from './text';
import { findConnection, type NavInput } from './types';

/** How many linked MongoDB connections a Redis connection lists (Datardo's choice). */
export const linkedRowLimit = 3;

/** One row: a click makes that connection current, with the plan of `nav.switch-connection`. */
export type LinkedRow =
  | {
      readonly kind: 'connection';
      readonly connection: ConnectionId;
      readonly name: string;
      readonly engine: string;
      readonly dot: Dot;
      readonly tooltip: string;
      readonly element: 'nav.linked-connection@connection-island';
    }
  /** **and \<n\> more**, which opens the connection switcher. */
  | { readonly kind: 'more'; readonly label: string; readonly element: 'nav.switch-connection@connection-island' };

/** The rows under the current connection; none when it is linked to nothing. */
export function view(input: NavInput): readonly LinkedRow[] {
  const current = currentOf(input);
  if (current === undefined) {
    return [];
  }
  if (current.engine === 'mongodb') {
    const redis = findConnection(input.connections, current.publishesTo);
    return redis === undefined
      ? []
      : [
          {
            kind: 'connection',
            connection: redis.id,
            name: redis.name,
            engine: text.engines.redis,
            dot: dotOf(redis.status),
            tooltip: text.linked.receives(current.name),
            element: 'nav.linked-connection@connection-island',
          },
        ];
  }
  const publishers = input.connections.filter(
    (connection) => connection.engine === 'mongodb' && connection.publishesTo === current.id,
  );
  const rows: LinkedRow[] = publishers.slice(0, linkedRowLimit).map((mongo) => ({
    kind: 'connection',
    connection: mongo.id,
    name: mongo.name,
    engine: text.engines.mongodb,
    dot: dotOf(mongo.status),
    tooltip: text.linked.publishes(current.name),
    element: 'nav.linked-connection@connection-island',
  }));
  if (publishers.length > linkedRowLimit) {
    rows.push({
      kind: 'more',
      label: text.linked.more(publishers.length - linkedRowLimit),
      element: 'nav.switch-connection@connection-island',
    });
  }
  return rows;
}
