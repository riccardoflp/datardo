/**
 * Feature: field.convert-plan
 *
 * The filter and the update pipeline of **Convert type…**, and the types it offers. A value that cannot be converted
 * keeps its value and type; null and arrays are left as they are.
 */
import type { Json } from '../../shared/engine-request';
import { and, noArrayParents } from './array-guard';
import type { JsonDocument } from './types';

/** The types **Convert type…** offers, as `$convert` names them. */
export type ConvertType = 'string' | 'int' | 'long' | 'double' | 'decimal' | 'bool' | 'date' | 'objectId';

/** Feature: field.convert-plan — the types offered, in this order, with their descriptions. */
export const CONVERT_TYPES: readonly { readonly type: ConvertType; readonly description: string }[] = [
  { type: 'string', description: 'Numbers, dates (ISO), ObjectIds and booleans as text' },
  { type: 'int', description: '32-bit integer: decimals are truncated, integer text is parsed' },
  {
    type: 'long',
    description: '64-bit integer: decimals are truncated, integer text is parsed, dates become milliseconds',
  },
  { type: 'double', description: 'Floating point number; numeric text is parsed' },
  { type: 'decimal', description: 'Decimal128, exact decimals; numeric text is parsed' },
  { type: 'bool', description: 'Numbers: 0 is false; any text, even "false", is true' },
  {
    type: 'date',
    description: 'ISO text ("2024-03-15", "2024-03-15T10:00:00Z"), milliseconds (long, double), ObjectId',
  },
  { type: 'objectId', description: '24 hexadecimal characters' },
];

/** What a conversion sends and counts. */
export interface ConvertPlan {
  /** The values to convert; counted again after the write, the values that could not be converted. */
  readonly filter: JsonDocument;
  readonly update: readonly Json[];
  /** The values to convert without the array guard. */
  readonly reached: JsonDocument;
}

/** The type given, when it is one of {@link CONVERT_TYPES}. */
export function convertTypeOf(value: unknown): ConvertType | undefined {
  return CONVERT_TYPES.find((each) => each.type === value)?.type;
}

/** The values of `field` not yet of `type`: null and arrays are left as they are. */
function notYet(field: string, type: ConvertType): JsonDocument {
  return { [field]: { $exists: true, $not: { $type: [type, 'null', 'array'] } } };
}

/** Feature: field.convert-plan — the pipeline update converting `field` to `type` with `$convert`. */
export function convertPlan(filter: JsonDocument, field: string, type: ConvertType): ConvertPlan {
  const input = `$${field}`;
  return {
    filter: and(filter, ...noArrayParents(field), notYet(field, type)),
    update: [{ $set: { [field]: { $convert: { input, to: type, onError: input, onNull: input } } } }],
    reached: and(filter, notYet(field, type)),
  };
}
