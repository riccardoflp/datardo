/**
 * What the comparison page does through the bridge (`compare.show`): the three lists of the right side
 * (`connection.connect`, `tree.list-databases`, `tree.list-collections`), the comparison (`compare.read`, then
 * `compare.read-details`), its **Cancel** (`runner.cancel`), **⇄**, the document of a selected row, the writes
 * (`compare.copy-document`, `compare.make-like`), after which the page compares again, and what the tab keeps
 * (`compare.show` with `{ keep }`).
 */
import { choicesOf, keptOf } from '../../../features/compare/page/memory';
import type { DetailEntry } from '../../../features/compare/read-details';
import type { ComparePageState } from '../../../features/compare/show';
import { text } from '../../../features/compare/text';
import {
  idKey,
  sideInfoIn,
  sideJson,
  sideTarget,
  type CompareResult,
  type Difference,
  type Side,
  type SideInfo,
} from '../../../features/compare/types';
import { listDatabasesArgs } from '../../../features/tree/list-databases';
import type { DatabaseContents, MongoDatabase } from '../../../features/tree/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId, type Place } from '../../../shared/ids';
import { connectionState } from '../../../shared/state/connections';
import type { TabShows } from '../../../shared/state/tabs';
import type { Target } from '../../../shared/target';
import { groupThousands } from '../../../shared/text-units';
import { currentAppState } from '../../state/store';
import { changeCompareTab, changePage, compareTabOf, setCompareTab, type CompareTab } from './compare-store';
import { askCancel, watchWork } from './compare-work';

/** What a choice of the right side leads to, once it is made: the comparison the first time, or always after **⇄**. */
type Then = 'first-time' | 'compare';

/** What the right side is chosen with: those of the tab's memory, or the collection that was on the left. */
interface Wanted {
  readonly database?: string;
  readonly collection?: string;
  readonly then: Then;
}

function start(feature: string, target: Target, place: Place, args: Json): Promise<IntentResult> {
  return window.datardo.start({ feature: featureId(feature), target, place, args });
}

function messageOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
}

function running(page: ComparePageState): boolean {
  return page.progress !== undefined;
}

/** The page after a change of the right side: once a comparison has run, its result is cleared. */
function cleared(tab: CompareTab, page: ComparePageState): ComparePageState {
  if (!tab.compared) {
    return page;
  }
  const { result: _result, selected: _selected, chip: _chip, error: _error, ...rest } = page;
  return rest;
}

/** Keeps the sides and the options with the tab, and its title (`compare.keep`), when they changed. */
function keep(tab: string): void {
  const page = compareTabOf(tab)?.page;
  if (page === undefined) {
    return;
  }
  const right = page.right === undefined ? {} : { right: page.right };
  const choices = choicesOf({ left: page.left, ...right, options: page.options });
  const kept = JSON.stringify(choices);
  if (compareTabOf(tab)?.kept === kept) {
    return;
  }
  changeCompareTab(tab, (each) => ({ ...each, kept }));
  void start('compare.show', { kind: 'app' }, 'form', { keep: { tab, choices } });
}

/** Opens the page of a tab: from what the tab keeps, comparing again when it kept a right side. */
export function openComparison(tab: string, shows: TabShows, choices: Readonly<Record<string, string>> | undefined) {
  const kept = compareTabOf(tab) === undefined ? keptOf(shows, choices) : undefined;
  if (kept === undefined) {
    return;
  }
  const app = currentAppState();
  setCompareTab(tab, {
    page: {
      left: sideInfoIn(app.connections, kept.left),
      choosing: { saved: app.connections.saved },
      options: kept.options,
    },
    differences: [],
    compared: false,
    run: 0,
    kept: JSON.stringify(choicesOf(kept)),
  });
  void (async () => {
    await readLeftKind(tab, kept.left.view);
    const right = kept.right;
    await (right === undefined
      ? chooseConnection(tab, kept.left.connection, { then: 'first-time' })
      : chooseConnection(tab, right.connection, {
          database: right.database,
          collection: right.collection,
          then: 'compare',
        }));
  })();
}

/** Whether the left collection is a view, as its database lists it; its writes are then disabled. */
async function readLeftKind(tab: string, known: boolean): Promise<void> {
  const left = compareTabOf(tab)?.page.left;
  if (left === undefined || known) {
    return;
  }
  const where = { connection: left.connection, database: left.database };
  const listed = await start(
    'tree.list-collections',
    { kind: 'connection', connection: left.connection },
    'form',
    where,
  );
  const entries = listed.kind === 'read' ? (listed.result as DatabaseContents).entries : [];
  if (entries.some((entry) => entry.name === left.collection && entry.kind === 'view')) {
    const app = currentAppState();
    changePage(tab, (page) => ({ ...page, left: sideInfoIn(app.connections, { ...page.left, view: true }) }));
  }
}

function stillChoosing(tab: string, connection: ConnectionId, database?: string): boolean {
  const choosing = compareTabOf(tab)?.page.choosing;
  return choosing?.connection === connection && (database === undefined || choosing.database === database);
}

