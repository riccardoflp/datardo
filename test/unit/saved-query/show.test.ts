import { describe, expect, it } from 'vitest';
import { queryLine, timeText, view, type ShowState } from '../../../src/features/saved-query/show';
import type { CollectionQueries } from '../../../src/features/saved-query/list';
import { find, inFolder, listOf, mine, now, pipeline } from './harness';

function shown(queries: CollectionQueries | undefined, search = ''): ReturnType<typeof view> {
  const state: ShowState = {
    where: { connection: 'c-local', database: 'shop', collection: 'orders' },
    ...(queries === undefined ? {} : { queries }),
    search,
    now,
  };
  return view(state);
}

describe('saved-query.show', () => {
  it('shows "Queries you run on this collection appear here." on a collection where nothing was run or saved', () => {
    const list = shown(listOf());
    expect(list.message).toBe('Queries you run on this collection appear here.');
    expect(list.saved).toBeUndefined();
    expect(list.recent).toBeUndefined();
    expect(list.search.label).toBe('Search queries');
    expect(list.saveCurrent).toEqual({ label: 'Save current', element: 'saved-query.save@list' });
  });

  it('keeps the items whose name, description, filter, sort, projection or pipeline text holds the search, ignoring case', () => {
    const queries = listOf(
      [
        mine('Paid'),
        mine('Big', find('{}'), { description: 'Over ONE hundred' }),
        inFolder('Stages', 's.json', pipeline(['$group', '{ _id: "$city" }'])),
      ],
      [{ query: find('{ a: 1 }', '{ createdAt: -1 }'), at: now }],
    );
    expect(shown(queries, 'one').saved?.items.map((each) => each.name)).toEqual(['Big']);
    expect(shown(queries, 'CITY').saved?.items.map((each) => each.name)).toEqual(['Stages']);
    expect(shown(queries, 'createdat').recent?.items).toHaveLength(1);
    expect(shown(queries, 'createdat').saved).toBeUndefined();
    expect(shown(queries, 'nothing like it').message).toBe('No queries match your search.');
  });

  it('writes a find on one line with its sort and its projection', () => {
    expect(queryLine(find('{ status: "paid" }', '{ createdAt: -1 }'))).toBe(
      '{ status: "paid" } sort { createdAt: -1 }',
    );
    expect(queryLine(find('', '', '{ total: 1 }'))).toBe('{} project { total: 1 }');
    expect(queryLine(find('{\n  a:   1\n}'))).toBe('{ a: 1 }');
  });

  it('writes a pipeline of $match, a disabled $sort and $group as aggregate $match → $group', () => {
    expect(queryLine(pipeline(['$match', '{}'], ['$sort', '{ a: 1 }', false], ['$group', '{ _id: 1 }']))).toBe(
      'aggregate $match → $group',
    );
    expect(queryLine(pipeline(['$match', '{}', false]))).toBe('aggregate empty pipeline');
  });

  it('shows just now, 5m ago, 3h ago, 2d ago, then the date', () => {
    expect(timeText(now - 30_000, now)).toBe('just now');
    expect(timeText(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeText(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(timeText(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(timeText(now - 30 * 86_400_000, now)).toMatch(/^2026-10-1[89]$/u);
  });

  it('tags a query in the folder Folder with no time, and one for me Me with its time', () => {
    const list = shown(
      listOf([mine('Paid'), inFolder('Shared', 'shared.json', find('{}'), { connection: 'Production' })]),
    );
    const [me, folder] = list.saved?.items ?? [];
    expect(me).toMatchObject({
      name: 'Paid',
      tag: { label: 'Me', tooltip: ['Saved for you, in Datardo'] },
      time: '1m ago',
    });
    expect(folder).toMatchObject({
      name: 'Shared',
      tag: {
        label: 'Folder',
        tooltip: ['In the folder: shop/orders/shared.json', 'Only on the connection Production'],
      },
    });
    expect(folder?.time).toBeUndefined();
  });

  it('runs the query of an item (saved-query.run), with the item as it is listed', () => {
    const list = shown(listOf([mine('Paid')], [{ query: find('{ a: 1 }'), at: now }]));
    expect(list.saved?.items[0]?.run).toMatchObject({
      element: 'saved-query.run@list',
      feature: 'saved-query.run',
      args: {
        connection: 'c-local',
        database: 'shop',
        collection: 'orders',
        name: 'Paid',
        query: { filter: '{ status: "paid" }' },
      },
    });
    expect(list.recent?.items[0]?.run).toMatchObject({
      element: 'saved-query.run@list',
      args: { query: { filter: '{ a: 1 }' } },
    });
  });

  it('gives the … menu Rename…, Move to the folder, Pin and Delete for me, and Move to my queries and Reveal file in the folder', () => {
    const list = shown(listOf([mine('A'), inFolder('B', 'b.json')]));
    expect(list.saved?.items[0]?.menu.map((each) => each.label)).toEqual([
      'Rename…',
      'Move to the folder',
      'Pin',
      'Delete',
    ]);
    expect(list.saved?.items[1]?.menu.map((each) => each.label)).toEqual([
      'Rename…',
      'Move to my queries',
      'Reveal file',
      'Pin',
      'Delete',
    ]);
    expect(list.saved?.items[0]?.menu[1]?.tooltip).toBe('Save it as a file in the folder, shared through git');
    expect(list.saved?.items[1]?.menu[1]?.tooltip).toBe('Keep it only for you and delete its file from the folder');
  });

  it('shows Saved only with saved queries and Recent only with recent ones', () => {
    const onlyRecent = shown(listOf([], [{ query: find('{ a: 1 }'), at: now }]));
    expect(onlyRecent.saved).toBeUndefined();
    expect(onlyRecent.recent).toMatchObject({
      title: 'Recent',
      clear: { label: 'Clear', element: 'saved-query.clear-recent@list' },
    });
    expect(onlyRecent.recent?.items[0]).toMatchObject({
      save: { label: 'Save with a name', element: 'saved-query.save@list' },
      remove: { label: 'Remove from history', element: 'saved-query.remove-recent@list' },
    });
    expect(shown(listOf([mine('Paid')])).recent).toBeUndefined();
  });

  it('shows the list loading until the queries are read', () => {
    expect(shown(undefined).loading).toBe(true);
  });
});
