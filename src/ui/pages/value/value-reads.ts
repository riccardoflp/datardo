/**
 * The reads of a key tab's value, started through the bridge as Read features the runner carries out (`value.show`):
 * `value.check`, then `value.count` and the first page of the type, at first and after every refresh of the
 * connection; **Load more**, **Load the whole value** and a filter typed in **Filter fields**. The window keeps what
 * they give; a newer read stops an older one.
 */
import { expiryCellText } from '../../../features/key/format-expiry';
import { isVersionAtLeast } from '../../../features/connection/server-info';
import type { ValueCount } from '../../../features/value/count';
import {
  afterScanPage,
  nextRun,
  nextScanArgs,
  scanStart,
  type HashField,
  type ScanPage,
} from '../../../features/value/read-hash';
import type { ListPage } from '../../../features/value/read-list';
import type { SortedSetPage } from '../../../features/value/read-sorted-set';
import { nextPage as nextStreamPage, type StreamPage } from '../../../features/value/read-stream';
import { nextPart, withPart, type StringLoad, type StringPart } from '../../../features/value/read-string';
import { rowName, type ValueRow } from '../../../features/value/show';
import { fieldExpiryVersion, hexOf, isValueType, type ValueType } from '../../../features/value/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { currentAppState } from '../../state/store';
import { changeValue, valueTabOf, type ValueTab, type ValueWhere } from './value-store';

/** The key of a tab as the target of a feature. */
export function keyTarget(where: ValueWhere): Target {
  return { kind: 'key', connection: where.connection, database: where.database, key: where.key };
}

async function read(where: ValueWhere, feature: string, args: Json): Promise<IntentResult> {
  return window.datardo.start({ feature: featureId(feature), target: keyTarget(where), place: 'toolbar', args });
}

/** The message of a read that did not answer. */
export function messageOf(result: IntentResult): string {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
}

function isCurrent(tab: string, run: number): boolean {
  return valueTabOf(tab)?.run === run;
}

function failed(tab: string, run: number, result: IntentResult): void {
  changeValue(tab, (now) => (now.run === run ? { ...now, status: 'error', error: messageOf(result) } : now));
}

/** Whether the server has an expiry for each field of a hash (`HPTTL`, Redis 7.4). */
function fieldsExpire(where: ValueWhere): boolean {
  const server = currentAppState().connections.live[where.connection]?.server;
  return (
    server?.engine !== 'redis' ||
    server.redisVersion === '' ||
    isVersionAtLeast(server.redisVersion, fieldExpiryVersion)
  );
}

/** Each field's expiry, read with `HPTTL` for the fields of a page, as the **Expiry** column shows it. */
async function withExpiries(where: ValueWhere, rows: readonly ValueRow[]): Promise<readonly ValueRow[]> {
  if (rows.length === 0 || !fieldsExpire(where)) {
    return rows;
  }
  const result = await read(where, 'value.read-hash', { expiryOf: rows.map((row) => ({ hex: hexOf(rowName(row)) })) });
  const expiries =
    result.kind === 'read' ? (result.result as { readonly expiries: readonly (number | undefined)[] }).expiries : [];
  const now = Date.now();
  return rows.map((row, index) => {
    const left = expiries[index];
    return left === undefined ? row : { cells: { ...row.cells, Expiry: expiryCellText(now + left, now) } };
  });
}

/** The scan of a hash or a set: calls one after the other until its run ends, it is stopped or a newer read starts. */
async function continueScan(tab: string, run: number): Promise<void> {
  for (;;) {
    const state = valueTabOf(tab);
    const asked = state?.scan === undefined ? undefined : nextScanArgs(state.scan, state.filter);
    if (state === undefined || state.run !== run || asked === undefined || state.scan === undefined) {
      return;
    }
    const hash = state.type === 'hash';
    const result = await read(state.where, hash ? 'value.read-hash' : 'value.read-set', asked as unknown as Json);
    if (!isCurrent(tab, run)) {
      return;
    }
    if (result.kind !== 'read') {
      failed(tab, run, result);
      return;
    }
    const page = hash ? hashRows(result.result as ScanPage<HashField>) : setRows(result.result as ScanPage<Uint8Array>);
    const rows = hash ? await withExpiries(state.where, page.items) : page.items;
    changeValue(tab, (now) => {
      if (now.run !== run || now.scan === undefined) {
        return now;
      }
      const scan = afterScanPage(now.scan, { cursor: page.cursor, items: rows }, rowName);
      const expiry = rows.some((row) => row.cells['Expiry'] !== undefined);
      return {
        ...now,
        scan,
        rows: scan.items,
        loadingMore: scan.ended === undefined,
        fieldExpiry: now.fieldExpiry || expiry,
      };
    });
  }
}