/** **Connection**: connects it when it is not connected, then lists its databases and chooses one by itself. */
export async function chooseConnection(tab: string, connection: ConnectionId, wanted: Wanted): Promise<void> {
  const app = currentAppState();
  changeCompareTab(tab, (each) => {
    const { right: _right, ...page } = cleared(each, each.page);
    return { ...each, page: { ...page, choosing: { saved: app.connections.saved, connection } } };
  });
  const name = app.connections.saved.find((each) => each.id === connection)?.name ?? connection;
  const failed = (message: string): void => {
    changePage(tab, (page) => ({
      ...page,
      choosing: { ...page.choosing, error: text.sides.couldNotConnect(name, message) },
    }));
  };
  if (connectionState(app.connections, connection) !== 'connected') {
    const connected = await start('connection.connect', { kind: 'connection', connection }, 'form', null);
    const message = messageOf(connected);
    if (message !== undefined || !stillChoosing(tab, connection)) {
      if (message !== undefined) failed(message);
      return;
    }
  }
  const args = listDatabasesArgs(currentAppState(), connection);
  const listed = await start('tree.list-databases', { kind: 'connection', connection }, 'form', args);
  if (!stillChoosing(tab, connection)) {
    return;
  }
  if (listed.kind !== 'read') {
    failed(messageOf(listed) ?? '');
    return;
  }
  const names = (listed.result as readonly MongoDatabase[]).map((each) => each.name);
  changePage(tab, (page) => ({ ...page, choosing: { ...page.choosing, databases: names } }));
  const left = compareTabOf(tab)?.page.left;
  const database = names.includes(wanted.database ?? '')
    ? wanted.database
    : names.find((each) => each === left?.database);
  if (database !== undefined) {
    await chooseDatabase(tab, database, wanted);
  }
}

/** **Database**: lists its collections and views, and chooses the one with the left collection's name by itself. */
export async function chooseDatabase(tab: string, database: string, wanted: Wanted): Promise<void> {
  const connection = compareTabOf(tab)?.page.choosing.connection;
  if (connection === undefined) {
    return;
  }
  changeCompareTab(tab, (each) => {
    const { right: _right, ...page } = cleared(each, each.page);
    const { collections: _collections, collection: _collection, error: _error, ...choosing } = page.choosing;
    return { ...each, page: { ...page, choosing: { ...choosing, database } } };
  });
  const listed = await start('tree.list-collections', { kind: 'connection', connection }, 'form', {
    connection,
    database,
  });
  if (!stillChoosing(tab, connection, database)) {
    return;
  }
  if (listed.kind !== 'read') {
    changePage(tab, (page) => ({ ...page, error: messageOf(listed) ?? '' }));
    return;
  }
  const collections = (listed.result as DatabaseContents).entries.map((entry) => ({
    name: entry.name,
    view: entry.kind === 'view',
  }));
  changePage(tab, (page) => ({ ...page, choosing: { ...page.choosing, collections } }));
  const page = compareTabOf(tab)?.page;
  const sameDatabase = page?.left.connection === connection && page.left.database === database;
  const usable = collections.filter(
    (each) => !each.name.startsWith('system.') && !(sameDatabase && each.name === page.left.collection),
  );
  const wantedName = usable.find((each) => each.name === wanted.collection)?.name;
  const collection = wantedName ?? usable.find((each) => each.name === page?.left.collection)?.name;
  if (collection !== undefined) {
    chooseCollection(tab, collection, wanted.then);
  }
}

/** **Collection**: the right side; the first comparison starts by itself, later ones wait for **Compare**. */
export function chooseCollection(tab: string, name: string, then: Then = 'first-time'): void {
  const before = compareTabOf(tab);
  const { connection, database, collections } = before?.page.choosing ?? {};
  const entry = collections?.find((each) => each.name === name);
  if (before === undefined || connection === undefined || database === undefined || entry === undefined) {
    return;
  }
  const app = currentAppState();
  const right = sideInfoIn(app.connections, { connection, database, collection: name, view: entry.view });
  changeCompareTab(tab, (each) => {
    const page = cleared(each, each.page);
    return { ...each, page: { ...page, right, choosing: { ...page.choosing, collection: name } } };
  });
  keep(tab);
  if (then === 'compare' || !before.compared) {
    void compare(tab);
  }
}

/** The options changed; a change of a check box after a comparison compares again. */
export function changeOptions(tab: string, change: Partial<ComparePageState['options']>, again: boolean): void {
  changePage(tab, (page) => ({ ...page, options: { ...page.options, ...change } }));
  const now = compareTabOf(tab);
  if (again && now !== undefined && now.compared && !running(now.page) && now.page.right !== undefined) {
    void compare(tab);
  }
}

/** The differences the list shows: the first 300 of each kind, which `compare.read-details` reads again. */
function shownDifferences(differences: readonly Difference[]): readonly Difference[] {
  const seen = { different: 0, 'only-left': 0, 'only-right': 0 };
  return differences.filter((difference) => {
    seen[difference.kind] += 1;
    return seen[difference.kind] <= 300;
  });
}

