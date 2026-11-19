/**
 * The reads of a collection tab, started through the bridge and kept in the window's memory of the tab: the page of
 * documents (`query.run`, and `table.refresh` which reads the query last run again), its count (`query.count`) and the
 * fields of its sample (`query.field-hints`). Every read is a Read feature run by the runner; the window keeps what it
 * gives, and a read older than the last one run is never shown.
 */
import type { Count, CountedKind } from '../../features/query/count';
import type { FieldHint } from '../../features/query/field-hints';
import { keptQuery, keptText } from '../../features/query/restore';
import { cancelledLine, checkedQuery, failureLine, type RunResult } from '../../features/query/run';
import type { ErrorLine, PageSize, QueryTexts } from '../../features/query/types';
import { selectionAfter } from '../../features/table/selection';
import { setting } from '../../features/settings/read';
import type { IntentResult } from '../../shared/bridge';
import type { Json } from '../../shared/engine-request';
import { featureId, type ConnectionId, type TabId, type WorkId } from '../../shared/ids';
import { currentAppState } from '../state/store';
import { changeCollection, collectionOf, textsRan, type CollectionTab } from './collection-store';

/** The collection a tab shows, and the tab. */
export interface CollectionRef {
  readonly tab: TabId;
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
  /** A collection keeps a count of itself; a view and a time series collection do not. */
  readonly kind: CountedKind;
}

/** How a query is run: from the bar, again as last run (paging, refresh), with a page and a page size. */
export interface RunHow {
  readonly texts: 'bar' | 'ran';
  readonly page?: number;
  readonly pageSize?: PageSize;
  /** A refresh keeps the selection of the documents still in the page and counts again. */
  readonly refresh?: boolean;
  /** Counts again; a page turn does not. */
  readonly count: boolean;
}

/** The run of each tab: a newer run makes an older one's result be dropped. */
const runs = new Map<TabId, number>();
/** The work of the runner each tab's running query is, for **Cancel**. */
const works = new Map<TabId, WorkId>();
/** The collection each open collection tab shows, for what starts a read without its page (the status line). */
const refs = new Map<TabId, CollectionRef>();

/** Remembers the collection a tab shows. */
export function registerCollection(ref: CollectionRef): void {
  refs.set(ref.tab, ref);
}

/** The collection a tab shows, once its page was drawn. */
export function collectionRefOf(tab: TabId): CollectionRef | undefined {
  return refs.get(tab);
}

function start(
  ref: CollectionRef,
  feature: string,
  args: Json,
  place?: 'query-bar' | 'paging' | 'status-line',
): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(place === undefined ? {} : { place }),
    args,
  });
}

function timeLimitMs(): number {
  return setting(currentAppState().settings, 'datardo.query.timeLimitSeconds') * 1000;
}

/** The query refused before anything is sent: the error line and the fields outlined. */
function refused(ref: CollectionRef, texts: QueryTexts, now: number): boolean {
  const checked = checkedQuery(texts, now);
  if (checked.ok) {
    return false;
  }
  changeCollection(ref.tab, (before) => ({
    ...before,
    query: { ...before.query, invalid: checked.invalid, error: { message: checked.message, runAgain: false } },
  }));
  return true;
}

function workIds(): ReadonlySet<WorkId> {
  return new Set(currentAppState().runner.work.map((work) => work.id));
}

/** Finds the work the runner began for this run, among those that were not there before it started. */
function watchWork(ref: CollectionRef, before: ReadonlySet<WorkId>, run: number): void {
  const look = (): void => {
    if (runs.get(ref.tab) !== run) {
      return;
    }
    const work = currentAppState().runner.work.find(
      (each) => (each.feature === 'query.run' || each.feature === 'table.refresh') && !before.has(each.id),
    );
    if (work === undefined) {
      setTimeout(look, 50);
      return;
    }
    works.set(ref.tab, work.id);
  };
  look();
}

/** **Cancel**: stops the query of a tab that is running (`runner.cancel`). */
export function cancelQuery(tab: TabId): void {
  const work = works.get(tab);
  if (work !== undefined) {
    void window.datardo.cancel(work);
  }
}