function hashRows(page: ScanPage<HashField>): ScanPage<ValueRow> {
  return {
    cursor: page.cursor,
    items: page.items.map((item) => ({ cells: { Field: item.field, Value: item.value } })),
  };
}

function setRows(page: ScanPage<Uint8Array>): ScanPage<ValueRow> {
  return { cursor: page.cursor, items: page.items.map((member) => ({ cells: { Member: member } })) };
}

/** A page of a list, a sorted set or a stream, as rows, with the arguments of the next one. */
interface OrderedPage {
  readonly rows: readonly ValueRow[];
  readonly next?: Json;
}

const orderedReads: Readonly<Partial<Record<ValueType, { readonly feature: string; readonly first: Json }>>> = {
  list: { feature: 'value.read-list', first: { form: 'full', from: 'head', index: '0', page: 0 } },
  zset: {
    feature: 'value.read-sorted-set',
    first: { form: 'full', order: 'lowest', min: '', max: '', page: 0, older: false },
  },
  stream: { feature: 'value.read-stream', first: { form: 'full', order: 'newest', from: '', to: '' } },
};

function nextOf(asked: Json, more: boolean): Json | undefined {
  const fields = asked as Readonly<Record<string, Json>>;
  return more ? { ...fields, page: (typeof fields['page'] === 'number' ? fields['page'] : 0) + 1 } : undefined;
}

function orderedPage(type: ValueType, asked: Json, result: unknown): OrderedPage {
  if (type === 'list') {
    const page = result as ListPage;
    const rows = page.elements.map((each) => ({ cells: { Index: String(each.index), Element: each.element } }));
    const next = nextOf(asked, page.more);
    return { rows, ...(next === undefined ? {} : { next }) };
  }
  if (type === 'zset') {
    const page = result as SortedSetPage;
    const rows = page.members.map((each) => ({
      cells: { Rank: each.rank === undefined ? '' : String(each.rank), Member: each.member, Score: each.score },
    }));
    const next = nextOf(asked, page.more);
    return { rows, ...(next === undefined ? {} : { next }) };
  }
  const page = result as StreamPage;
  const next = nextStreamPage(asked as never, page) as Json | undefined;
  return { rows: page.entries.map((entry) => ({ cells: {}, entry })), ...(next === undefined ? {} : { next }) };
}

/** Reads the page of a list, a sorted set or a stream that `asked` names, and adds its rows. */
async function readOrdered(tab: string, run: number, asked: Json): Promise<void> {
  const state = valueTabOf(tab);
  const type = state?.type;
  const reading = type !== undefined && isValueType(type) ? orderedReads[type] : undefined;
  if (state === undefined || reading === undefined || type === undefined || !isValueType(type)) {
    return;
  }
  const result = await read(state.where, reading.feature, asked);
  if (!isCurrent(tab, run)) {
    return;
  }
  if (result.kind !== 'read') {
    failed(tab, run, result);
    return;
  }
  const page = orderedPage(type, asked, result.result);
  changeValue(tab, (now) => {
    if (now.run !== run) {
      return now;
    }
    const { next: _next, ...rest } = now;
    return {
      ...rest,
      rows: [...now.rows, ...page.rows],
      loadingMore: false,
      ...(page.next === undefined ? {} : { next: page.next }),
    };
  });
}

/** Reads a part of a string and adds it; a value whose length changed is read again from the start. */
async function readStringPart(tab: string, run: number, load: StringLoad, asked: Json): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined) {
    return;
  }
  const result = await read(state.where, 'value.read-string', asked);
  if (!isCurrent(tab, run)) {
    return;
  }
  if (result.kind !== 'read') {
    failed(tab, run, result);
    return;
  }
  const part = result.result as StringPart;
  if (part.changed) {
    await readStringPart(
      tab,
      run,
      { length: part.length, loaded: new Uint8Array() },
      {
        form: 'full',
        length: part.length,
      },
    );
    changeValue(tab, (now) => (now.run === run ? { ...now, changedWhileRead: true } : now));
    return;
  }
  changeValue(tab, (now) => (now.run === run ? { ...now, string: withPart(load, part), loadingMore: false } : now));
}

/** The first page of the type, once its count is known. */
async function readFirstPage(tab: string, run: number, type: ValueType, count: number): Promise<void> {
  if (type === 'string') {
    if (count === 0) {
      changeValue(tab, (now) => ({ ...now, string: { length: 0, loaded: new Uint8Array() } }));
      return;
    }
    await readStringPart(tab, run, { length: count, loaded: new Uint8Array() }, { form: 'full', length: count });
    return;
  }
  if (type === 'hash' || type === 'set') {
    changeValue(tab, (now) => ({ ...now, scan: scanStart<ValueRow>(), loadingMore: true }));
    await continueScan(tab, run);
    return;
  }
  const first = orderedReads[type]?.first ?? null;
  await readOrdered(tab, run, first);
}

