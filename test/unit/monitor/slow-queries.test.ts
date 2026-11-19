import { describe, expect, it } from 'vitest';
import { nextGroupSort } from '../../../src/features/monitor/parts/slow-query-rows';
import type { ProfilerState, SlowQueriesRead } from '../../../src/features/monitor/read-slow-queries';
import {
  firstDatabase,
  firstSince,
  isOlderThan44,
  view,
  type SlowQueriesState,
} from '../../../src/features/monitor/slow-queries';
import type { SlowQuery } from '../../../src/features/monitor/types';
import { local } from './context';
import { slowQuery } from './slow-query-builder';

function readOf(
  operations: readonly SlowQuery[],
  profiler: ProfilerState = { level: 1, slowMs: 100 },
): SlowQueriesRead {
  return {
    source: 'profiler',
    database: 'shop',
    profiler: { kind: 'read', value: profiler },
    operations: { kind: 'read', value: { operations, more: false, olderLinesDropped: false } },
  };
}

function stateWith(operations: readonly SlowQuery[], fields: Partial<SlowQueriesState> = {}): SlowQueriesState {
  return {
    connection: { id: local.id, name: 'Local', readOnly: false, mongos: false },
    source: 'profiler',
    database: 'shop',
    databases: ['admin', 'config', 'local', 'shop'],
    since: firstSince,
    grouping: 'by-query',
    filter: '',
    read: readOf(operations),
    ...fields,
  };
}

/** 42 operations of 7 shapes: six of each. */
const fortyTwo = Array.from({ length: 42 }, (_, index) =>
  slowQuery({ millis: 10 + index, query: { filter: { [`field${String(index % 7)}`]: index } } }),
);

