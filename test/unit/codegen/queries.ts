/**
 * The two queries the worked examples of the languages use, on `shop.orders` (codegen.md, `codegen.source`), as
 * `query.parse` gives them: canonical Extended JSON.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { CodeQuery, CodeTarget } from '../../../src/features/codegen/source';

/** An Int32 of canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** A date of canonical Extended JSON. */
export function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

/** The filter of the find example. */
export const findFilter = {
  status: 'paid',
  customer: { $oid: '65f1c0de9a1b2c3d4e5f6a7b' },
  createdAt: { $gte: date('2024-01-01T00:00:00.000Z') },
};

/** The find example. */
export const findExample: Extract<CodeQuery, { kind: 'find' }> = {
  kind: 'find',
  filter: findFilter,
  projection: { total: int(1), status: int(1) },
  sort: { createdAt: int(-1) },
};

/** The stages of the pipeline example. */
export const pipelineStages: readonly Json[] = [
  { $match: { status: 'paid' } },
  { $group: { _id: '$customer', total: { $sum: '$total' }, orders: { $sum: int(1) } } },
  { $sort: { total: int(-1) } },
  { $limit: int(10) },
];

/** The pipeline example. */
export const pipelineExample: CodeQuery = { kind: 'aggregate', pipeline: pipelineStages };

/** Nothing typed. */
export const emptyFind: CodeQuery = { kind: 'find', filter: {} };

/** The lines of the query, on `shop.orders`. */
export const lines: CodeTarget = { database: 'shop', collection: 'orders', program: false };

/** A full program, on `shop.orders`. */
export const program: CodeTarget = { ...lines, program: true };

/** A filter with a value of every BSON type the tables of `codegen.types` list. */
export const everyType = {
  id: { $oid: '65f1c0de9a1b2c3d4e5f6a7b' },
  at: date('2024-03-01T10:20:30.123Z'),
  long: { $numberLong: '9007199254740993' },
  decimal: { $numberDecimal: '0.10' },
  int: int(42),
  double: { $numberDouble: '2.5' },
  big: { $numberDouble: '3000000000' },
  regex: { $regularExpression: { pattern: '^ma', options: 'i' } },
  uuid: { $binary: { base64: 'OyQRAeK7QlWMr0E2xWapYg==', subType: '04' } },
  binary: { $binary: { base64: 'AQID', subType: '00' } },
  timestamp: { $timestamp: { t: 1700000000, i: 1 } },
  min: { $minKey: 1 },
  max: { $maxKey: 1 },
  none: null,
  yes: true,
  nan: { $numberDouble: 'NaN' },
  list: [int(1), 'a'],
  empty: {},
};
