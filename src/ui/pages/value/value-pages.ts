/**
 * The pages of a list, a sorted set and a stream in a key tab (`value.read-list`, `value.read-sorted-set`,
 * `value.read-stream`): the first page with the end, order and range the toolbar set, **Load more**, and the reads the
 * toolbar starts (**From the head**, **From the tail**, **Go to index**, **Lowest first**, **Highest first**, **Min
 * score**, **Max score**, **Newest first**, **Oldest first**, **From**, **To**). What a read refuses is said under the
 * toolbar, and the rows read stay. A sorted set whose server refuses `REV` or `BYSCORE` is read again with the older
 * commands, and stays so.
 */
import type { ListPage } from '../../../features/value/read-list';
import type { SortedSetPage } from '../../../features/value/read-sorted-set';
import { nextPage as nextStreamPage, type StreamArgs, type StreamPage } from '../../../features/value/read-stream';
import { rowName, type ValueRow } from '../../../features/value/show';
import { fieldsOf, hexOf, isValueType, type ValueType } from '../../../features/value/types';
import type { Json } from '../../../shared/engine-request';
import { failedRead, isCurrent, readValue } from './value-start';
import { changeValue, valueTabOf, type ValueTab } from './value-store';

/** The Read of each type read by pages, and the arguments of its first page by default. */
const orderedReads: Readonly<Partial<Record<ValueType, { readonly feature: string; readonly first: Json }>>> = {
  list: { feature: 'value.read-list', first: { form: 'full', from: 'head', index: '0', page: 0 } },
  zset: {
    feature: 'value.read-sorted-set',
    first: { form: 'full', order: 'lowest', min: '', max: '', page: 0, older: false },
  },
  stream: { feature: 'value.read-stream', first: { form: 'full', order: 'newest', from: '', to: '' } },
};

/** Whether the tab's type is read by pages: a list, a sorted set, a stream. */
export function isReadByPages(type: string): boolean {
  return isValueType(type) && orderedReads[type] !== undefined;
}

/** The arguments of the first page of the tab's type: those the toolbar set, or the type's default. */
export function firstArgs(tab: ValueTab): Json {
  const reading = isValueType(tab.type) ? orderedReads[tab.type] : undefined;
  return { ...fieldsOf(reading?.first ?? null), ...fieldsOf(tab.first ?? null) } as Json;
}

/** One argument of the first page, as text: `from`, `order`, `min`… */
export function firstArg(tab: ValueTab, name: string): string {
  const value = fieldsOf(firstArgs(tab))[name];
  return typeof value === 'string' ? value : '';
}

/** A page as rows, with the arguments of the next one and the notes of a list and of a sorted set. */
interface OrderedPage {
  readonly rows: readonly ValueRow[];
  readonly next?: Json;
  readonly beyond?: string;
  readonly inRange?: number;
}

function nextOf(asked: Json, more: boolean): Json | undefined {
  const fields = fieldsOf(asked);
  return more ? { ...fields, page: (typeof fields['page'] === 'number' ? fields['page'] : 0) + 1 } : undefined;
}

function listPage(asked: Json, page: ListPage): OrderedPage {
  const rows = page.elements.map((each) => ({ cells: { Index: String(each.index), Element: each.element } }));
  const next = nextOf(asked, page.more);
  return {
    rows,
    ...(next === undefined ? {} : { next }),
    ...(page.beyond === undefined ? {} : { beyond: page.beyond }),
  };
}

function sortedSetPage(asked: Json, page: SortedSetPage): OrderedPage {
  const rows = page.members.map((each) => ({
    cells: { Rank: each.rank === undefined ? '' : String(each.rank), Member: each.member, Score: each.score },
  }));
  const next = nextOf(asked, page.more);
  return {
    rows,
    ...(next === undefined ? {} : { next }),
    ...(page.inRange === undefined ? {} : { inRange: page.inRange }),
  };
}

function orderedPage(type: ValueType, asked: Json, result: unknown): OrderedPage {
  if (type === 'list') {
    return listPage(asked, result as ListPage);
  }
  if (type === 'zset') {
    return sortedSetPage(asked, result as SortedSetPage);
  }
  const page = result as StreamPage;
  const next = nextStreamPage(asked as unknown as StreamArgs, page) as Json | undefined;
  return { rows: page.entries.map((entry) => ({ cells: {}, entry })), ...(next === undefined ? {} : { next }) };
}

