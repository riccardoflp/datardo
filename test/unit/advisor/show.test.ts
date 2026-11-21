import { describe, expect, it } from 'vitest';
import { advice } from '../../../src/features/advisor/analyze';
import { commands } from '../../../src/features/advisor/commands';
import {
  createItem,
  queryDetails,
  unusedItem,
  type ItemsInput,
} from '../../../src/features/advisor/parts/advice-items';
import {
  analysisOf,
  nextRead,
  nothingRead,
  withReply,
  withSlowOperations,
} from '../../../src/features/advisor/parts/reading';
import { sourcesView, summaryText } from '../../../src/features/advisor/parts/sources';
import { agoText, durationText } from '../../../src/features/advisor/parts/words';
import type { ScopeIndexes } from '../../../src/features/advisor/read-indexes';
import type { ScopeSlowOperations } from '../../../src/features/advisor/read-slow-operations';
import { plan, tabTitle, view, type AdvisorPageState } from '../../../src/features/advisor/show';
import type {
  AdvisorCollection,
  AdvisorQuery,
  CreateAdvice,
  Scope,
  UnusedAdvice,
} from '../../../src/features/advisor/types';
import { clockText } from '../../../src/features/monitor/parts/units';
import type { Context } from '../../../src/shared/feature';
import { contextOn, int, local, now, planOf, production } from '../monitor/context';
import { collectionOf, day, idIndex, index, megabyte, operation, times } from './context';

const orders = collectionOf('shop.orders', [idIndex, index('status_1', { status: 1 }, { size: megabyte })]);

function indexesOf(collections: readonly AdvisorCollection[], failed: ScopeIndexes['failed'] = []): ScopeIndexes {
  return { databases: ['shop'], profiled: ['shop'], collections, failed };
}

function slowOf(given: Partial<ScopeSlowOperations> = {}): ScopeSlowOperations {
  return {
    operations: [],
    profilers: [{ database: 'shop', level: 1, operations: 0 }],
    log: { kind: 'read', operations: 0 },
    threshold: 100,
    ...given,
  };
}

function stateOf(scope: Scope, indexes: ScopeIndexes, slow: ScopeSlowOperations, readOnly = false): AdvisorPageState {
  const connection = readOnly ? production : local;
  return {
    connection: { id: connection.id, name: connection.name, readOnly },
    scope,
    now,
    analyzing: false,
    analyzedAt: now,
    read: { kind: 'read', indexes, slow },
    expanded: [],
  };
}

const byCustomer = times(7, { filter: { customerId: int(42) }, sort: { createdAt: int(-1) }, millis: 350 });

function itemsInput(scope: Scope = { kind: 'database', database: 'shop' }, readOnly = false): ItemsInput {
  return { connection: readOnly ? production.id : local.id, readOnly, scope, now, expanded: [] };
}

function createAdvice(): CreateAdvice {
  const [first] = advice([orders], byCustomer, now).advices;
  if (first?.kind !== 'create') {
    throw new Error('Expected an index to create.');
  }
  return first;
}

function withTarget(target: Context['target']): Context {
  return { ...contextOn('advisor.show'), target };
}

