/**
 * Feature: manage.read-options
 *
 * What MongoDB reports about one collection or view: whether it exists, its type, and its options, among them the
 * definition of a view and the validation rules of a collection. The options keep the canonical Extended JSON the
 * engine gives, so that a date stays a date and a 32-bit integer stays one when they are written back.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { isDocument, mongoRequest, type JsonDocument } from './types';

/** How long the server may take, in ms (R9.2; Datardo's choice, as the tree's lists). */
export const readTimeLimitMs = 10_000;

/** The types of what `listCollections` lists. */
export type CollectionType = 'collection' | 'view' | 'timeseries';

/** What `manage.read-options` gives: the collection or view with its options, or *not found*. */
export type CollectionOptions =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'found'; readonly type: CollectionType; readonly options: JsonDocument };

/** The definition of a view. */
export interface ViewDefinition {
  readonly viewOn: string;
  readonly pipeline: readonly Json[];
}

/** The validation rules of a collection, with the level and the action the server applies when none is set. */
export interface ValidationRules {
  readonly validator: JsonDocument;
  readonly validationLevel: Json;
  readonly validationAction: Json;
}

function textArg(args: Json, name: string): string {
  const value = isDocument(args) ? args[name] : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * Feature: manage.read-options — `db.getCollectionInfos({ name: "orders" })` for `{ connection, database, collection
 * }`.
 */
export function request(_context: Context, args: Json): ReadRequest {
  const collection = textArg(args, 'collection');
  if (collection === '') {
    throw new Error('manage.read-options needs { connection, database, collection }.');
  }
  const database = textArg(args, 'database');
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textArg(args, 'connection')),
        request: {
          ...mongoRequest({ database }, 'listCollections', [{ name: collection }]),
          timeLimitMs: readTimeLimitMs,
        },
      },
    ],
  };
}

function failureOf(reply: unknown): string | undefined {
  if (reply instanceof Error) {
    return reply.message;
  }
  if (!isDocument(reply)) {
    return undefined;
  }
  if (reply['kind'] === 'error' && typeof reply['message'] === 'string') {
    return reply['message'];
  }
  const ok = reply['ok'];
  const failed = ok === 0 || (isDocument(ok) && Number(Object.values(ok)[0]) === 0);
  return failed
    ? typeof reply['errmsg'] === 'string'
      ? reply['errmsg']
      : 'The server refused the command.'
    : undefined;
}

function typeOf(value: Json | undefined): CollectionType {
  return value === 'view' || value === 'timeseries' ? value : 'collection';
}

/**
 * Feature: manage.read-options — the first collection listed, or *not found* when none is. A request that failed
 * fails the read with the server's message, which the section shows with **Reload**.
 */
export function parse(replies: readonly unknown[]): CollectionOptions {
  const [reply] = replies;
  const failure = failureOf(reply);
  if (failure !== undefined) {
    throw new Error(failure);
  }
  const listed = Array.isArray(reply) ? reply.filter(isDocument) : [];
  const [info] = listed;
  if (info === undefined) {
    return { kind: 'not-found' };
  }
  const options = info['options'];
  return { kind: 'found', type: typeOf(info['type']), options: isDocument(options) ? options : {} };
}

/** Feature: manage.read-options — the definition of a view: `{ viewOn, pipeline }`, `pipeline` empty when absent. */
export function viewDefinition(options: JsonDocument): ViewDefinition {
  const viewOn = options['viewOn'];
  const pipeline = options['pipeline'];
  return { viewOn: typeof viewOn === 'string' ? viewOn : '', pipeline: Array.isArray(pipeline) ? pipeline : [] };
}

/** Whether a validator says nothing: missing, or `{}`. */
export function isNoRules(validator: Json | undefined): boolean {
  return validator === undefined || (isDocument(validator) && Object.keys(validator).length === 0);
}

/**
 * Feature: manage.read-options — the validation rules of a collection: `validationLevel` *strict* and
 * `validationAction` *error* when the server reports none; a missing validator is `{}`.
 */
export function validationRules(options: JsonDocument): ValidationRules {
  const validator = options['validator'];
  return {
    validator: isDocument(validator) ? validator : {},
    validationLevel: options['validationLevel'] ?? 'strict',
    validationAction: options['validationAction'] ?? 'error',
  };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('manage.read-options'), request, parse };
