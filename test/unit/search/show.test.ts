import { describe, expect, it } from 'vitest';
import { runAfter, startRun } from '../../../src/features/search/model/run';
import { scanEnded, scanFailed, scanned, startScan } from '../../../src/features/search/scan';
import { plan, searchStart, view, type SearchPageState } from '../../../src/features/search/show';
import { wanted } from '../../../src/features/search/text';
import {
  firstInput,
  type CollectionScan,
  type SearchCollection,
  type SearchInput,
  type SearchRun,
} from '../../../src/features/search/types';
import type { JsonObject } from '../../../src/features/query/mongosh/ejson';
import type { AppStep, Context } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { cache, contextOn, int, local, planOf } from './context';

function appSteps(context: Context, args: Readonly<Record<string, unknown>> = {}): readonly AppStep[] {
  return planOf(plan(context, { args })).steps as readonly AppStep[];
}

function withSearchTab(context: Context): Context {
  const shows = { kind: 'page', connection: local.id, page: 'search', title: 'Search documents' } as const;
  const tab = { id: tabId('t1'), shows, lastActive: 0, loaded: true };
  return { ...context, state: { ...context.state, tabs: { ...context.state.tabs, tabs: [tab], active: tab.id } } };
}

const mario = { wanted: wanted('mario', 'contains', false), fieldNames: false };

function collection(name: string, view = false): SearchCollection {
  return { database: 'shop', collection: name, view, ...(view ? {} : { estimate: 50_000 }) };
}

function documents(count: number, text: string, from = 0): readonly JsonObject[] {
  return Array.from({ length: count }, (_, index) => ({ _id: int(from + index), name: text }));
}

function searched(
  input: SearchInput,
  scans: readonly CollectionScan[],
  ending: 'done' | 'stopped' | 'running',
): SearchRun {
  const listed = runAfter(startRun(1, input, 1000), {
    kind: 'listed',
    search: 1,
    collections: scans.map((scan) => scan.collection),
    at: 1100,
  });
  const filled = scans.reduce(
    (run, scan, index) => runAfter(run, { kind: 'scanned', search: 1, index, scan, at: 3400 }),
    listed,
  );
  return ending === 'stopped' ? runAfter(filled, { kind: 'stopped', search: 1, at: 3400 }) : filled;
}

function page(input: SearchInput, run?: SearchRun): SearchPageState {
  return {
    connection: local.id,
    input,
    databases: ['crm', 'shop'],
    collections: [
      { name: 'orders', view: false },
      { name: 'recent', view: true },
    ],
    readOnly: false,
    ...(run === undefined ? {} : { run }),
    folded: [],
  };
}

const typed: SearchInput = { ...firstInput, text: 'mario', database: 'shop' };