describe('advisor.show', () => {
  it('from the Pages of Local, the page analyzes every database but admin, local and config, and names shop.orders', () => {
    const input = { connection: local.id, scope: { kind: 'connection' } as const, fallback: 'test' };
    expect(nextRead(input, nothingRead)?.args).toMatchObject({ step: 'databases' });
    const shown = view(stateOf({ kind: 'connection' }, indexesOf([orders]), slowOf({ operations: byCustomer })));
    expect(shown.toolbar.scope).toBe('every database');
    expect(shown.lists?.create.items[0]?.collection).toBe('shop.orders');
    const fromShop = view(
      stateOf({ kind: 'database', database: 'shop' }, indexesOf([orders]), slowOf({ operations: byCustomer })),
    );
    expect(fromShop.lists?.create.items[0]?.collection).toBe('orders');
  });

  it('opens one tab per scope, named Index advisor, Index advisor · shop, Index advisor · shop.orders', () => {
    const tabs = [
      withTarget({ kind: 'connection', connection: local.id }),
      withTarget({ kind: 'database', connection: local.id, database: 'shop' }),
      withTarget({ kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' }),
    ].map((context) => planOf(plan(context, { args: null })).steps[0]);
    const shows = { kind: 'page', connection: local.id, page: 'advisor' };
    expect(tabs[0]).toMatchObject({
      action: 'tab.open',
      args: { shows: { ...shows, title: 'Index advisor' }, background: false },
    });
    expect(tabs[1]).toMatchObject({ args: { shows: { ...shows, title: 'Index advisor · shop', database: 'shop' } } });
    expect(tabs[2]).toMatchObject({
      args: { shows: { ...shows, title: 'Index advisor · shop.orders', database: 'shop', of: ['orders'] } },
    });
    expect(tabTitle({ kind: 'collection', database: 'shop', collection: 'orders' })).toBe(
      'Index advisor · shop.orders',
    );
  });

  it('Go to has Index advisor', () => {
    expect(commands.map((each) => [each.id, each.title])).toContainEqual(['advisor.show', 'Index advisor']);
  });

  it('12 collections, 34 indexes of 1,288,490,189 bytes and 5 advices; with no advice, nothing to suggest', () => {
    // The first collection has 23 indexes, one of them nearly all the bytes; the 11 others one index of 1 byte.
    const first = Array.from({ length: 23 }, (_, at) =>
      index(`i${String(at)}`, { [`f${String(at)}`]: 1 }, { size: at === 0 ? 1_288_490_189 - 33 : 1 }),
    );
    const collections = Array.from({ length: 12 }, (_, at) =>
      collectionOf(`shop.c${String(at)}`, at === 0 ? first : [index('i', { f: 1 }, { size: 1 })]),
    );
    expect(summaryText(indexesOf(collections), 5)).toBe(
      '12 collections · 34 indexes · 1.2 GB of indexes · 5 suggestions',
    );
    expect(summaryText(indexesOf(collections), 0)).toBe(
      '12 collections · 34 indexes · 1.2 GB of indexes · nothing to suggest',
    );
  });

  it('an advice with 5 query shapes shows 3 and +2 more queries; after a click, 5 and Fewer queries', () => {
    const fields = ['a', 'b', 'c', 'd', 'e'];
    const operations = fields.map((_, at) => {
      const ranges = Object.fromEntries(fields.slice(0, at + 1).map((field) => [field, { $gt: int(1) }]));
      return operation({ filter: { kind: 'x', ...ranges }, millis: 100 + at });
    });
    const [first] = advice([orders], operations, now).advices.filter(
      (each): each is CreateAdvice => each.kind === 'create',
    );
    expect(first?.queries).toHaveLength(5);
    const folded = createItem(itemsInput(), first as CreateAdvice);
    expect(folded.queries).toHaveLength(3);
    expect(folded.more).toEqual({ kind: 'toggle', label: '+2 more queries', advice: first?.id });
    const unfolded = createItem({ ...itemsInput(), expanded: [first?.id ?? ''] }, first as CreateAdvice);
    expect(unfolded.queries).toHaveLength(5);
    expect(unfolded.more).toMatchObject({ label: 'Fewer queries' });
  });

  it('7 operations, 2,450 ms, 84,000 examined and 140 returned with a collection scan', () => {
    const query: AdvisorQuery = {
      kind: 'find',
      shape: '{ customerId: ? }',
      operations: 7,
      totalMillis: 2450,
      averageMillis: 350,
      docsExamined: 84_000,
      returned: 140,
      collectionScan: true,
      inMemorySort: false,
      example: operation({}),
    };
    expect(queryDetails(query)).toBe('7 times · avg 350 ms · 12,000 examined / 20 returned · collection scan');
  });

  it('why an index is to be created, with its reason and what it serves', () => {
    expect(createItem(itemsInput(), createAdvice()).why).toBe(
      '7 slow operations, 2.5 s in total, read the whole collection. This index (equality fields, then sort, then range) can serve it.',
    );
  });

  it('Copy puts the createIndex command on the clipboard, also on a read-only connection', () => {
    const command = 'db.getSiblingDB("shop").getCollection("orders").createIndex({ customerId: 1, createdAt: -1 })';
    expect(createItem(itemsInput(), createAdvice()).copy).toEqual({
      kind: 'copy',
      label: 'Copy',
      tooltip: 'Copy the mongosh command',
      text: command,
    });
    expect(createItem(itemsInput(undefined, true), createAdvice()).copy).toMatchObject({ text: command });
  });

  it('Create index… starts index.create on shop.orders with customerId ascending and createdAt descending', () => {
    expect(createItem(itemsInput(), createAdvice()).create).toEqual({
      kind: 'start',
      label: 'Create index…',
      feature: 'index.create',
      target: { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' },
      args: {
        connection: local.id,
        database: 'shop',
        collection: 'orders',
        keys: { customerId: int(1), createdAt: int(-1) },
      },
      tooltip: 'Create { customerId: 1, createdAt: -1 } on shop.orders',
      enabled: true,
    });
  });

  it('once the index exists, the next analysis has no advice for it', () => {
    const withIndex = collectionOf('shop.orders', [
      ...orders.indexes,
      index('customerId_1_createdAt_-1', { customerId: 1, createdAt: -1 }),
    ]);
    expect(advice([withIndex], byCustomer, now).advices.filter((each) => each.kind === 'create')).toEqual([]);
  });

  it('Drop… on an unused index starts index.drop with the reason No query used it since 12 days ago.', () => {
    const unused: UnusedAdvice = {
      kind: 'unused',
      id: 'unused:shop.orders:note_1',
      database: 'shop',
      collection: 'orders',
      index: index('note_1', { note: 1 }, { uses: 0, since: now - 12 * day, size: 2 * megabyte }),
    };
    const item = unusedItem(itemsInput(), unused);
    expect(item.buttons[1]).toMatchObject({
      label: 'Drop…',
      feature: 'index.drop',
      args: { database: 'shop', collection: 'orders', index: 'note_1', advice: 'No query used it since 12 days ago.' },
      enabled: true,
    });
    expect(item.size).toBe('2.0 MB');
  });

  it('Open and Explain open the slowest operation of a find with its filter and sort', () => {
    const [query] = createItem(itemsInput(), createAdvice()).queries;
    expect(query?.open).toMatchObject({
      label: 'Open',
      feature: 'monitor.open-slow-query',
      args: {
        namespace: 'shop.orders',
        kind: 'find',
        query: { filter: { customerId: int(42) }, sort: { createdAt: int(-1) } },
        explain: false,
      },
      enabled: true,
    });
    expect(query?.explain).toMatchObject({ label: 'Explain', args: { explain: true }, enabled: true });
  });

  it('with the profiler of shop off and nothing from it, Turn on…; with 10 such databases, 8 buttons', () => {
    const off = slowOf({ profilers: [{ database: 'shop', level: 0, operations: 0 }] });
    const one = sourcesView({ connection: local.id, readOnly: false, now }, indexesOf([orders]), off);
    expect(one.notes).toEqual([
      {
        text: 'The profiler of shop is off: only the slow operations still in the server log are seen.',
        buttons: [
          {
            kind: 'start',
            label: 'Turn on…',
            element: 'advisor.turn-on-profiler@toolbar',
            feature: 'advisor.turn-on-profiler',
            target: { kind: 'database', connection: local.id, database: 'shop' },
            args: { connection: local.id, database: 'shop' },
            tooltip: 'Record the operations on shop slower than 100 ms',
            enabled: true,
          },
        ],
      },
    ]);
    const ten = Array.from({ length: 10 }, (_, at) => ({ database: `db${String(at)}`, level: 0, operations: 0 }));
    const many = sourcesView(
      { connection: local.id, readOnly: false, now },
      indexesOf([orders]),
      slowOf({ profilers: ten }),
    );
    expect(many.notes[0]?.text).toBe(
      'The profiler is off on 10 databases: only the slow operations still in the server log are seen.',
    );
    expect(many.notes[0]?.buttons.map((each) => each.label)).toEqual(
      Array.from({ length: 8 }, (_, at) => `Turn on for db${String(at)}…`),
    );
  });

  it('where the slow operations come from, naming the database only when its profiler gave them all', () => {
    const operations = times(2, { time: now - 3 * 3_600_000 });
    const both = slowOf({
      operations,
      profilers: [{ database: 'shop', level: 1, operations: 240 }],
      log: { kind: 'read', operations: 12 },
      oldest: now - 3 * 3_600_000,
    });
    expect(sourcesView({ connection: local.id, readOnly: false, now }, indexesOf([orders]), both).line).toBe(
      'Slow operations (slower than 100 ms): 240 operations from the profiler, 12 operations from the server log, since 3 hours ago.',
    );
    const profilerOnly = { ...both, log: { kind: 'read' as const, operations: 0 } };
    expect(sourcesView({ connection: local.id, readOnly: false, now }, indexesOf([orders]), profilerOnly).line).toBe(
      'Slow operations (slower than 100 ms): 240 operations from the profiler of shop, since 3 hours ago.',
    );
    expect(sourcesView({ connection: local.id, readOnly: false, now }, indexesOf([orders]), slowOf()).line).toBe(
      'Slow operations (slower than 100 ms): none.',
    );
  });

  it('when the indexes of shop.audit cannot be read, shop.audit: <message> and the advice for the others', () => {
    const failed = [{ namespace: 'shop.audit', message: 'not authorized on shop to execute command' }];
    const shown = view(
      stateOf({ kind: 'database', database: 'shop' }, indexesOf([orders], failed), slowOf({ operations: byCustomer })),
    );
    expect(shown.sources?.notes).toContainEqual({
      text: 'shop.audit: not authorized on shop to execute command',
      buttons: [],
    });
    expect(shown.lists?.create.count).toBe(1);
  });

  it('when the server log cannot be read, it says so under the sources', () => {
    const shown = sourcesView(
      { connection: local.id, readOnly: false, now },
      indexesOf([orders]),
      slowOf({ log: { kind: 'failed', message: 'not authorized' } }),
    );
    expect(shown.notes[0]).toEqual({ text: "The server log can't be read: not authorized", buttons: [] });
  });

  it('on a read-only connection the lists are complete, the buttons that change an index are disabled, no Turn on…', () => {
    const collection = collectionOf('shop.orders', [
      ...orders.indexes,
      index('note_1', { note: 1 }, { uses: 0, since: now - 12 * day }),
      index('status_1_at_1', { status: 1, at: 1 }),
    ]);
    const off = slowOf({ operations: byCustomer, profilers: [{ database: 'shop', level: 0, operations: 0 }] });
    const shown = view(stateOf({ kind: 'database', database: 'shop' }, indexesOf([collection]), off, true));
    expect([shown.lists?.create.count, shown.lists?.redundant.count, shown.lists?.unused.count]).toEqual([1, 1, 1]);
    const changing = [
      shown.lists?.create.items[0]?.create,
      ...(shown.lists?.redundant.items[0]?.buttons ?? []),
      ...(shown.lists?.unused.items[0]?.buttons ?? []),
    ];
    expect(changing).toHaveLength(5);
    for (const button of changing) {
      expect(button).toMatchObject({ enabled: false, tooltip: 'The connection is read-only' });
    }
    expect(shown.lists?.create.items[0]?.queries[0]?.open).toMatchObject({ enabled: true });
    expect(shown.sources?.notes.flatMap((each) => each.buttons)).toEqual([]);
    expect(shown.status).toBe('Read-only');
  });

  it('nothing is read again until Refresh or an action of the page that ran', () => {
    const input = { connection: local.id, scope: { kind: 'database', database: 'shop' } as const, fallback: 'test' };
    let progress = withReply(nothingRead, {
      step: 'collections',
      collections: [{ database: 'shop', collection: 'orders' }],
      profiled: [],
    });
    progress = withReply(progress, { step: 'indexes', collections: [orders], failed: [] });
    expect(nextRead(input, progress)?.key).toBe('slow');
    progress = withSlowOperations(progress, slowOf());
    expect(nextRead(input, progress)).toBeUndefined();
    expect(analysisOf(input, progress)).toMatchObject({ kind: 'read', indexes: { collections: [orders] } });
  });

  it('the first time it says Reading the indexes and the slow operations…; Refresh reads Analyzing… while reading', () => {
    const { read: _read, analyzedAt: _at, ...first } = stateOf({ kind: 'connection' }, indexesOf([]), slowOf());
    const shown = view({ ...first, analyzing: true });
    expect(shown.summary).toBe('Reading the indexes and the slow operations…');
    expect(shown.toolbar).toEqual({
      scope: 'every database',
      refresh: { label: 'Analyzing…', tooltip: 'Read the indexes and the slow operations again', enabled: false },
    });
    const done = view(stateOf({ kind: 'connection' }, indexesOf([]), slowOf()));
    expect(done.toolbar.analyzedAt).toBe(`Analyzed at ${clockText(now)}`);
    expect(done.toolbar.refresh).toMatchObject({ label: 'Refresh', enabled: true });
  });

  it('when the collections cannot be listed, the server’s message takes the place of the lists', () => {
    const input = { connection: local.id, scope: { kind: 'database', database: 'shop' } as const, fallback: 'test' };
    const progress = withReply(nothingRead, {
      step: 'collections',
      collections: [],
      profiled: [],
      error: 'not authorized',
    });
    expect(nextRead(input, progress)).toBeUndefined();
    const read = analysisOf(input, progress);
    expect(read).toEqual({ kind: 'failed', message: 'not authorized' });
    const shown = view({
      ...stateOf({ kind: 'database', database: 'shop' }, indexesOf([]), slowOf()),
      read: { kind: 'failed', message: 'not authorized' },
    });
    expect(shown.error).toBe('not authorized');
    expect(shown.lists).toBeUndefined();
  });

  it('each list has its own text when it is empty', () => {
    const none = view(stateOf({ kind: 'database', database: 'shop' }, indexesOf([orders]), slowOf()));
    expect(none.lists?.create.empty).toBe(
      'No slow operations recorded yet: turn on the profiler, use the application for a while, then refresh.',
    );
    expect(none.lists?.redundant.empty).toBe('No index is the start of another one.');
    expect(none.lists?.unused.empty).toBe('Every index was used since the statistics started.');
    const served = view(
      stateOf(
        { kind: 'database', database: 'shop' },
        indexesOf([orders]),
        slowOf({
          operations: [operation({ filter: { status: 'a' }, plan: 'IXSCAN { status: 1 }', examined: 1, returned: 1 })],
        }),
      ),
    );
    expect(served.lists?.create.empty).toBe('No slow operation needs a new index.');
    expect(served.summary).toBe('1 collection · 2 indexes · 1.0 MB of indexes · nothing to suggest');
  });

  it('durations and how long ago are written as the card says', () => {
    expect([durationText(12_400), durationText(4200), durationText(350)]).toEqual(['12 s', '4.2 s', '350 ms']);
    expect([agoText(80_000), agoText(12 * 60_000), agoText(3 * 3_600_000), agoText(12 * day)]).toEqual([
      'a minute ago',
      '12 minutes ago',
      '3 hours ago',
      '12 days ago',
    ]);
  });
});