function errorAfter(result: IntentResult, failure: string | undefined): ErrorLine | undefined {
  if (failure !== undefined) {
    return failureLine({ message: failure }, timeLimitMs());
  }
  switch (result.kind) {
    case 'cancelled':
      return cancelledLine;
    case 'refused':
      return { message: result.message, runAgain: false };
    case 'failed':
      return {
        message: result.message,
        ...(result.details === undefined ? {} : { details: result.details }),
        runAgain: true,
      };
    case 'read':
    case 'done':
      return undefined;
  }
}

function isNotConnected(message: string): boolean {
  return /not connected|no client|connect first/i.test(message);
}

/** The tab after the read of a page: its documents, or the error line with the rows shown before kept. */
function afterRead(before: CollectionTab, result: IntentResult, milliseconds: number, refresh: boolean): CollectionTab {
  const read = result.kind === 'read' ? (result.result as RunResult) : undefined;
  const error = errorAfter(result, read?.failure);
  const base = { ...before, running: false };
  if (read === undefined || read.failure !== undefined) {
    const { error: _gone, ...query } = before.query;
    const notConnected = error !== undefined && isNotConnected(error.message);
    const phase =
      result.kind === 'cancelled' && before.hasRows
        ? { kind: 'shown' as const }
        : { kind: 'failed' as const, notConnected };
    return { ...base, phase, query: error === undefined ? query : { ...query, error } };
  }
  const { error: _cleared, ...query } = before.query;
  const selection = refresh ? selectionAfter(query.selection, { kind: 'refresh' }, read.documents) : query.selection;
  return {
    ...base,
    documents: read.documents,
    hasRows: read.documents.length > 0,
    phase: { kind: 'shown' },
    milliseconds,
    query: { ...query, selection },
  };
}

function runArgs(ref: CollectionRef, collection: CollectionTab): Json {
  const { query } = collection;
  return {
    connection: ref.connection,
    database: ref.database,
    collection: ref.collection,
    texts: { ...textsRan(collection) },
    page: query.page,
    pageSize: query.pageSize,
    at: collection.ranAt,
    tab: ref.tab,
    keep: keptText(keptQuery(query)),
  };
}

/** The tab as the run begins: the query that runs, its page, the error line emptied, the rows dimmed. */
function beginning(before: CollectionTab, how: RunHow, texts: QueryTexts, now: number): CollectionTab {
  const checked = checkedQuery(texts, now);
  const skip = checked.ok ? checked.query.skip : 0;
  const limit = checked.ok ? checked.query.limit : undefined;
  const sameSelection = how.refresh === true || how.texts === 'ran';
  const query = {
    ...before.query,
    ran: texts,
    page: how.page ?? before.query.page,
    pageSize: how.pageSize ?? before.query.pageSize,
    invalid: [],
    selection: sameSelection && how.page === undefined ? before.query.selection : { keys: [] },
  };
  return {
    ...before,
    started: true,
    query,
    phase: before.hasRows ? { kind: 'running' } : { kind: 'loading' },
    ranAt: how.texts === 'bar' || how.refresh === true ? now : before.ranAt,
    ranSkip: skip,
    ...(limit === undefined ? { ranLimit: undefined } : { ranLimit: limit }),
    running: true,
    ...(how.count ? { count: { kind: 'pending' } } : {}),
  } as CollectionTab;
}

/**
 * `query.run`: runs the query of a tab, from the bar or as last run, for a page; or refuses it on the error line. The
 * count follows when asked; a newer run of the tab cancels this one and its result is dropped.
 */
export async function runQuery(ref: CollectionRef, how: RunHow): Promise<void> {
  const now = Date.now();
  const before = collectionOf(ref.tab);
  const texts = how.texts === 'bar' ? before.query.texts : textsRan(before);
  if (refused(ref, texts, now)) {
    return;
  }
  if (before.running) {
    cancelQuery(ref.tab);
  }
  const run = (runs.get(ref.tab) ?? 0) + 1;
  runs.set(ref.tab, run);
  works.delete(ref.tab);
  changeCollection(ref.tab, (tab) => beginning(tab, how, texts, now));
  const known = workIds();
  const sent = Date.now();
  const pending = start(ref, how.refresh === true ? 'table.refresh' : 'query.run', runArgs(ref, collectionOf(ref.tab)));
  watchWork(ref, known, run);
  const result = await pending;
  if (runs.get(ref.tab) !== run) {
    return;
  }
  works.delete(ref.tab);
  changeCollection(ref.tab, (tab) => afterRead(tab, result, Date.now() - sent, how.refresh === true));
  await afterRun(ref, how, result);
}

