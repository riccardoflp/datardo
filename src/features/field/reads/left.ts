/**
 * The count after a conversion of the values still not converted (`field.convert-type`, **Reads**): the filter of
 * `field.convert-plan` counted again. Started by what follows the conversion, it adds *`<j>` values couldn't be
 * converted and kept their type.* when some are left, and nothing otherwise. A read of its own, named as a variant of
 * the feature that starts it.
 */
import type { Json } from '../../../shared/engine-request';
import type { After, Context, ReadFeature, ReadRequest } from '../../../shared/feature';
import { connectionId, featureId } from '../../../shared/ids';
import { text } from '../text';
import { countTimeLimitMs, isDocument, numberOf, type FieldPlace, type JsonDocument } from '../types';

/** The identifier the runner knows this read by. */
export const leftRead = featureId('field.convert-type:left');

/** What follows a conversion: the count of the values left, with the filter of `field.convert-plan`. */
export function leftAfter(place: FieldPlace, filter: JsonDocument): After {
  return {
    kind: 'start',
    feature: leftRead,
    target: {
      kind: 'collection',
      connection: place.connection.id,
      database: place.database,
      collection: place.collection,
    },
    args: {
      connection: place.connection.id,
      database: place.database,
      collection: place.collection,
      filter,
    },
  };
}

function textOf(args: Json, name: string): string {
  const value = isDocument(args) ? args[name] : undefined;
  return typeof value === 'string' ? value : '';
}

/** `db.people.countDocuments(<filter>)`, for `{ connection, database, collection, filter }`. */
export function request(_context: Context, args: Json): ReadRequest {
  const filter = isDocument(args) && isDocument(args['filter']) ? args['filter'] : {};
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textOf(args, 'connection')),
        request: {
          engine: 'mongodb',
          database: textOf(args, 'database'),
          collection: textOf(args, 'collection'),
          method: 'countDocuments',
          arguments: [filter],
          timeLimitMs: countTimeLimitMs,
        },
      },
    ],
  };
}

/** The number of values left; 0 when the reply is not a number. */
export function parse(replies: readonly unknown[]): number {
  return numberOf(replies[0]) ?? 0;
}

/** The notification of the values left, when there are some. */
export function after(result: unknown): readonly After[] {
  const left = typeof result === 'number' ? result : 0;
  return left > 0 ? [{ kind: 'notify', level: 'warning', text: text.convert.notConverted(left) }] : [];
}

/** The read, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: leftRead, request, parse, after };
