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
import { nextPart, withPart, type StringLoad, type StringPart } from '../../../features/value/read-string';
import { rowName, type ValueRow } from '../../../features/value/show';
import { fieldExpiryVersion, hexOf, isValueType, type ValueType } from '../../../features/value/types';
import type { Json } from '../../../shared/engine-request';
import { currentAppState } from '../../state/store';
import { loadGroups } from './value-groups-reads';
import { firstArgs, readOrdered } from './value-pages';
import { failedRead as failed, isCurrent, readValue as read } from './value-start';
import { changeValue, valueTabOf, type ValueTab, type ValueWhere } from './value-store';

export { keyTarget, messageOf } from './value-start';

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
  const state = valueTabOf(tab);
  if (state !== undefined) {
    await readOrdered(tab, run, firstArgs(state));
  }
}

/**
 * The tab once `TYPE` and the count are known: what was read before is dropped, the selection is kept (it holds names,
 * and only the rows read again are drawn selected) except in a list, whose indexes may name other elements now; a type
 * that changed drops the sort, the formats, the order and range of the pages and the section, and keeps the old type
 * for the notice; the text typed stays only when the refresh is not the tab's own.
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
    problem: _problem,
    beyond: _beyond,
    inRange: _inRange,
    sort,
    ...rest
  } = state;
  const changed = state.type !== '' && state.type !== type;
  const { first: _first, groups: _groups, ...kept } = rest;
  return {
    ...(changed ? { ...kept, typed: {}, section: 'entries' as const } : rest),
    type,
    count,
    status: 'ready',
    rows: [],
    loadingMore: false,
    ownRefresh: false,
    ...(type === 'list' ? { selection: { keys: new Set<string>() } } : {}),
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
  if (type === 'stream' && valueTabOf(tab)?.section === 'groups') {
    await loadGroups(tab);
  }
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
