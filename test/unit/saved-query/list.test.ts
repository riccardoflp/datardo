import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  feature as connectionListFeature,
  isFound,
  parse as connectionParse,
  pinOf,
} from '../../../src/features/saved-query/connection-list';
import { listText, parse, request } from '../../../src/features/saved-query/list';
import {
  after as readFolderAfter,
  parse as folderParse,
  request as folderRequest,
  skippedWarning,
} from '../../../src/features/saved-query/read-folder';
import { queryFileText } from '../../../src/features/saved-query/file-format';
import { mineJson, type SavedQuery } from '../../../src/features/saved-query/types';
import { readQueriesFolder } from '../../../src/storage/queries-folder';
import { bare, contextOn, find, local, mine, production, repoFolder } from './harness';

const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'saved-query', 'mongoster-0.8.0');

function fileOf(name: string, more: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, database: 'shop', collection: 'orders', filter: '{}', ...more });
}

function reading(files: readonly { readonly file: string; readonly text: string }[]): unknown {
  return { folder: repoFolder, files: files.map((each) => ({ ...each, size: each.text.length })) };
}

function namesOf(saved: readonly SavedQuery[]): readonly string[] {
  return saved.map((each) => `${each.name} (${each.place === 'me' ? 'me' : each.file})`);
}

const args = { connection: 'c-local', database: 'shop', collection: 'orders' };

describe('saved-query.list', () => {
  it('asks Datardo for the queries of the collection, with the queries folder of the connection', () => {
    expect(request(contextOn('saved-query.list'), args)).toEqual({
      kind: 'app',
      action: 'saved-query.list',
      args: { ...args, queriesFolder: repoFolder },
    });
    expect(request(contextOn('saved-query.list'), { ...args, connection: bare.id })).toMatchObject({
      args: { queriesFolder: null },
    });
  });

  it('puts a 2, A 10, b (the file for Local), b (the other file), b (for me) in this order on Local', () => {
    const folder = reading([
      { file: 'shop/orders/b.json', text: fileOf('b') },
      { file: 'shop/orders/b-2.json', text: fileOf('b', { connection: 'Local' }) },
    ]);
    const result = parse(
      [{ connectionName: 'Local', mine: [mine('b'), mine('A 10'), mine('a 2')].map(mineJson), recent: [], folder }],
      args,
    );
    expect(namesOf(result.saved)).toEqual([
      'a 2 (me)',
      'A 10 (me)',
      'b (shop/orders/b-2.json)',
      'b (shop/orders/b.json)',
      'b (me)',
    ]);
  });

  it('lists a file for "production" on the connection named Production and on no other', () => {
    const folder = reading([{ file: 'shop/orders/p.json', text: fileOf('P', { connection: 'production' }) }]);
    expect(parse([{ connectionName: 'Production', mine: [], recent: [], folder }], args).saved).toHaveLength(1);
    expect(parse([{ connectionName: ' production ', mine: [], recent: [], folder }], args).saved).toHaveLength(1);
    expect(parse([{ connectionName: 'Local', mine: [], recent: [], folder }], args).saved).toHaveLength(0);
  });

  it('lists a file of shop.orders lying in the folder misc on shop.orders', () => {
    const folder = reading([{ file: 'misc/whatever.json', text: fileOf('Elsewhere') }]);
    const result = parse([{ connectionName: 'Local', mine: [], recent: [], folder }], args);
    expect(result.saved).toMatchObject([{ name: 'Elsewhere', place: 'folder', file: 'misc/whatever.json' }]);
    expect(
      parse([{ connectionName: 'Local', mine: [], recent: [], folder }], { ...args, collection: 'other' }).saved,
    ).toEqual([]);
  });

  it('lists the queries for me of the collection only, as the main process gives those of the connection', () => {
    const other = mineJson({ ...mine('Other'), collection: 'sales' });
    const result = parse(
      [{ connectionName: 'Local', mine: [mineJson(mine('Paid')), other], recent: [], folder: null }],
      args,
    );
    expect(namesOf(result.saved)).toEqual(['Paid (me)']);
  });

  it('lists only the queries for me on a connection without a queries folder', () => {
    const result = parse([{ connectionName: 'Bare', mine: [mineJson(mine('Paid'))], recent: [], folder: null }], args);
    expect(result.saved).toHaveLength(1);
    expect(result.queriesFolder).toBeUndefined();
  });

  it('gives the recent queries newest first, at most 50', () => {
    const recent = Array.from({ length: 60 }, (_, index) => ({
      query: { kind: 'find', filter: `{ n: ${String(index)} }`, sort: '', projection: '' },
      at: index,
    }));
    const result = parse([{ connectionName: 'Local', mine: [], recent, folder: null }], args);
    expect(result.recent).toHaveLength(50);
    expect(result.recent[0]?.at).toBe(59);
  });

  it('lists the folder Mongoster 0.8.0 wrote', async () => {
    const folder = await readQueriesFolder(recorded);
    const result = parse([{ connectionName: 'Production', mine: [], recent: [], folder }], args);
    expect(result.saved.map((each) => each.name)).toEqual(['All', 'Mine', 'Paid this month', 'Totals by customer']);
    expect(
      parse([{ connectionName: 'Local', mine: [], recent: [], folder }], args).saved.map((each) => each.name),
    ).toEqual(['All', 'Mine', 'Paid this month']);
  });

  it('answers list_saved_queries with "No saved or recent queries for shop.orders on Local." when there are none', () => {
    expect(listText(parse([{ connectionName: 'Local', mine: [], recent: [], folder: null }], args))).toBe(
      'No saved or recent queries for shop.orders on Local.',
    );
    const some = parse([{ connectionName: 'Local', mine: [mineJson(mine('Paid'))], recent: [], folder: null }], args);
    expect(listText(some)).toBe('Saved:\n- Paid (Me): { status: "paid" }');
  });
});

