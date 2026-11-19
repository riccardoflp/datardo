/**
 * How many fields differ between two documents whose fields are all known, counted as `history.diff` counts its rows
 * (M27): sub-documents field by field whatever their order, arrays of the same length element by element, anything
 * else as a whole, every BSON type counting. Until `history.diff` is written, `document.restore-version` counts with
 * this.
 */
import type { Json } from '../../../shared/engine-request';
import { isDocumentValue } from './values';

/** The value written with the fields of every sub-document in one order, so that the order does not count. */
function orderless(value: Json): Json {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(orderless);
  }
  if (!isDocumentValue(value)) {
    return value;
  }
  const keys = Object.keys(value).sort();
  return Object.fromEntries(keys.map((key) => [key, orderless(value[key] ?? null)]));
}

function isSameWhatever(first: Json, second: Json): boolean {
  return JSON.stringify(orderless(first)) === JSON.stringify(orderless(second));
}

function differences(first: Json | undefined, second: Json | undefined): number {
  if (first === undefined || second === undefined) {
    return first === second ? 0 : 1;
  }
  if (isDocumentValue(first) && isDocumentValue(second)) {
    const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
    return [...keys].reduce(
      (sum, key) =>
        sum +
        differences(
          Object.hasOwn(first, key) ? first[key] : undefined,
          Object.hasOwn(second, key) ? second[key] : undefined,
        ),
      0,
    );
  }
  if (Array.isArray(first) && Array.isArray(second) && first.length === second.length) {
    const items = second as readonly Json[];
    return (first as readonly Json[]).reduce((sum: number, item, index) => sum + differences(item, items[index]), 0);
  }
  return isSameWhatever(first, second) ? 0 : 1;
}

/** The number of fields that differ between two documents; 0 when they differ only in the order of their fields. */
export function differingFields(before: Json, after: Json): number {
  return differences(before, after);
}
