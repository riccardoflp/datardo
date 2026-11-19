import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/key/refresh';
import { request } from '../../../src/features/key/scan';
import { scanArgsOf, startingScan, view } from '../../../src/features/key/show';
import type { KeysPageState } from '../../../src/features/key/show';
import { noSelection } from '../../../src/features/key/select';
import type { ReadRequest } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { cache, cacheReadOnly, connected, keyContext, onDatabase, planOf, requestWords } from './context';

const keysTab = { kind: 'keys', connection: cache.id, database: 0, separator: ':' } as const;

describe('key.refresh', () => {
  it('scans again: DBSIZE and SCAN 0 with the pattern and the type of the last scan', () => {
    const context = keyContext('key.refresh', { kind: 'tab', tab: tabId('t1') }, connected(cache, '7.4.1', [keysTab]));
    const refreshed = planOf(plan(context, {}));
    expect(refreshed.steps).toEqual([]);
    expect(refreshed.after).toEqual([{ kind: 'refresh', connection: cache.id }]);
    const last = { ...startingScan('orders:'), type: 'hash' as const };
    const page = { connection: { id: cache.id }, database: 0, last } as unknown as KeysPageState;
    const read = request(keyContext('key.scan', onDatabase()), scanArgsOf(page, '0'));
    expect((read as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords)).toEqual([
      'SCAN 0 MATCH orders:* TYPE hash COUNT 500',
      'DBSIZE',
    ]);
  });

  it('reads again the size of a row read before: what was read is dropped', () => {
    const state: KeysPageState = {
      connection: { id: cache.id, name: cache.name, readOnly: false, connected: true },
      database: 0,
      field: '',
      last: startingScan(undefined),
      details: new Map(),
      sizesRefused: false,
      sort: { column: 'size', direction: 'descending' },
      selection: noSelection,
      now: 0,
      scan: { rows: [], cursor: '0', calls: 0, run: { calls: 0, found: 0 } },
    };
    const shown = view(state);
    expect(shown.columns.find((column) => column.column === 'size')?.sorted).toEqual({
      column: 'size',
      direction: 'descending',
    });
  });

  it('is allowed on a read-only connection, and cannot be undone', () => {
    const readOnly = keyContext('key.refresh', onDatabase(0, cacheReadOnly), connected(cacheReadOnly));
    expect(planOf(plan(readOnly, {})).undo).toEqual({ cannot: 'Cannot be undone: there is nothing to undo.' });
  });
});
