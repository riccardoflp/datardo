/**
 * The BSON bytes of a document given as canonical Extended JSON, which the undo history fingerprints and measures
 * (`undo.record`): the driver's serializer, so that the bytes are those the server stores, types kept.
 */
import { BSON, type Document } from 'mongodb';
import type { Json } from '../../shared/engine-request';
import { fromExtendedJson } from './methods';

/** The BSON bytes of a document of canonical Extended JSON. */
export function bsonBytes(document: Json): Uint8Array {
  return BSON.serialize(fromExtendedJson(document) as Document);
}