/** How a page is added: after the rows read (the first page, **Load more**), or in their place (the toolbar). */
type Adding = 'append' | 'replace';

/** The tab with a page added: its rows, where the next starts, its notes, and the first row selected when asked. */
function withPage(now: ValueTab, page: OrderedPage, adding: Adding): ValueTab {
  const { next: _next, beyond: _beyond, inRange: _inRange, problem: _problem, selectFirst, ...rest } = now;
  const before = adding === 'replace' ? [] : now.rows;
  const first = page.rows[0];
  const selects = selectFirst === true && before.length === 0 && first !== undefined;
  const name = first === undefined ? '' : hexOf(rowName(first));
  // A list's selection names indexes, which are other elements once the list is read from elsewhere.
  const dropped = adding === 'replace' && now.type === 'list';
  return {
    ...rest,
    rows: [...before, ...page.rows],
    loadingMore: false,
    ...(page.next === undefined ? {} : { next: page.next }),
    ...(page.beyond === undefined ? {} : { beyond: page.beyond }),
    ...(page.inRange === undefined ? {} : { inRange: page.inRange }),
    ...(dropped ? { selection: { keys: new Set<string>() } } : {}),
    ...(selects ? { selection: { keys: new Set([name]), anchor: name } } : {}),
  };
}

/** A read of a sorted set the server refused: read again with `ZREVRANGE`, `ZRANGEBYSCORE` and `ZREVRANGEBYSCORE`. */
function olderRead(type: ValueType, asked: Json): Json | undefined {
  return type === 'zset' && fieldsOf(asked)['older'] !== true ? { ...fieldsOf(asked), older: true } : undefined;
}

/** Reads the page `asked` names and adds it; what is refused is said under the toolbar and the rows stay. */
async function readPage(tab: string, run: number, asked: Json, adding: Adding): Promise<void> {
  const state = valueTabOf(tab);
  const type = state?.type ?? '';
  const reading = isValueType(type) ? orderedReads[type] : undefined;
  if (state === undefined || reading === undefined || !isValueType(type)) {
    return;
  }
  const result = await readValue(state.where, reading.feature, asked);
  if (!isCurrent(tab, run)) {
    return;
  }
  if (result.kind === 'refused') {
    changeValue(tab, (now) => (now.run === run ? { ...now, problem: result.message, loadingMore: false } : now));
    return;
  }
  const older = result.kind === 'read' ? undefined : olderRead(type, asked);
  if (older !== undefined) {
    // The pages after this one, and those a refresh reads, are read the older way too.
    changeValue(tab, (now) => ({ ...now, first: { ...fieldsOf(firstArgs(now)), older: true } }));
    await readPage(tab, run, older, adding);
    return;
  }
  if (result.kind !== 'read') {
    failedRead(tab, run, result);
    return;
  }
  const page = orderedPage(type, asked, result.result);
  const first = adding === 'replace' ? { first: asked } : {};
  changeValue(tab, (now) => (now.run === run ? { ...withPage(now, page, adding), ...first } : now));
}

/** Reads the page of a list, a sorted set or a stream that `asked` names, and adds its rows. */
export async function readOrdered(tab: string, run: number, asked: Json): Promise<void> {
  await readPage(tab, run, asked, 'append');
}

/**
 * A read the toolbar starts: the first page again with the arguments changed (`{ from: 'tail' }`, `{ min, max }`…),
 * which a refresh then reads again. The rows read until then stay while it is refused.
 */
export async function readFromToolbar(tab: string, change: Readonly<Record<string, Json>>): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined || !isReadByPages(state.type)) {
    return;
  }
  const { after: _after, ...fields } = fieldsOf(firstArgs(state));
  const asked = { ...fields, ...change, ...(state.type === 'stream' ? {} : { page: 0 }) } as Json;
  const run = state.run + 1;
  changeValue(tab, (now) => ({ ...now, run, loadingMore: true }));
  await readPage(tab, run, asked, 'replace');
}
