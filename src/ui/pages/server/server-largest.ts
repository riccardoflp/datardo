/**
 * `server.largest-keys` in the window: the calls of a search one after the other (`SCAN`, then `MEMORY USAGE` of the
 * keys it returned, and `TYPE` of the ranking at the end), each a Read the runner carries out, until the search ends,
 * **Cancel** stops it after the call in flight, or a newer search starts. Also what the inspector island reads of the
 * key selected in its table (`key.inspect:read`), and the search Go to asks for (**Find largest keys**).
 */
import type { InspectedKey } from '../../../features/key/inspect';
import {
  afterMeasure,
  afterScan,
  afterTypes,
  callArgs,
  cancelSearch,
  databaseWithMostKeys,
  examineMore,
  largestKeysAsk,
  largestKeysAskOf,
  nextCall,
  startSearch,
  type LargestKeysReply,
  type LargestKeysSearch,
} from '../../../features/server/largest-keys';
import { bytesOfHex, valueOf } from '../../../features/server/types';
import { unavailableSentence } from '../../../features/server/unavailable';
import type { AppState } from '../../../shared/state';
import { messageOf, startOn } from './server-reads';
import { changeServerTab, serverTabOf, type ServerTab } from './server-store';

/** The search after a reply of one of its calls. */
function searchAfter(search: LargestKeysSearch, reply: LargestKeysReply, now: number): LargestKeysSearch {
  switch (reply.step) {
    case 'scan':
      return afterScan(search, reply.page, now);
    case 'measure':
      return afterMeasure(search, reply.measured, now);
    case 'type':
      return afterTypes(search, reply.types);
  }
}

/** Makes the calls of a run one after the other, until it ends, it is cancelled or a newer run starts. */
async function continueSearch(tab: string, run: number): Promise<void> {
  for (;;) {
    const state = serverTabOf(tab);
    const search = state?.largest.search;
    const call = search === undefined ? undefined : nextCall(search);
    if (state === undefined || search === undefined || call === undefined || state.largest.run !== run) {
      return;
    }
    const result = await startOn(
      state,
      'server.largest-keys',
      'toolbar',
      callArgs(call, state.connection, search.database),
    );
    const now = Date.now();
    changeServerTab(tab, (before) => {
      const current = before.largest.search;
      if (before.largest.run !== run || current === undefined) {
        return before;
      }
      const after =
        result.kind === 'read'
          ? searchAfter(current, result.result as LargestKeysReply, now)
          : call.step === 'type'
            ? afterTypes(current, [])
            : {
                ...current,
                ended: 'unavailable' as const,
                unavailable: unavailableSentence('', messageOf(result) ?? ''),
              };
      return { ...before, largest: { ...before.largest, search: after } };
    });
  }
}

/** The database the search is on: the one chosen in the menu, else the one with the most keys. */
function databaseOf(state: ServerTab): number {
  const databases = valueOf(state.keyspace)?.databases ?? [];
  return state.largest.chosen ?? databaseWithMostKeys(databases) ?? 0;
}

/** Starts a run of the search, with the search the tab asks for. */
function startRun(tab: string, change: (state: ServerTab) => LargestKeysSearch | undefined): void {
  let run = 0;
  changeServerTab(tab, (state) => {
    const search = change(state);
    run = state.largest.run + 1;
    if (search === undefined) {
      return state;
    }
    const { largest: _unselected, ...selected } = state.selected;
    return { ...state, selected, largest: { ...state.largest, run, search } };
  });
  void continueSearch(tab, run);
}

/** **Find largest keys**: a new search of the database chosen, from cursor 0. */
export function findLargestKeys(tab: string): void {
  startRun(tab, (state) => {
    const database = databaseOf(state);
    const keys = valueOf(state.keyspace)?.databases.find((each) => each.database === database)?.keys;
    return startSearch(database, keys, Date.now());
  });
}

/** **Examine 100,000 more**: another run from the cursor the last stopped at, with the ranking so far. */
export function examineMoreKeys(tab: string): void {
  startRun(tab, (state) =>
    state.largest.search === undefined ? undefined : examineMore(state.largest.search, Date.now()),
  );
}

/** **Cancel**: the search stops after the call in flight; the ranking so far stays. */
export function cancelLargestKeys(tab: string): void {
  changeServerTab(tab, (state) => {
    const search = state.largest.search;
    return search === undefined
      ? state
      : { ...state, largest: { ...state.largest, run: state.largest.run + 1, search: cancelSearch(search) } };
  });
}

/** The **Database** menu: the database of the next search. */
export function chooseDatabase(tab: string, database: number): void {
  changeServerTab(tab, (state) => ({ ...state, largest: { ...state.largest, chosen: database } }));
}

/**
 * Follows **Find largest keys** of Go to, once, when it was asked for this tab's connection since the page was first
 * shown (with some slack, since Go to asks it just before the tab opens), and the databases are known.
 */
export function followAsk(tab: string, app: AppState): void {
  const state = serverTabOf(tab);
  const ask = largestKeysAskOf(app.runner.remembered[largestKeysAsk]);
  if (state === undefined || ask === undefined || ask.connection !== state.connection) {
    return;
  }
  const fresh = ask.asked >= state.createdAt - 10_000 && ask.asked !== state.largest.handledAsk;
  if (!fresh || state.keyspace === undefined) {
    return;
  }
  changeServerTab(tab, (now) => ({ ...now, largest: { ...now.largest, handledAsk: ask.asked } }));
  if (state.largest.search?.ended === undefined && state.largest.search !== undefined) {
    return;
  }
  findLargestKeys(tab);
}

/**
 * Reads what the inspector island shows of the key selected in the table of the largest keys. What it showed stays
 * until the read comes; a read of a key no longer selected is left.
 */
export async function readLargestKey(tab: string, keyHex: string): Promise<void> {
  const state = serverTabOf(tab);
  const search = state?.largest.search;
  if (state === undefined || search === undefined) {
    return;
  }
  const result = await startOn(state, 'key.inspect:read', 'table', {
    connection: state.connection,
    database: search.database,
    key: keyHex,
  });
  const readAt = Date.now();
  const key = result.kind === 'read' ? (result.result as InspectedKey | 'gone') : undefined;
  const read =
    key === undefined
      ? { kind: 'failed' as const, error: messageOf(result) ?? '' }
      : key === 'gone'
        ? { kind: 'gone' as const }
        : { kind: 'loaded' as const, key, readAt };
  changeServerTab(tab, (now) =>
    now.selected.largest === keyHex ? { ...now, largest: { ...now.largest, inspected: { key: keyHex, read } } } : now,
  );
}

/** The name of a key of the table, as bytes. */
export function keyOfHex(hex: string): Uint8Array {
  return bytesOfHex(hex);
}