function sidesJson(left: SideInfo, right: SideInfo): { readonly left: Json; readonly right: Json } {
  return { left: sideJson(left), right: sideJson(right) };
}

/** The end of a comparison: its message or its error; the result before it stays. */
function ended(tab: string, run: number, line: { readonly message?: string; readonly error?: string }): void {
  changeCompareTab(tab, (each) => {
    if (each.run !== run) {
      return each;
    }
    const { progress: _progress, message: _message, error: _error, ...page } = each.page;
    const { work: _work, ...rest } = each;
    return { ...rest, page: { ...page, ...line } };
  });
}

function resultError(result: IntentResult): string | undefined {
  if (result.kind === 'read') {
    const read = result.result as { readonly kind?: unknown; readonly message?: unknown } | null;
    return read?.kind === 'refuse' && typeof read.message === 'string' ? read.message : undefined;
  }
  return messageOf(result) ?? (result.kind === 'cancelled' ? undefined : '');
}

/** **Compare**, `Enter` in **Filter** or **Ignore**: reads both sides and pairs them, then reads what differs. */
export async function compare(tab: string): Promise<void> {
  const before = compareTabOf(tab);
  const right = before?.page.right;
  if (before === undefined || right === undefined || running(before.page)) {
    return;
  }
  const run = before.run + 1;
  const { message: _message, error: _error, ...page } = before.page;
  const swapping = before.page.message === text.sides.swapping ? { message: text.sides.swapping } : {};
  setCompareTab(tab, {
    ...before,
    run,
    compared: true,
    page: { ...page, ...swapping, progress: text.read.readingLeft('0') },
  });
  keep(tab);
  const startedAt = Date.now();
  const { left, options } = before.page;
  const stop = watchWork(tab, run, 'compare.read');
  const result = await start('compare.read', sideTarget(left), 'form', {
    ...sidesJson(left, right),
    options: { ...options },
  });
  stop();
  if (compareTabOf(tab)?.run !== run) {
    return;
  }
  const error = resultError(result);
  if (result.kind === 'cancelled' || compareTabOf(tab)?.cancelled === run) {
    ended(tab, run, { message: text.states.cancelled });
  } else if (error !== undefined) {
    ended(tab, run, { error });
  } else {
    await readDetails(tab, run, result.kind === 'read' ? (result.result as CompareResult) : undefined, startedAt);
  }
}

async function readDetails(tab: string, run: number, found: CompareResult | undefined, startedAt: number) {
  const now = compareTabOf(tab);
  const right = now?.page.right;
  if (now === undefined || right === undefined || found === undefined) {
    return;
  }
  const shown = shownDifferences(found.differences);
  const count = (side: Side): number =>
    shown.filter((each) => each.kind !== (side === 'left' ? 'only-right' : 'only-left')).length;
  const progress = text.read.details(groupThousands(count('left')), groupThousands(count('right')));
  changeCompareTab(tab, (each) => ({ ...each, page: { ...each.page, progress }, found }));
  const stop = watchWork(tab, run, 'compare.read-details');
  const { left, options } = now.page;
  const args = {
    mode: 'details',
    ...sidesJson(left, right),
    options: { ...options },
    differences: shown.map((each) => ({ ...each })),
  };
  const result = await start('compare.read-details', sideTarget(left), 'form', args);
  stop();
  if (compareTabOf(tab)?.run !== run) {
    return;
  }
  if (result.kind !== 'read' || compareTabOf(tab)?.cancelled === run) {
    ended(
      tab,
      run,
      result.kind === 'cancelled' || result.kind === 'read'
        ? { message: text.states.cancelled }
        : { error: messageOf(result) ?? '' },
    );
    return;
  }
  const entries = result.result as readonly DetailEntry[];
  changeCompareTab(tab, (each) => {
    const { progress: _progress, message: _message, selected, ...page } = each.page;
    const kept =
      selected !== undefined && entries.some((entry) => idKey(entry.id) === idKey(selected.id)) ? { selected } : {};
    const { work: _work, ...rest } = each;
    return {
      ...rest,
      differences: found.differences,
      page: {
        ...page,
        ...kept,
        result: { counts: found.counts, entries, milliseconds: Date.now() - startedAt, filtered: found.filtered },
      },
    };
  });
}

/** **Cancel**: stops the comparison; the result before it stays. */
export function cancelComparison(tab: string): void {
  const now = compareTabOf(tab);
  if (now !== undefined && running(now.page)) {
    askCancel(tab, now.run);
    ended(tab, now.run, { message: text.states.cancelled });
  }
}

/** **⇄**: exchanges the two collections, then compares again. */
export function swapSides(tab: string): void {
  const now = compareTabOf(tab);
  const right = now?.page.right;
  if (now === undefined || right === undefined || running(now.page)) {
    return;
  }
  const { left } = now.page;
  changeCompareTab(tab, (each) => ({
    ...each,
    page: { ...each.page, left: right, right: left, message: text.sides.swapping },
  }));
  void chooseConnection(tab, left.connection, {
    database: left.database,
    collection: left.collection,
    then: 'compare',
  });
}
