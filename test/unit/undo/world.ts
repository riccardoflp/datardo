/**
 * The runner with its hooks of the undo history and of redis-oplog, for the unit tests: the features of the registry
 * and the test plans, the actions of the undo history on a temporary data folder, and a server that keeps a few
 * documents of `shop.orders` and a few keys of `db0` in memory and answers the methods and commands they use.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runnableFeatures } from '../../../src/features/registry';
import { undoActions } from '../../../src/main/undo-actions';
import { testPlans } from '../../../src/main/test-plans';
import type { OplogClients } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import type { ConnectionRequest, Json, RedisRequest } from '../../../src/shared/engine-request';
import type { RunnableFeature } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Target } from '../../../src/shared/target';
import { harness, type Harness } from '../runner/harness';
import { appStateWith, cacheConnection, localConnection } from './harness';

type Doc = Readonly<Record<string, Json>>;

/** The documents of `shop.orders` and the keys of `db0`, as the fake server keeps them. */
export interface Data {
  readonly orders: Map<string, Doc>;
  readonly keys: Map<string, { value: string; pttl: number }>;
}

const decoder = new TextDecoder();

function idsIn(filter: Json | undefined): readonly Json[] | undefined {
  const id = (filter as Doc | undefined)?.['_id'];
  if (id === undefined) {
    return undefined;
  }
  const list = (id as Doc | null)?.['$in'];
  return Array.isArray(list) ? (list as readonly Json[]) : [id];
}

function matching(data: Data, filter: Json | undefined): readonly Doc[] {
  const ids = idsIn(filter);
  const all = [...data.orders.values()];
  if (ids !== undefined) {
    const wanted = new Set(ids.map((id) => JSON.stringify(id)));
    return all.filter((document) => wanted.has(JSON.stringify(document['_id'])));
  }
  const fields = Object.entries((filter ?? {}) as Doc);
  return all.filter((document) =>
    fields.every(([name, value]) => JSON.stringify(document[name]) === JSON.stringify(value)),
  );
}

function put(data: Data, document: Doc): void {
  data.orders.set(JSON.stringify(document['_id']), document);
}

function bulkWrite(data: Data, operations: readonly Json[]): Json {
  for (const operation of operations) {
    const [kind, body] = Object.entries(operation as Doc)[0] ?? [];
    const fields = (body ?? {}) as Doc;
    const id = JSON.stringify((fields['filter'] as Doc | undefined)?.['_id']);
    if (kind === 'deleteOne') {
      data.orders.delete(id);
    } else if (kind === 'replaceOne') {
      put(data, fields['replacement'] as Doc);
    }
  }
  return { ok: 1 };
}

function mongo(data: Data, method: string, args: readonly Json[]): Json {
  switch (method) {
    case 'find':
      return [...matching(data, args[0])];
    case 'updateMany': {
      const found = matching(data, args[0]);
      const set = ((args[1] as Doc | undefined)?.['$set'] ?? {}) as Doc;
      for (const document of found) {
        put(data, { ...document, ...set });
      }
      return { matchedCount: found.length, modifiedCount: found.length };
    }
    case 'insertMany': {
      const documents = (args[0] ?? []) as readonly Doc[];
      documents.forEach((document) => {
        put(data, document);
      });
      return {
        insertedIds: Object.fromEntries(documents.map((document, index) => [String(index), document['_id'] ?? null])),
      };
    }
    case 'deleteMany': {
      const found = matching(data, args[0]);
      found.forEach((document) => data.orders.delete(JSON.stringify(document['_id'])));
      return { deletedCount: found.length };
    }
    case 'bulkWrite':
      return bulkWrite(data, (args[0] ?? []) as readonly Json[]);
    default:
      throw new Error(`The fake server has no method ${method}.`);
  }
}

function redis(data: Data, request: RedisRequest): unknown {
  const [name = '', ...words] = request.command.map((word) => decoder.decode(word));
  const key = words[0] ?? '';
  const kept = data.keys.get(key);
  switch (name.toUpperCase()) {
    case 'DUMP':
      return kept === undefined ? null : new TextEncoder().encode(`dump:${kept.value}`);
    case 'PTTL':
      return kept === undefined ? -2 : kept.pttl;
    case 'TYPE':
      return new TextEncoder().encode(kept === undefined ? 'none' : 'string');
    case 'SET':
      data.keys.set(key, { value: words[1] ?? '', pttl: -1 });
      return 'OK';
    case 'DEL':
      return data.keys.delete(key) ? 1 : 0;
    case 'RESTORE':
      data.keys.set(key, { value: (words[2] ?? '').replace(/^dump:/u, ''), pttl: Number(words[1]) || -1 });
      return 'OK';
    default:
      throw new Error(`The fake server has no command ${name}.`);
  }
}

