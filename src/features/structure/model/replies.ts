/**
 * What the replies of the reads of `structure.read` hold: the documents of a cursor, whether a request failed and
 * with what message and code, whether a failure of `$listSearchIndexes` means that the server has no search.
 */
import type { Json } from '../../../shared/engine-request';
import { isJsonObject } from '../../query/mongosh/ejson';
import type { JsonObject } from '../types';
import { isDocument } from './values';

/** A request that failed, as the runner gives it to `parse` in place of its reply. */
export interface Failure {
  readonly message: string;
  readonly code?: number;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The failure a reply stands for (`{ kind: 'error', message, code? }` or an `Error`); `undefined` for a reply. */
export function failureOf(reply: unknown): Failure | undefined {
  if (reply instanceof Error) {
    const code = (reply as Error & { readonly code?: unknown }).code;
    return { message: reply.message, ...(typeof code === 'number' ? { code } : {}) };
  }
  if (isObject(reply) && reply['kind'] === 'error' && typeof reply['message'] === 'string') {
    const code = reply['code'];
    return { message: reply['message'], ...(typeof code === 'number' ? { code } : {}) };
  }
  return undefined;
}

/** The documents of a reply: an array, or a command's cursor (`{ cursor: { firstBatch: [ … ] } }`). */
export function documentsOf(reply: unknown): readonly JsonObject[] {
  if (Array.isArray(reply)) {
    return (reply as readonly Json[]).filter(isDocument);
  }
  if (isObject(reply) && isJsonObject(reply['cursor'] as Json)) {
    const cursor = reply['cursor'] as JsonObject;
    const batch = cursor['firstBatch'];
    return Array.isArray(batch) ? (batch as readonly Json[]).filter(isDocument) : [];
  }
  return [];
}

/** Whether `hello` says that the server is a mongos: `msg: "isdbgrid"`. */
export function isMongos(reply: unknown): boolean {
  return failureOf(reply) === undefined && isObject(reply) && reply['msg'] === 'isdbgrid';
}

/** SearchNotEnabled, CommandNotFound, CommandNotSupported, an unknown stage (servers before 6.0.7). */
const unsupportedCodes = new Set([31082, 59, 115, 40324, 6047401]);

/** SearchIndexManagementHostUnreachable: the server has search, but its mongot does not answer now. */
const unreachableCodes = new Set([508]);

const unsupportedText =
  /requires additional configuration|only supported (with|on) (MongoDB )?Atlas|Unrecognized pipeline stage name: '\$listSearchIndexes'|search index commands are not supported|mongot/iu;

const unreachableText =
  /Error connecting to Search Index Management service|SearchIndexManagementHostUnreachable|connectivity of gRPC channel/iu;

/** Whether a failure of `$listSearchIndexes` says that the server has no search, rather than that it went wrong. */
export function isSearchUnsupported(failure: Failure): boolean {
  const unreachable =
    (failure.code !== undefined && unreachableCodes.has(failure.code)) || unreachableText.test(failure.message);
  if (unreachable) {
    return false;
  }
  return (failure.code !== undefined && unsupportedCodes.has(failure.code)) || unsupportedText.test(failure.message);
}