/**
 * The tab once `TYPE` and the count are known: what was read before is dropped, the selection is kept (it holds names,
 * and only the rows read again are drawn selected); a type that changed drops the sort and the formats and keeps
 * the old type for the notice; the text typed stays only when the refresh is not the tab's own.
 */
function readAgain(state: ValueTab, type: string, count: number, keepsDraft: boolean): ValueTab {
  const {
    draft,
    line,
    editing: _editing,
    string: _string,
    scan: _scan,
    next: _next,
    was: _was,
    found: _found,
    sort,
    ...rest
  } = state;
  const changed = state.type !== '' && state.type !== type;
  return {
    ...rest,
    type,
    count,
    status: 'ready',
    rows: [],
    loadingMore: false,
    ownRefresh: false,
    ...(changed ? { was: state.type, choices: {} } : sort === undefined ? {} : { sort }),
    ...(keepsDraft && draft !== undefined ? { draft } : {}),
    ...(keepsDraft && line !== undefined ? { line } : {}),
  };
}

/** Starts a read of the value from the start: `TYPE`, the count, and the first page with the same filter. */
export async function loadValue(tab: string): Promise<void> {
  let run = 0;
  changeValue(tab, (state) => {
    run = state.run + 1;
    const { error: _error, changedWhileRead: _changed, ...rest } = state;
    return { ...rest, run, status: state.status === 'ready' ? 'ready' : 'loading' };
  });
  const state = valueTabOf(tab);
  if (state === undefined) {
    return;
  }
  const check = await read(state.where, 'value.check', null);
  if (!isCurrent(tab, run)) {
    return;
  }
  if (check.kind !== 'read') {
    failed(tab, run, check);
    return;
  }
  await afterCheck(tab, run, (check.result as { readonly type: string }).type);
}

async function afterCheck(tab: string, run: number, type: string): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined) {
    return;
  }
  const keepsDraft = state.draft !== undefined && !state.ownRefresh;
  if (type === 'none') {
    changeValue(tab, (now) => ({ ...now, status: 'gone', ownRefresh: false }));
    return;
  }
  if (keepsDraft && state.type !== '' && state.type !== type) {
    changeValue(tab, (now) => ({ ...now, status: 'ready', found: type, ownRefresh: false }));
    return;
  }
  if (!isValueType(type)) {
    changeValue(tab, (now) => ({ ...readAgain(now, type, 0, false), rows: [] }));
    return;
  }
  const count = await read(state.where, 'value.count', { type });
  if (!isCurrent(tab, run)) {
    return;
  }
  if (count.kind !== 'read') {
    failed(tab, run, count);
    return;
  }
  const total = (count.result as ValueCount).count;
  changeValue(tab, (now) => readAgain(now, type, total, keepsDraft));
  await readFirstPage(tab, run, type, total);
}

/** **Load more**: the next part of a string, another run of a scan, or the next page of the other types. */
export async function loadMore(tab: string): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined || state.loadingMore) {
    return;
  }
  const run = state.run;
  if (state.type === 'string' && state.string !== undefined) {
    const part = nextPart(state.string);
    if (part !== undefined) {
      changeValue(tab, (now) => ({ ...now, loadingMore: true }));
      await readStringPart(tab, run, state.string, part as unknown as Json);
    }
    return;
  }
  if (state.scan !== undefined) {
    changeValue(tab, (now) => (now.scan === undefined ? now : { ...now, scan: nextRun(now.scan), loadingMore: true }));
    await continueScan(tab, run);
    return;
  }
  if (state.next !== undefined) {
    changeValue(tab, (now) => ({ ...now, loadingMore: true }));
    await readOrdered(tab, run, state.next);
  }
}

/** **Load the whole value**: every part of the string left, one after the other. */
export async function loadWhole(tab: string): Promise<void> {
  for (;;) {
    const state = valueTabOf(tab);
    const load = state?.string;
    if (state === undefined || load === undefined || nextPart(load) === undefined) {
      return;
    }
    const before = load.loaded.length;
    await loadMore(tab);
    if (valueTabOf(tab)?.string?.loaded.length === before || valueTabOf(tab)?.status !== 'ready') {
      return;
    }
  }
}

/** `Enter` in **Filter fields**: what is typed becomes the filter, and the scan starts again from cursor 0. */
export async function applyFilter(tab: string): Promise<void> {
  let run = 0;
  changeValue(tab, (state) => {
    run = state.run + 1;
    return { ...state, run, filter: state.field, rows: [], scan: scanStart<ValueRow>(), loadingMore: true };
  });
  await continueScan(tab, run);
}