describe('saved-query.read-folder', () => {
  it('reads nothing and warns about nothing for a connection with no queries folder', () => {
    const context = contextOn('saved-query.read-folder', bare.id);
    expect(folderRequest(context, { connection: bare.id })).toEqual({
      kind: 'app',
      action: 'saved-query.read-folder',
      args: { connection: 'c-bare', queriesFolder: null },
    });
    const result = folderParse([null], null);
    expect(result.queries).toEqual([]);
    expect(readFolderAfter(result, { ...context, target: { kind: 'connection', connection: bare.id } })).toEqual([]);
  });

  it('skips a file holding {, lists the others, and says so with Reveal file', () => {
    const result = folderParse(
      [
        reading([
          { file: 'shop/orders/broken.json', text: '{' },
          { file: 'shop/orders/paid.json', text: fileOf('Paid') },
        ]),
      ],
      null,
    );
    expect(result.queries.map((each) => each.name)).toEqual(['Paid']);
    const warning = skippedWarning(result.fresh, local.id);
    expect(warning).toMatchObject({ kind: 'notify', level: 'warning' });
    expect(warning?.kind === 'notify' && warning.text).toMatch(
      /^Datardo skipped the saved query shop\/orders\/broken\.json: not valid JSON: \S/u,
    );
    expect(warning?.kind === 'notify' && warning.actions).toEqual([
      {
        label: 'Reveal file',
        element: 'saved-query.reveal-file@notification',
        feature: 'saved-query.reveal-file',
        target: { kind: 'connection', connection: 'c-local' },
        args: { connection: 'c-local', file: 'shop/orders/broken.json' },
      },
    ]);
  });

  it('reports the same broken file once, and again after it was read well in between', () => {
    const broken = reading([{ file: 'shop/orders/broken.json', text: '{' }]);
    const first = folderParse([broken], null);
    expect(first.fresh).toHaveLength(1);
    const second = folderParse([broken], { reported: first.reported });
    expect(second.fresh).toEqual([]);
    const corrected = folderParse([reading([{ file: 'shop/orders/broken.json', text: fileOf('Fixed') }])], {
      reported: second.reported,
    });
    expect(corrected.reported).toEqual({});
    expect(folderParse([broken], { reported: corrected.reported }).fresh).toHaveLength(1);
  });

  it('gives three broken files found at once one warning, naming the first', () => {
    const result = folderParse(
      [reading(['a', 'b', 'c'].map((name) => ({ file: `shop/${name}.json`, text: '[]' })))],
      null,
    );
    const warning = skippedWarning(result.fresh, local.id);
    expect(warning?.kind === 'notify' && warning.text).toBe(
      "Datardo skipped 3 saved query files that aren't valid, such as shop/a.json: it must be a JSON object.",
    );
  });

  it('skips a file of 2 MB with "the file is larger than 1 MB."', () => {
    const result = folderParse([{ folder: repoFolder, files: [{ file: 'shop/big.json', size: 2_000_000 }] }], null);
    expect(result.skipped).toEqual([{ file: 'shop/big.json', message: 'the file is larger than 1 MB.' }]);
  });

  it('keeps at most 2,000 files of a reply, and no path that leaves the folder', () => {
    const files = Array.from({ length: 2500 }, (_, index) => ({
      file: `q/${String(index)}.json`,
      text: fileOf(`Q${String(index)}`),
    }));
    expect(folderParse([reading(files)], null).queries).toHaveLength(2000);
    expect(folderParse([reading([{ file: '../outside.json', text: fileOf('Out') }])], null).queries).toEqual([]);
  });

  it('asks for the folder the connection has, or the one just chosen', () => {
    expect(folderRequest(contextOn('saved-query.read-folder'), { connection: 'c-local' })).toMatchObject({
      args: { queriesFolder: repoFolder },
    });
    expect(
      folderRequest(contextOn('saved-query.read-folder'), { connection: 'c-bare', queriesFolder: 'D:\\q' }),
    ).toMatchObject({
      args: { queriesFolder: 'D:\\q' },
    });
  });

  it('gives a file the system could not read its reason', () => {
    const result = folderParse(
      [{ folder: repoFolder, files: [{ file: 'shop/locked.json', size: 0, error: 'EACCES: permission denied' }] }],
      null,
    );
    expect(result.skipped).toEqual([{ file: 'shop/locked.json', message: 'EACCES: permission denied' }]);
  });
});

