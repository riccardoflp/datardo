/**
 * Slow operations built for the unit tests of the Slow queries section: a `find` on `shop.orders` unless told
 * otherwise, with its shape made by `monitor.query-shape`.
 */
import { queryShape } from '../../../src/features/monitor/query-shape';
import type { QueryParts, SlowQuery } from '../../../src/features/monitor/types';
import { now } from './context';

/** A slow operation: the fields given, the others of a `find` of `{ status: "paid" }` on `shop.orders`. */
export function slowQuery(fields: Partial<SlowQuery> & { readonly query?: QueryParts } = {}): SlowQuery {
  const kind = fields.kind ?? 'find';
  const query = fields.query ?? { filter: { status: 'paid' } };
  return {
    source: 'profiler',
    time: now,
    namespace: 'shop.orders',
    getMore: false,
    millis: 100,
    inMemorySort: false,
    command: `{ ${kind}: "orders" }`,
    record: { op: kind },
    ...fields,
    kind,
    query,
    shape: fields.shape ?? queryShape(kind, query),
  };
}
