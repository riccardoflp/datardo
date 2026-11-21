/**
 * The calls the Monitor page and the Index advisor send to MongoDB, and the steps of their plans, written as the cards
 * write them: `db.adminCommand({ killOp: 1, op: 4721 })` for a command of the admin database, and
 * `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })` for a command of another one.
 */
import type { Json, MongoRequest } from '../../../shared/engine-request';
import type { EngineStep, ReadRequest } from '../../../shared/feature';
import type { ConnectionId } from '../../../shared/ids';
import { mongoshValue } from '../../../shared/mongosh-value';
import { stepText } from '../../runner/step-text';

/** How long a command of the page may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const commandTimeLimitMs = 10_000;

/** How long the aggregations and counts of the cluster may take, in milliseconds (the cards' `maxTimeMS` 15,000). */
export const clusterTimeLimitMs = 15_000;

/** How long a write the page plans may take, in milliseconds (Datardo's choice, R9.2). */
export const writeTimeLimitMs = 60_000;

/** A command of the admin database: `db.adminCommand(command)`. */
export function adminCommand(command: Json, timeLimitMs: number = commandTimeLimitMs): MongoRequest {
  return { engine: 'mongodb', database: 'admin', method: 'runCommand', arguments: [command], timeLimitMs };
}

/** A command of a database: `db.getSiblingDB("shop").runCommand(command)`. */
export function databaseCommand(database: string, command: Json, timeLimitMs = commandTimeLimitMs): MongoRequest {
  return { engine: 'mongodb', database, method: 'runCommand', arguments: [command], timeLimitMs };
}

/** What a method of a collection is sent with. */
export interface CollectionCall {
  readonly database: string;
  readonly collection: string;
  readonly method: string;
  readonly arguments: readonly Json[];
  /** For a method that returns many documents, how many at most (R9.2). */
  readonly limit?: number;
  readonly timeLimitMs?: number;
}

/** A method of a collection: `db.getSiblingDB("shop").orders.aggregate([…])`. */
export function collectionCall(call: CollectionCall): MongoRequest {
  return {
    engine: 'mongodb',
    database: call.database,
    collection: call.collection,
    method: call.method,
    arguments: call.arguments,
    ...(call.limit === undefined ? {} : { limit: call.limit }),
    timeLimitMs: call.timeLimitMs ?? commandTimeLimitMs,
  };
}

/**
 * The read of requests on one connection. A request that fails is given to `parse` as `{ kind: 'error', message,
 * code }` (`parts/failure.ts`), so that each part of a page says its own error and the others are still shown.
 */
export function engineRead(connection: ConnectionId, requests: readonly MongoRequest[]): ReadRequest {
  return {
    kind: 'engine',
    requests: requests.map((request) => ({ connection, request })),
    failedRequests: 'are-replies',
  };
}

function argumentsText(request: MongoRequest): string {
  return request.arguments.map((argument) => mongoshValue(argument)).join(', ');
}

/** A collection whose name is identifiers joined by dots, which mongosh reaches as properties: `system.profile`. */
function isDottedName(collection: string): boolean {
  return collection.includes('.') && collection.split('.').every((part) => /^[A-Za-z_$][\w$]*$/u.test(part));
}

/**
 * A step of a plan that sends a request, its text as the cards write it: `db.adminCommand(…)` for a command of
 * admin, `db.getSiblingDB("shop").system.profile.drop()` for a collection named with dots, and otherwise as
 * `runner.step-text` writes it.
 */
export function mongoStep(connection: ConnectionId, request: MongoRequest, writes: boolean): EngineStep {
  const step = { kind: 'engine', connection, request, writes } as const;
  if (request.database === 'admin' && request.collection === undefined && request.method === 'runCommand') {
    return { ...step, text: `db.adminCommand(${argumentsText(request)})` };
  }
  if (request.collection !== undefined && isDottedName(request.collection)) {
    const database = `db.getSiblingDB(${JSON.stringify(request.database)})`;
    return { ...step, text: `${database}.${request.collection}.${request.method}(${argumentsText(request)})` };
  }
  return { ...step, text: stepText(step) };
}

/** `shop.orders`, as the cards write a namespace. */
export function namespaceOf(database: string, collection: string): string {
  return `${database}.${collection}`;
}

/** A namespace split at its first dot: `shop.orders.archive` is the collection `orders.archive` of `shop`. */
export function splitNamespace(namespace: string): { readonly database: string; readonly collection: string } {
  const dot = namespace.indexOf('.');
  return dot < 0
    ? { database: namespace, collection: '' }
    : { database: namespace.slice(0, dot), collection: namespace.slice(dot + 1) };
}

/** The characters of a regular expression escaped, so that the text is matched as it is. */
export function escapeRegularExpression(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