describe('monitor.slow-queries', () => {
  it('reads Recording operations slower than 100 ms and starts at 1 hour on the first database that is not admin', () => {
    const shown = view(stateWith([]));
    expect(shown.recording?.startsWith('Recording operations slower than 100 ms · ')).toBe(true);
    expect(shown.toolbar.since.value).toBe(60);
    expect(shown.toolbar.since.choices.map((choice) => choice.label)).toEqual([
      '15 minutes',
      '1 hour',
      '24 hours',
      'All',
    ]);
    expect(firstDatabase('profiler', ['admin', 'config', 'local', 'shop'])).toBe('shop');
    expect(firstDatabase('log', ['shop'])).toBeUndefined();
  });

  it('shows 7 rows By query and 42 under All, and counts 42 operations · 7 queries', () => {
    const byQuery = view(stateWith(fortyTwo));
    expect(byQuery.groups).toHaveLength(7);
    expect(byQuery.recording).toBe('Recording operations slower than 100 ms · 42 operations · 7 queries');
    const all = view(stateWith(fortyTwo, { grouping: 'all' }));
    expect(all.operations).toHaveLength(42);
    expect(all.recording).toBe('Recording operations slower than 100 ms · 42 operations');
  });

  it('sorts by Avg ms, the largest first, then the smallest first', () => {
    const operations = [
      slowQuery({ millis: 500, query: { filter: { a: 1 } } }),
      slowQuery({ millis: 300, query: { filter: { b: 1 } } }),
      slowQuery({ millis: 300, query: { filter: { b: 2 } } }),
      slowQuery({ millis: 300, query: { filter: { b: 3 } } }),
    ];
    const first = nextGroupSort(undefined, 'average');
    expect(view(stateWith(operations, { sort: first })).groups?.map((row) => row.query)).toEqual([
      '{ a: ? }',
      '{ b: ? }',
    ]);
    const second = nextGroupSort(first, 'average');
    expect(view(stateWith(operations, { sort: second })).groups?.map((row) => row.query)).toEqual([
      '{ b: ? }',
      '{ a: ? }',
    ]);
  });

  it('starts sorted by Total ms', () => {
    const operations = [
      slowQuery({ millis: 500, query: { filter: { a: 1 } } }),
      slowQuery({ millis: 300, query: { filter: { b: 1 } } }),
      slowQuery({ millis: 300, query: { filter: { b: 2 } } }),
    ];
    expect(view(stateWith(operations)).groups?.map((row) => row.total.text)).toEqual(['600', '500']);
  });

  it('switches to All with the shape of the group in the filter with Show operations', () => {
    const run = slowQuery({ query: { filter: { status: 'paid' } } });
    const group = view(stateWith([run])).groups?.[0];
    const shown = view(stateWith([run], { selected: { group: group?.key ?? '' } }));
    expect(shown.inspector?.showOperations).toEqual({ label: 'Show operations', filter: '{ status: ? }' });
    const all = view(
      stateWith([run, slowQuery({ query: { filter: { other: 1 } } })], {
        grouping: 'all',
        filter: '{ status: ? }',
      }),
    );
    expect(all.operations).toHaveLength(1);
  });

  it('shows 12,500 / 10 in the warning color with its tooltip', () => {
    const run = slowQuery({ docsExamined: 12_500, returned: 10, plan: 'IXSCAN { a: 1 }' });
    expect(view(stateWith([run])).groups?.[0]?.examined).toEqual({
      text: '12,500 / 10',
      tone: 'warning',
      tooltip: '1,250 documents examined per document returned',
    });
  });

  it('says that the profiler is off when it is and nothing was recorded', () => {
    const shown = view(stateWith([], { read: readOf([], { level: 0, slowMs: 100 }) }));
    expect(shown.empty?.startsWith('The profiler of this database is off: ')).toBe(true);
    expect(shown.recording?.startsWith('Profiler off')).toBe(true);
  });

  it('offers only Server log through a mongos, with its note', () => {
    const shown = view(
      stateWith([], { connection: { id: local.id, name: 'Cluster', readOnly: false, mongos: true }, source: 'log' }),
    );
    expect(shown.toolbar.source.choices.map((choice) => choice.label)).toEqual(['Server log']);
    expect(shown.toolbar.source.note).toBe('A mongos keeps no profiler: connect to a shard to use it.');
    expect(shown.profiler).toBeUndefined();
  });

  it('copies the filter and the sort of a find, and the pipeline of an aggregate', () => {
    const find = slowQuery({ query: { filter: { status: 'paid' }, sort: { createdAt: -1 } } });
    const copied = view(stateWith([find], { grouping: 'all', selected: { operation: 0 } })).inspector?.copyQuery;
    expect(copied).toEqual({ label: 'Copy query', text: '{ filter: { status: "paid" }, sort: { createdAt: -1 } }' });
    const pipeline = [{ $match: { status: 'paid' } }];
    const aggregate = slowQuery({ kind: 'aggregate', query: { pipeline } });
    const piped = view(stateWith([aggregate], { grouping: 'all', selected: { operation: 0 } })).inspector?.copyQuery;
    expect(piped?.text).toBe('[{ $match: { status: "paid" } }]');
  });

  it('has neither Open in collection nor Explain for an insert', () => {
    const insert = slowQuery({ kind: 'insert', query: {} });
    const shown = view(stateWith([insert], { grouping: 'all', selected: { operation: 0 } }));
    expect(shown.inspector?.open).toBeUndefined();
    expect(shown.inspector?.explain).toBeUndefined();
    const find = view(stateWith([slowQuery()], { grouping: 'all', selected: { operation: 0 } }));
    expect(find.inspector?.open?.element).toBe('monitor.open-slow-query@inspector');
  });

  it('says why and which index, with Create index…, disabled on a read-only connection', () => {
    const run = slowQuery({
      plan: 'COLLSCAN',
      docsExamined: 5000,
      returned: 20,
      millis: 1840,
      application: 'checkout',
    });
    const key = view(stateWith([run])).groups?.[0]?.key ?? '';
    const inspector = view(stateWith([run], { selected: { group: key } })).inspector;
    expect(inspector?.why).toEqual([
      'The plan scans the whole collection (COLLSCAN).',
      '250 documents are examined per document returned.',
      'An index on { status: 1 } (equality fields, then sort, then range) could serve this query.',
    ]);
    expect(inspector?.createIndex).toMatchObject({
      element: 'monitor.create-suggested-index@inspector',
      args: { namespace: 'shop.orders', keys: { status: { $numberInt: '1' } }, view: false },
    });
    expect(inspector?.example?.startsWith('example: the slowest, 1,840 ms at ')).toBe(true);
    expect(inspector?.example?.endsWith(' · apps: checkout')).toBe(true);
    const readOnly = view(
      stateWith([run], {
        connection: { id: local.id, name: 'Production', readOnly: true, mongos: false },
        selected: { group: key },
      }),
    );
    expect(readOnly.inspector?.createIndex?.disabledBecause).toBe('The connection Production is read-only.');
    expect(readOnly.profiler?.apply.disabledBecause).toBe('The connection Production is read-only.');
  });

  it('colors 100 ms with the warning color and 1,000 ms with the danger color', () => {
    const shown = view(
      stateWith([slowQuery({ millis: 99 }), slowQuery({ millis: 100 }), slowQuery({ millis: 1000 })], {
        grouping: 'all',
      }),
    );
    expect(shown.operations?.map((row) => row.ms.tone)).toEqual(['ordinary', 'warning', 'danger']);
  });

  it('says the server log is read from MongoDB 4.4', () => {
    expect(isOlderThan44('4.2.24')).toBe(true);
    expect(isOlderThan44('4.4.0')).toBe(false);
    expect(view(stateWith([], { source: 'log', version: '4.2.24' })).note).toBe(
      'The server log lists slow queries in a form Datardo reads from MongoDB 4.4: use the profiler.',
    );
  });

  it('says what the server log has, and the filter', () => {
    const log: SlowQueriesRead = { ...readOf([]), source: 'log' };
    expect(view(stateWith([], { source: 'log', read: log })).empty).toBe(
      'No operations slower than 100 ms in the server log in the last hour. Lower the threshold to log more of them.',
    );
    expect(view(stateWith([slowQuery()], { filter: 'nothing like it' })).empty).toBe(
      'No operation matches the filter.',
    );
    expect(view(stateWith([], { since: 0 })).empty).toBe('No operations recorded.');
  });
});