/** The events sent for redis-oplog: the channel and the message of each `PUBLISH`. */
export interface Published {
  readonly channel: string;
  readonly message: string;
}

/** The runner, its data, the data folder, what was published, and a way to start a feature. */
export interface World extends Harness {
  readonly data: Data;
  readonly folder: string;
  readonly published: Published[];
  readonly start: (feature: string, target: Target, args: Json, place?: 'table' | 'toolbar') => Promise<IntentResult>;
  readonly close: () => Promise<void>;
}

/** What a test changes in the world. */
export interface WorldOptions {
  readonly state?: AppState;
  readonly answers?: Record<string, unknown> | undefined;
  readonly confirmed?: boolean;
  /** Throws when the index of the undo history is written. */
  readonly indexFails?: boolean;
  /** What sending events for redis-oplog does. */
  readonly publish?: OplogClients['send'];
}

function features(): readonly RunnableFeature[] {
  return [...runnableFeatures().values(), ...testPlans];
}

/** The world of a test: three documents and two keys, the saved connections Local and Cache local. */
export async function world(options: WorldOptions = {}): Promise<World> {
  const folder = await mkdtemp(join(tmpdir(), 'datardo-undo-'));
  const data: Data = { orders: new Map(), keys: new Map() };
  for (const n of [1, 2, 3]) {
    put(data, { _id: `o${String(n)}`, status: 'new', n: { $numberInt: String(n) } });
  }
  data.keys.set('orders:1', { value: 'a', pttl: -1 });
  data.keys.set('orders:2', { value: 'b', pttl: 90_000 });
  const published: Published[] = [];
  const tested = harness({
    features: features(),
    state: options.state ?? appStateWith(),
    ...('answers' in options ? { answers: options.answers } : {}),
    ...(options.confirmed === undefined ? {} : { confirmed: options.confirmed }),
    server: (request: ConnectionRequest) => {
      const inner = request.request;
      return Promise.resolve(
        inner.engine === 'mongodb' ? mongo(data, inner.method, inner.arguments) : redis(data, inner),
      );
    },
  });
  const actions = undoActions({
    state: tested.ports.state,
    dataFolder: folder,
    engines: () => tested.ports.engines,
    writeEntries: () => {
      if (options.indexFails === true) {
        throw new Error('EACCES: permission denied');
      }
    },
    indexFound: () => ({ kind: 'current' }),
    connectFirst: () => Promise.resolve(),
    findConnection: () => undefined,
    writeConnection: () => undefined,
  });
  const ports = {
    ...tested.ports,
    appActions: new Map([...tested.ports.appActions, ...Object.entries(actions)]),
    connectionName: (id: string) =>
      id === localConnection.id ? 'Local' : id === cacheConnection.id ? 'Cache local' : id,
    oplog: {
      send:
        options.publish ??
        ((_mongo, _linked, requests) => {
          for (const request of requests) {
            const [, channel = '', message = ''] = request.command.map((word) => decoder.decode(word));
            published.push({ channel, message });
          }
          return Promise.resolve();
        }),
      secrets: () => ['s3cret'],
    },
  };
  return {
    ...tested,
    ports,
    data,
    folder,
    published,
    start: (feature, target, args, place) =>
      start(ports, {
        feature: featureId(feature),
        target,
        args,
        ...(place === undefined ? {} : { place }),
      }),
    close: () => rm(folder, { recursive: true, force: true }),
  };
}

/** The target of `shop.orders` on Local. */
export const ordersTarget: Target = {
  kind: 'collection',
  connection: localConnection.id,
  database: 'shop',
  collection: 'orders',
};

/** The arguments of a test plan on `shop.orders` of Local. */
export function onOrders(more: Readonly<Record<string, Json>>): Json {
  return { connection: localConnection.id, database: 'shop', collection: 'orders', ...more };
}
