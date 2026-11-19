/**
 * Feature: value.read-hash — reads the fields of a hash a page at a time with `HSCAN`, all of them or those whose name
 * matches the filter, and on Redis 7.4 or later the expiry of each field with `HPTTL`. A run of calls stops at cursor
 * 0, at 200 fields found or after 100 calls; **Load more** starts the next run. The scan of a set works the same way.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import {
  bytesOf,
  compactItems,
  engineRead,
  fieldsOf,
  filterPattern,
  hexOf,
  keyOf,
  pageSize,
  replyBytes,
  replyItems,
  replyNumber,
  replyText,
  textOf,
  type Word,
} from './types';

/** A run of a scan stops after 100 calls (Datardo's choice), about 20,000 items looked at. */
export const mostCalls = 100;

/** What a scan of a hash or a set is started with. */
export interface ScanArgs {
  readonly form: 'full' | 'compact';
  readonly cursor: string;
  /** What is typed in the filter; empty for none. */
  readonly filter: string;
}

/** The arguments of a scan, from JSON. */
export function scanArgs(args: Json): ScanArgs {
  const fields = fieldsOf(args);
  return {
    form: fields['form'] === 'compact' ? 'compact' : 'full',
    cursor: textOf(fields['cursor'], '0'),
    filter: textOf(fields['filter']),
  };
}

/** `<command> <key> <cursor> MATCH <pattern> COUNT 200`; `MATCH` only with a filter; `<command> <key> 0 COUNT 20` compact. */
export function scanCommand(command: 'HSCAN' | 'SSCAN', key: Uint8Array, asked: ScanArgs): readonly Word[] {
  if (asked.form === 'compact') {
    return [command, key, '0', 'COUNT', String(compactItems)];
  }
  const pattern = filterPattern(asked.filter);
  const match: readonly Word[] = pattern === undefined ? [] : ['MATCH', pattern];
  return [command, key, asked.cursor, ...match, 'COUNT', String(pageSize)];
}

/** `HPTTL <key> FIELDS <n> <field> …`, for the **Expiry** column. */
export function expiryCommand(key: Uint8Array, fields: readonly Uint8Array[]): readonly Word[] {
  return ['HPTTL', key, 'FIELDS', String(fields.length), ...fields];
}

function expiryFields(args: Json): readonly Uint8Array[] | undefined {
  const asked = fieldsOf(args)['expiryOf'];
  return Array.isArray(asked)
    ? (asked as readonly unknown[]).map((each) => bytesOf(each) ?? new Uint8Array())
    : undefined;
}

/** Feature: value.read-hash — one `HSCAN`; or, with `args.expiryOf` (the fields of a reply), their `HPTTL`. */
export function request(context: Context, args: Json): ReadRequest {
  const at = keyOf(context);
  const fields = expiryFields(args);
  return engineRead(at, [
    fields === undefined ? scanCommand('HSCAN', at.key, scanArgs(args)) : expiryCommand(at.key, fields),
  ]);
}

/** A field of a hash and its value, as bytes. */
export interface HashField {
  readonly field: Uint8Array;
  readonly value: Uint8Array;
}

/** What one call of a scan gives: the next cursor and the items. */
export interface ScanPage<T> {
  readonly cursor: string;
  readonly items: readonly T[];
}

/** The cursor and the flat list of a reply of `HSCAN` or `SSCAN`. */
export function scanReply(reply: unknown): { readonly cursor: string; readonly words: readonly Uint8Array[] } {
  const [cursor, list] = replyItems(reply);
  const words = replyItems(list).map((each) => replyBytes(each) ?? new Uint8Array());
  return { cursor: replyText(cursor) ?? '0', words };
}

/** Feature: value.read-hash — the fields of an `HSCAN`, or, for `HPTTL`, each field's milliseconds left (`undefined` for none). */
export function parse(
  replies: readonly unknown[],
  args: Json = null,
): ScanPage<HashField> | { readonly expiries: readonly (number | undefined)[] } {
  if (expiryFields(args) !== undefined) {
    return {
      expiries: replyItems(replies[0]).map((each) => {
        const left = replyNumber(each);
        return left === undefined || left < 0 ? undefined : left;
      }),
    };
  }
  const { cursor, words } = scanReply(replies[0]);
  const items: HashField[] = [];
  for (let index = 0; index + 1 < words.length; index += 2) {
    items.push({ field: words[index] ?? new Uint8Array(), value: words[index + 1] ?? new Uint8Array() });
  }
  return { cursor, items };
}

/** A scan in progress: the items found, the cursor, and the calls and items of the current run. */
export interface ScanState<T> {
  readonly items: readonly T[];
  readonly cursor: string;
  readonly calls: number;
  readonly foundInRun: number;
  /** `whole`: the cursor came back 0; `paused`: 200 items or 100 calls, **Load more** goes on; absent while it runs. */
  readonly ended?: 'whole' | 'paused';
}

/** No call made yet. */
export function scanStart<T>(): ScanState<T> {
  return { items: [], cursor: '0', calls: 0, foundInRun: 0 };
}

/** The scan after one more reply: items returned twice are listed once, by `nameOf`. */
export function afterScanPage<T>(
  state: ScanState<T>,
  page: ScanPage<T>,
  nameOf: (item: T) => Uint8Array,
): ScanState<T> {
  const seen = new Set(state.items.map((item) => hexOf(nameOf(item))));
  const fresh = page.items.filter((item) => {
    const name = hexOf(nameOf(item));
    const isFresh = !seen.has(name);
    seen.add(name);
    return isFresh;
  });
  const base = {
    items: [...state.items, ...fresh],
    cursor: page.cursor,
    calls: state.calls + 1,
    foundInRun: state.foundInRun + fresh.length,
  };
  if (page.cursor === '0') {
    return { ...base, ended: 'whole' };
  }
  return base.foundInRun >= pageSize || base.calls >= mostCalls ? { ...base, ended: 'paused' } : base;
}

/** **Load more**: a new run from the cursor where the last one paused. */
export function nextRun<T>(state: ScanState<T>): ScanState<T> {
  return state.ended === 'paused' ? { items: state.items, cursor: state.cursor, calls: 0, foundInRun: 0 } : state;
}

/** The arguments of the next call of a scan, or undefined when the run has ended. */
export function nextScanArgs<T>(state: ScanState<T>, filter: string): ScanArgs | undefined {
  return state.ended === undefined ? { form: 'full', cursor: state.cursor, filter } : undefined;
}