describe('saved-query.connection-list', () => {
  const folder = reading([
    {
      file: 'shop/orders/paid-this-month.json',
      text: queryFileText({
        name: 'Paid this month',
        database: 'shop',
        collection: 'orders',
        query: find('{ status: "paid" }'),
      }),
    },
    { file: 'shop/orders/prod.json', text: fileOf('Prod only', { connection: 'Production' }) },
    { file: 'shop/archive/old.json', text: JSON.stringify({ name: 'Old', database: 'shop', collection: 'archive' }) },
    { file: 'logs/x.json', text: JSON.stringify({ name: 'Logs', database: 'logs', collection: 'x' }) },
  ]);
  const databases = [{ name: 'shop', collections: ['orders'] }, { name: 'logs' }];

  it('finds Paid this month by paid on Local, as "shop.orders · Folder"', () => {
    const result = connectionParse([{ connectionName: 'Local', mine: [], folder, databases }]);
    const found = result.items.filter((each) => isFound(each, 'paid'));
    expect(found.map((each) => [each.title, each.context, each.line])).toEqual([
      ['Paid this month', 'shop.orders · Folder', '{ status: "paid" }'],
    ]);
  });

  it('does not find a file for Production, nor one for a collection Local does not have; a database not read yet lists its files', () => {
    const result = connectionParse([{ connectionName: 'Local', mine: [], folder, databases }]);
    expect(result.items.map((each) => each.title)).toEqual(['Logs', 'Paid this month']);
  });

  it('lists the queries for me of the connection given, found by name, description or collection', () => {
    const result = connectionParse([
      { connectionName: 'Local', mine: [mineJson(mine('Big', find('{}'), { description: 'Over 100' }))], folder: null },
    ]);
    const [item] = result.items;
    expect(item?.context).toBe('shop.orders · Me');
    expect(item !== undefined && isFound(item, 'over')).toBe(true);
    expect(item !== undefined && isFound(item, 'ORDERS')).toBe(true);
    expect(item !== undefined && isFound(item, 'sales')).toBe(false);
  });

  it('asks for the saved queries of the current connection, and lists none when there are none', () => {
    const context = contextOn('saved-query.connection-list');
    const state = { ...context.state, nav: { ...context.state.nav, current: production.id } };
    expect(connectionListFeature.request({ ...context, state }, null)).toEqual({
      kind: 'app',
      action: 'saved-query.connection-list',
      args: { connection: 'c-prod', queriesFolder: repoFolder },
    });
    expect(connectionParse([{ connectionName: 'Local', mine: [], folder: null }]).items).toEqual([]);
  });

  it('pins a query for me with the query itself, and one in the folder with the path of its file', () => {
    expect(pinOf(mine('Paid'))).toEqual({
      place: 'me',
      database: 'shop',
      collection: 'orders',
      name: 'Paid',
      query: { kind: 'find', filter: '{ status: "paid" }', sort: '', projection: '' },
    });
    expect(
      pinOf({
        place: 'folder',
        name: 'P',
        database: 'shop',
        collection: 'orders',
        query: find('{}'),
        file: 'shop/orders/p.json',
      }),
    ).toEqual({
      place: 'folder',
      database: 'shop',
      collection: 'orders',
      name: 'P',
      file: 'shop/orders/p.json',
    });
  });
});
