/**
 * Feature: explain.raw
 *
 * Everything the server returned, as a tree, in place of the summary: an object is a row with `{`, its fields under it
 * and `}`, an array the same with `[` and `]`; a value is written in mongosh syntax with its type, a Long staying a
 * Long. The fields are in the order of the server, and nothing is left out or cut. The first three levels start
 * unfolded and the deeper ones folded; a click on a row folds or unfolds it, and a folded row reads its size.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue, isTypedValue } from '../aggregate/mongosh/format';
import { bsonTypeOf, type BsonType } from '../schema/types';
import { text } from './text';
import { isJsonDocument } from './types';

/** The levels that start unfolded: the output itself and the two under it. */
export const unfoldedLevels = 3;

/** What the raw output is drawn from: the output kept by `explain.run`, and the rows whose fold the user changed. */
export interface RawState {
  readonly output: Json;
  /** The paths of the rows folded or unfolded by a click, against how they start. */
  readonly toggled: readonly string[];
}

/** One row of the tree. */
export type RawRow =
  | {
      readonly kind: 'open';
      readonly depth: number;
      /** The name of the field, or the index of the item, in its parent; absent for the output itself. */
      readonly key?: string;
      readonly path: string;
      readonly bracket: '{' | '[';
      readonly folded: boolean;
      /** *3 fields* or *2 items*, read while folded. */
      readonly size: string;
      /** The toggled paths a click on the row leads to. */
      readonly next: readonly string[];
    }
  | { readonly kind: 'close'; readonly depth: number; readonly bracket: '}' | ']' }
  | {
      readonly kind: 'value';
      readonly depth: number;
      readonly key?: string;
      /** In mongosh syntax: `NumberLong(1200)`, `ISODate("2024-03-01T10:20:30.123Z")`. */
      readonly text: string;
      /** The type the value is colored by. */
      readonly type: BsonType;
    };

/** What `explain.raw` shows. */
export interface RawView {
  readonly rows: readonly RawRow[];
}

/** The path of a row: the keys from the output to it, as JSON so that no key can be mistaken for another. */
export function rawPath(keys: readonly string[]): string {
  return JSON.stringify(keys);
}

/** Whether a value is drawn as a row that opens: a document or a list that is not empty and not a typed value. */
function isOpening(value: Json): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return isJsonDocument(value) && Object.keys(value).length > 0 && !isTypedValue(value);
}

/** Where a row is: its keys from the output, and the name it has in its parent. */
interface Place {
  readonly keys: readonly string[];
  readonly key?: string;
}

function rowsOf(value: Json, place: Place, toggled: readonly string[]): readonly RawRow[] {
  const depth = place.keys.length;
  const named = place.key === undefined ? {} : { key: place.key };
  if (!isOpening(value)) {
    return [
      { kind: 'value', depth, ...named, text: formattedValue(value, { kind: 'one-line' }), type: bsonTypeOf(value) },
    ];
  }
  const path = rawPath(place.keys);
  const isToggled = toggled.includes(path);
  const folded = depth >= unfoldedLevels !== isToggled;
  const next = isToggled ? toggled.filter((each) => each !== path) : [...toggled, path];
  const entries: readonly (readonly [string, Json])[] = Array.isArray(value)
    ? (value as readonly Json[]).map((item, index) => [String(index), item])
    : Object.entries(value as { readonly [key: string]: Json });
  const list = Array.isArray(value);
  const size = list ? text.rawSize.items(entries.length) : text.rawSize.fields(entries.length);
  const open: RawRow = { kind: 'open', depth, ...named, path, bracket: list ? '[' : '{', folded, size, next };
  if (folded) {
    return [open];
  }
  const inner = entries.flatMap(([key, item]) => rowsOf(item, { keys: [...place.keys, key], key }, toggled));
  return [open, ...inner, { kind: 'close', depth, bracket: list ? ']' : '}' }];
}

/** Feature: explain.raw — the rows of the raw output. */
export function view(state: RawState): RawView {
  return { rows: rowsOf(state.output, { keys: [] }, state.toggled) };
}