describe('search.show', () => {
  it('opens one tab titled Search documents in the group of Local from the rail, and makes it active again after', () => {
    const [open] = appSteps(contextOn('search.show'));
    expect(open).toMatchObject({
      action: 'tab.open',
      args: { shows: { kind: 'page', connection: local.id, page: 'search', title: 'Search documents' } },
    });
    const [again, ...rest] = appSteps(withSearchTab(contextOn('search.show')));
    expect(again).toMatchObject({ action: 'tab.activate', args: { tab: 't1' } });
    expect(rest).toEqual([]);
  });

  it('sets In to shop with only orders ticked from the collection orders, and starts no search', () => {
    const target = { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' } as const;
    const steps = appSteps(contextOn('search.show', target));
    expect(steps.map((step) => step.action)).toEqual(['tab.open', 'search.set-scope']);
    expect(steps[1]?.args).toEqual({ connection: local.id, database: 'shop', collections: ['orders'] });
  });

  it('only changes the scope of the open page from another database while a search runs', () => {
    const target = { kind: 'database', connection: local.id, database: 'crm' } as const;
    const steps = appSteps(withSearchTab(contextOn('search.show', target)));
    expect(steps.map((step) => step.action)).toEqual(['tab.activate', 'search.set-scope']);
    expect(steps[1]?.args).toEqual({ connection: local.id, database: 'crm', collections: [] });
  });

  it('opens nothing on a Redis connection', () => {
    expect(appSteps(contextOn('search.show', { kind: 'connection', connection: cache.id }))).toEqual([]);
  });

  it('says Type something to search. for a blank text, and the engine error for ( [ in Regex mode, reading nothing', () => {
    expect(searchStart({ ...firstInput, text: '   ' })).toEqual({
      kind: 'error',
      message: 'Type something to search.',
    });
    expect(searchStart({ ...firstInput, text: '([', mode: 'regex' })).toEqual({
      kind: 'error',
      message: 'Invalid regular expression: /([/: Unterminated character class',
    });
    expect(view({ ...page(firstInput), error: 'Type something to search.' }).error).toBe('Type something to search.');
  });

  it('lists 50 of 62 matching documents, then +12 more documents — Open in collection', () => {
    const scan = scanEnded(scanned(startScan(collection('orders')), documents(62, 'mario'), mario), 0);
    const [group] = view(page(typed, searched(typed, [scan], 'done'))).groups;
    expect(group?.items).toHaveLength(50);
    expect(group?.head).toEqual(['62 documents']);
    expect(group?.more?.text).toBe('+12 more documents — ');
    expect(group?.more?.open).toMatchObject({ label: 'Open in collection', element: 'search.open-in-collection@list' });
    expect(group?.open?.tooltip).toBe('Open shop.orders filtered on the matching documents (up to 1,000)');
  });

  it('lists 5 lines of a document with 8 matches and +3 more matches in this document', () => {
    const document: JsonObject = {
      _id: int(1),
      ...Object.fromEntries('abcdefgh'.split('').map((name) => [name, 'mario'] as const)),
    };
    const scan = scanEnded(scanned(startScan(collection('orders')), [document], mario), 0);
    const [item] = view(page(typed, searched(typed, [scan], 'done'))).groups[0]?.items ?? [];
    expect(item?.lines).toHaveLength(5);
    expect(item?.moreMatches).toBe('+3 more matches in this document');
  });

  it('says 14 collections (5 read) and stopped after Esc, and keeps the groups found', () => {
    const scans = Array.from({ length: 14 }, (_, index) => {
      const each = startScan(collection(`c${String(index).padStart(2, '0')}`));
      return index < 5 ? scanEnded(scanned(each, documents(10, index === 0 ? 'mario' : 'x'), mario), 0) : each;
    });
    const shown = view(page(typed, searched(typed, scans, 'stopped')));
    expect(shown.optionsRow.summary).toBe(
      '14 collections (5 read) · 50 documents read · 10 documents found in 1 collection · 2.4 s · stopped',
    );
    expect(shown.groups.map((group) => group.name)).toEqual(['c00']);
    expect(shown.searchRow.button).toEqual({ label: 'Search', stops: false });
  });

  it('says No document contains “zzz”. at the end, and in the collections read when stopped', () => {
    const input = { ...typed, text: 'zzz' };
    const none = scanEnded(scanned(startScan(collection('orders')), documents(3, 'x'), mario), 0);
    expect(view(page(input, searched(input, [none], 'done'))).empty).toBe('No document contains “zzz”.');
    const reading = scanned(startScan(collection('orders')), documents(3, 'x'), mario);
    expect(view(page(input, searched(input, [reading], 'stopped'))).empty).toBe(
      'No document contains “zzz” in the collections read.',
    );
  });

  it('counts a collection that cannot be read as 1 not readable and shows its message in its group', () => {
    const denied = scanFailed(
      startScan(collection('secret')),
      'not authorized on shop to execute command { find: "secret" }',
    );
    const found = scanEnded(scanned(startScan(collection('orders')), documents(2, 'mario'), mario), 0);
    const shown = view(page(typed, searched(typed, [denied, found], 'done')));
    expect(shown.optionsRow.summary).toContain('1 not readable');
    expect(shown.groups[0]?.head).toEqual(['not authorized on shop to execute command { find: "secret" }']);
    expect(shown.groups[1]?.head).toEqual(['2 documents']);
  });

  it('disables Views while collections are ticked', () => {
    expect(view(page({ ...typed, collections: ['recent'] })).optionsRow.views.enabled).toBe(false);
    expect(view(page(typed)).optionsRow.views.enabled).toBe(true);
  });

  it('shows a document in the inspector island on selection, and opens it read-only from a view', () => {
    const scan = scanEnded(scanned(startScan(collection('recent', true)), documents(1, 'mario'), mario), 0);
    const [item] = view(page(typed, searched(typed, [scan], 'done'))).groups[0]?.items ?? [];
    expect(item?.inspect).toEqual({
      feature: 'document.inspect',
      args: { connection: local.id, database: 'shop', collection: 'recent', id: int(0), view: true },
    });
    expect(item?.open.args).toMatchObject({ readOnly: true });
    expect(item?.copy.element).toBe('search.copy-id@list');
    expect(item?.menu.open.element).toBe('search.open-in-collection@item-menu');
  });

  it('shows reading… with the documents read and the estimated count while a collection is read', () => {
    const reading = scanned(
      startScan(collection('orders')),
      [...documents(1199, 'x'), { _id: int(9999), name: 'mario' }],
      mario,
    );
    const shown = view(page(typed, searched(typed, [reading], 'running')));
    expect(shown.groups[0]?.head).toEqual(['1 document', 'reading… 1,200 / 50,000']);
    expect(shown.searchRow.button).toEqual({ label: 'Stop', stops: true });
  });

  it('fills the page and starts the search for open_search, and refuses a regular expression that is not valid', () => {
    const context = contextOn('search.show', undefined, 'mcp');
    const steps = appSteps(context, { search: { text: 'mario', database: 'shop' } });
    expect(steps.map((step) => step.action)).toEqual(['tab.open', 'search.start']);
    expect(steps[1]?.args).toMatchObject({ input: { text: 'mario', database: 'shop', mode: 'contains' } });
    expect(plan(context, { args: { search: { text: '([', regex: true } } })).toEqual({
      kind: 'refuse',
      code: 'search.show/text',
      message: 'Invalid regular expression: /([/: Unterminated character class',
    });
  });

  it('shows the text, the mode, the scope and the options of a restored tab, with no results', () => {
    const restored = view(page({ ...typed, mode: 'regex', matchCase: true, read: 1000 }));
    expect(restored.searchRow.text).toEqual({
      value: 'mario',
      placeholder: '^mario|rossi$  or  /^ma/i  —  Enter searches',
      focused: true,
    });
    expect(restored.scopeRow.in.value).toBe('shop');
    expect(restored.optionsRow.read.value).toBe(1000);
    expect(restored.optionsRow.summary).toBeUndefined();
    expect(restored.groups).toEqual([]);
  });

  it('lists Every database and the databases in In, and All collections and the collections of shop', () => {
    const shown = view(page(typed)).scopeRow;
    expect(shown.in.choices.map((choice) => choice.label)).toEqual(['Every database', 'crm', 'shop']);
    expect(shown.collections?.choices.map((choice) => `${choice.label}${choice.ticked ? ' ✓' : ''}`)).toEqual([
      'All collections ✓',
      'orders',
      'recent',
    ]);
    expect(view(page(firstInput)).scopeRow.collections).toBeUndefined();
  });

  it('names the groups database.collection when In is Every database', () => {
    const input = { ...firstInput, text: 'mario' };
    const scan = scanEnded(scanned(startScan(collection('orders')), documents(1, 'mario'), mario), 0);
    expect(view(page(input, searched(input, [scan], 'done'))).groups[0]?.name).toBe('shop.orders');
  });
});
