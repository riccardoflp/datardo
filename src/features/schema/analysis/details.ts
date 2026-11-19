/**
 * The details of a type that `schema.analyze` adds when asked (by `transfer.generate`, to make documents that look
 * like those analyzed): every distinct value when they are few, the lengths of strings, the decimals of numbers,
 * whether dates are days, the lengths of arrays, and an example of the other types.
 */
import type { Json } from '../../../shared/engine-request';
import { isJsonDocument, valueTypes, type TypeDetails, type ValueCount } from '../types';
import type { Seen, TypeTally } from './tally';

/** At most this many distinct values are given whole. */
export const mostPooled = 200;

/** The characters of JSON the values given whole may take. */
export const mostPooledCharacters = 50_000;

/** The most frequent lengths of arrays given. */
export const mostLengths = 20;

/** The characters of base64 kept of an example binary value (a multiple of 4). */
export const exampleCharacters = 256;

/** The values counted, the most frequent first and, with the same count, the first seen first. */
export function byCount(values: Iterable<Seen>): readonly ValueCount[] {
  return [...values].sort((a, b) => b.count - a.count).map((seen) => ({ value: seen.value, count: seen.count }));
}

function tenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function arrayDetails(tally: TypeTally): TypeDetails {
  const counts = new Map<number, number>();
  for (const length of tally.lengths) {
    counts.set(length, (counts.get(length) ?? 0) + 1);
  }
  const lengths = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, mostLengths)
    .map(([length, count]) => ({ value: { $numberInt: String(length) }, count }));
  return { lengths };
}

/** The first value of another type: a binary value cut, any other kept when it is not long. */
function exampleDetails(example: Json | undefined): TypeDetails {
  const binary = isJsonDocument(example) ? example['$binary'] : undefined;
  if (isJsonDocument(binary) && typeof binary['base64'] === 'string' && binary['base64'].length > exampleCharacters) {
    return { example: { $binary: { ...binary, base64: binary['base64'].slice(0, exampleCharacters) } } };
  }
  return example !== undefined && JSON.stringify(example).length <= 4 * exampleCharacters ? { example } : {};
}

/** The details of one type. */
export function typeDetails(tally: TypeTally): TypeDetails {
  if (tally.type === 'array') {
    return arrayDetails(tally);
  }
  if (!valueTypes.has(tally.type)) {
    return exampleDetails(tally.example);
  }
  const pooled = !tally.more && tally.values.size <= mostPooled ? byCount(tally.values.values()) : undefined;
  const values = pooled !== undefined && JSON.stringify(pooled).length <= mostPooledCharacters ? pooled : undefined;
  const { characters } = tally;
  return {
    ...(values === undefined ? {} : { values }),
    ...(characters === undefined
      ? {}
      : {
          characters: {
            smallest: characters.smallest,
            largest: characters.largest,
            average: tenths(characters.sum / tally.count),
          },
        }),
    ...(tally.type === 'double' || tally.type === 'decimal' ? { decimals: tally.decimals } : {}),
    ...(tally.type === 'date' && tally.numbers.length > 0 ? { midnight: tally.midnight } : {}),
  };
}
