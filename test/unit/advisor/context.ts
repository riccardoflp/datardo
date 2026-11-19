/**
 * What the unit tests of the Index advisor build their inputs from: indexes and collections as `advisor.read-indexes`
 * returns them, slow operations read from documents of `system.profile` as the server writes them, and the replies
 * recorded from MongoDB 8.2 (`test/fixtures/replies/mongodb-8.2-advisor-*.json`). The connections, the context and
 * the values of Extended JSON are the Monitor page's (`test/unit/monitor/context.ts`).
 */
import type { AdvisorCollection, AdvisorIndex } from '../../../src/features/advisor/types';
import { fromProfileDocument } from '../../../src/features/monitor/parts/slow-query-records';
import { indexKeyOf, type SlowQuery } from '../../../src/features/monitor/types';
import type { Json } from '../../../src/shared/engine-request';
import { mongoReply } from '../connection/replies';
import { int, long } from '../monitor/context';

/** A day, in milliseconds. */
export const day = 86_400_000;

/** An hour, in milliseconds. */
export const hour = 3_600_000;

/** A megabyte, in bytes. */
export const megabyte = 1024 * 1024;

/** A reply recorded from MongoDB 8.2 by `test/integration/advisor/record-replies.test.ts`. */
export function recorded(name: string): Json {
  return mongoReply(`mongodb-8.2-advisor-${name}`);
}

/** An index with its keys (`{ status: 1, createdAt: -1 }`), plain unless `more` says otherwise. */
export function index(
  name: string,
  key: Readonly<Record<string, number | string>>,
  more: Partial<AdvisorIndex> = {},
): AdvisorIndex {
  return { name, key: indexKeyOf(key), unique: false, sparse: false, hidden: false, building: false, ...more };
}

/** `_id_ { _id: 1 }`. */
export const idIndex: AdvisorIndex = index('_id_', { _id: 1 }, { unique: true });

/** A collection of `shop.orders`-like namespace with its indexes. */
export function collectionOf(namespace: string, indexes: readonly AdvisorIndex[]): AdvisorCollection {
  const [database = '', ...rest] = namespace.split('.');
  return { database, collection: rest.join('.'), indexes };
}

/** What a slow operation is made of. */
export interface OperationGiven {
  readonly namespace?: string;
  readonly filter?: Json;
  readonly sort?: Json;
  readonly pipeline?: readonly Json[];
  readonly millis?: number;
  readonly examined?: number;
  readonly returned?: number;
  readonly plan?: string;
  readonly inMemorySort?: boolean;
  /** A `getMore` of the cursor this `find` opened. */
  readonly getMore?: boolean;
  /** When it ran, in milliseconds since 1970. */
  readonly time?: number;
}

function commandOf(collection: string, given: OperationGiven): Json {
  return given.pipeline === undefined
    ? { find: collection, filter: given.filter ?? {}, ...(given.sort === undefined ? {} : { sort: given.sort }) }
    : { aggregate: collection, pipeline: [...given.pipeline], cursor: {} };
}

/** A document of `system.profile` as the server writes it. */
export function profileDocument(given: OperationGiven): Json {
  const namespace = given.namespace ?? 'shop.orders';
  const collection = namespace.slice(namespace.indexOf('.') + 1);
  const command = commandOf(collection, given);
  return {
    op: given.getMore === true ? 'getmore' : given.pipeline === undefined ? 'query' : 'command',
    ns: namespace,
    command: given.getMore === true ? { getMore: long(1), collection } : command,
    ...(given.getMore === true ? { originatingCommand: command } : {}),
    docsExamined: int(given.examined ?? 0),
    nreturned: int(given.returned ?? 0),
    ...(given.inMemorySort === true ? { hasSortStage: true } : {}),
    planSummary: given.plan ?? 'COLLSCAN',
    millis: int(given.millis ?? 200),
    ts: { $date: { $numberLong: String(given.time ?? Date.UTC(2026, 10, 17, 12, 0, 0)) } },
  };
}

/** A slow operation, read from its document of `system.profile`. */
export function operation(given: OperationGiven): SlowQuery {
  return fromProfileDocument(profileDocument(given));
}

/** The same operation several times. */
export function times(count: number, given: OperationGiven): readonly SlowQuery[] {
  return Array.from({ length: count }, () => operation(given));
}