async function afterRun(ref: CollectionRef, how: RunHow, result: IntentResult): Promise<void> {
  const read = result.kind === 'read' ? (result.result as RunResult) : undefined;
  if (read === undefined || read.failure !== undefined) {
    if (how.count) {
      changeCollection(ref.tab, (tab) => ({ ...tab, count: { kind: 'failed' } }));
    }
    return;
  }
  if (how.count) {
    await countQuery(ref, 'with-query');
  }
  await showLastPage(ref);
}

/** A page past the end of the result, because documents were deleted meanwhile, shows the last page that has some. */
async function showLastPage(ref: CollectionRef): Promise<void> {
  const tab = collectionOf(ref.tab);
  if (tab.documents.length > 0 || tab.query.page <= 1 || tab.count.kind !== 'counted') {
    return;
  }
  const total = Math.max(0, tab.count.count - tab.ranSkip);
  const shown = tab.ranLimit === undefined ? total : Math.min(total, tab.ranLimit);
  const last = Math.max(1, Math.ceil(shown / tab.query.pageSize));
  if (last < tab.query.page) {
    await runQuery(ref, { texts: 'ran', page: last, count: false });
  }
}

/** How a count is asked: beside a query, or exactly with a click on an estimate or on `?`. */
export type CountHow = 'with-query' | 'exact';

/** `query.count`: the total of the filter last run; a failure shows `?`, and a click that fails says why. */
export async function countQuery(
  ref: CollectionRef,
  how: CountHow,
  place: 'status-line' | 'paging' = 'paging',
): Promise<void> {
  const tab = collectionOf(ref.tab);
  const run = runs.get(ref.tab);
  const args = {
    connection: ref.connection,
    database: ref.database,
    collection: ref.collection,
    filter: textsRan(tab).filter,
    at: tab.ranAt,
    kind: ref.kind,
    exact: how === 'exact',
  };
  changeCollection(ref.tab, (before) => ({ ...before, count: { kind: 'pending' } }));
  const result = await start(ref, 'query.count', args, how === 'exact' ? place : undefined);
  if (runs.get(ref.tab) !== run) {
    return;
  }
  const counted = result.kind === 'read' ? (result.result as Count) : undefined;
  if (counted === undefined || 'failure' in counted) {
    const why =
      counted !== undefined && 'failure' in counted ? counted.failure : errorAfter(result, undefined)?.message;
    changeCollection(ref.tab, (before) => ({
      ...before,
      count: { kind: 'failed' },
      ...(how === 'exact' && why !== undefined
        ? { query: { ...before.query, error: { message: why, details: why, runAgain: false } } }
        : {}),
    }));
    return;
  }
  changeCollection(ref.tab, (before) => ({
    ...before,
    count: { kind: 'counted', count: counted.count, estimated: counted.estimated },
  }));
}

/** A click on the total of a tab, on the status line or the paging row: counts it exactly. */
export function countTab(tab: TabId, place: 'status-line' | 'paging'): void {
  const ref = refs.get(tab);
  if (ref !== undefined) {
    void countQuery(ref, 'exact', place);
  }
}

/** `query.field-hints`: reads the sample of the collection once, and again after it was marked to read again. */
export async function readHints(ref: CollectionRef): Promise<void> {
  if (collectionOf(ref.tab).hints.kind !== 'unread') {
    return;
  }
  changeCollection(ref.tab, (before) => ({ ...before, hints: { kind: 'reading' } }));
  const result = await start(ref, 'query.field-hints', {
    connection: ref.connection,
    database: ref.database,
    collection: ref.collection,
  });
  const fields = result.kind === 'read' ? (result.result as readonly FieldHint[]) : [];
  changeCollection(ref.tab, (before) => ({ ...before, hints: { kind: 'read', fields } }));
}
