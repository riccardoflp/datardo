import { describe, expect, it } from 'vitest';
import { pattern } from '../../../src/features/key/pattern';
import { request } from '../../../src/features/key/scan';
import type { ScanState } from '../../../src/features/key/scan';
import type { KeysPageState } from '../../../src/features/key/show';
import { scanArgsOf, startingField, startingScan, view } from '../../../src/features/key/show';
import { noSelection } from '../../../src/features/key/select';
import type { ReadRequest } from '../../../src/shared/feature';
import { cache, keyContext, name, onDatabase, requestWords } from './context';

const now = 1_763_400_000_000;

function page(more: Partial<KeysPageState> = {}): KeysPageState {
  return {
    connection: { id: cache.id, name: cache.name, readOnly: false, connected: true },
    database: 0,
    field: '',
    last: startingScan(undefined),
    details: new Map(),
    sizesRefused: false,
    sort: undefined,
    selection: noSelection,
    now,
    ...more,
  };
}

function scanOf(names: readonly string[], ended: ScanState['ended'], total = names.length): ScanState {
  return {
    rows: names.map((each) => ({ name: name(each), type: 'string' })),
    cursor: ended === 'complete' ? '0' : '99',
    total,
    calls: 1,
    run: { calls: 1, found: names.length },
    ...(ended === undefined ? {} : { ended }),
  };
}

function firstCommand(state: KeysPageState): string | undefined {
  const read = request(keyContext('key.scan', onDatabase()), scanArgsOf(state, '0'));
  return (read as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords)[0];
}

describe('key.show', () => {
  it('opens db0 with an empty pattern field and All types, and first sends SCAN 0 COUNT 500', () => {
    const state = page();
    expect(view(state).toolbar.field.value).toBe('');
    expect(view(state).toolbar.type.value).toBe('all');
    expect(firstCommand(state)).toBe('SCAN 0 COUNT 500');
  });

  it('opens the namespace orders: with the pattern field orders:*', () => {
    expect(startingField('orders:')).toBe('orders:*');
    const state = page({ namespace: 'orders:', field: 'orders:*', last: startingScan('orders:') });
    expect(view(state).toolbar.field.value).toBe('orders:*');
    expect(firstCommand(state)).toBe('SCAN 0 MATCH orders:* COUNT 500');
  });

  it('shows *orders* at the right end of the field after orders and Enter, and scans with MATCH *orders*', () => {
    const state = page({
      field: 'orders',
      last: { typed: 'orders', pattern: pattern({ kind: 'typed', text: 'orders' }), type: 'all' },
    });
    expect(view(state).toolbar.field.sent).toBe('*orders*');
    expect(firstCommand(state)).toBe('SCAN 0 MATCH *orders* COUNT 500');
  });

  it('sends nothing while typing: the scan is that of the last Enter', () => {
    const state = page({ field: 'ord' });
    expect(scanArgsOf(state, '0')).toMatchObject({ pattern: '*' });
    expect(view(state).toolbar.field.sent).toBeUndefined();
  });

  it('scans again from cursor 0 with TYPE hash when Hash is chosen', () => {
    const state = page({ last: { ...startingScan(undefined), type: 'hash' } });
    expect(firstCommand(state)).toBe('SCAN 0 TYPE hash COUNT 500');
    expect(view(state).toolbar.type.options.map((option) => option.label)).toEqual([
      'All types',
      'String',
      'Hash',
      'List',
      'Set',
      'Sorted set',
      'Stream',
    ]);
  });

  it('shows 120 rows of a database of 120 keys, 120 keys on the status line, and Scan more disabled', () => {
    const names = Array.from({ length: 120 }, (_, index) => `k${String(index)}`);
    const shown = view(page({ scan: scanOf(names, 'complete') }));
    expect(shown.rows).toHaveLength(120);
    expect(shown.count).toBe('120 keys');
    expect(shown.toolbar.scanMore).toMatchObject({ enabled: false, tooltip: 'Every key was scanned.' });
  });

  it('shows the type ReJSON-RL as it is', () => {
    const scan: ScanState = { ...scanOf([], 'complete', 1), rows: [{ name: name('doc'), type: 'ReJSON-RL' }] };
    expect(view(page({ scan })).rows[0]?.type).toBe('ReJSON-RL');
  });

  it('says db0 has no keys on an empty database, and offers New key', () => {
    const table = view(page({ scan: scanOf([], 'complete', 0) })).table;
    expect(table).toMatchObject({ kind: 'empty-database', text: 'db0 has no keys.' });
    expect(table.kind === 'empty-database' ? table.actions.map((each) => each.element) : []).toEqual([
      'key.new@empty-state',
      'key.import@empty-state',
    ]);
  });

  it('has no New key on a read-only connection, nor Rename… and Delete key… in the menu of a row', () => {
    const readOnly = page({ connection: { id: cache.id, name: cache.name, readOnly: true, connected: true } });
    const shown = view(readOnly);
    expect(shown.toolbar.newKey).toBeUndefined();
    expect(shown.toolbar.more.map((each) => each.label)).toEqual(['Export keys…']);
    expect(shown.rowMenu.map((each) => each.label)).toEqual(['Open', 'Copy name', 'Export…', 'Pin']);
    expect(view(page()).rowMenu.map((each) => each.label)).toEqual([
      'Open',
      'Rename…',
      'Copy to…',
      'Set expiry…',
      'Make persistent',
      'Copy name',
      'Export…',
      'Pin',
      'Delete key…',
    ]);
  });

  it('disables Scan more with 100,000 keys loaded', () => {
    const names = Array.from({ length: 100_000 }, (_, index) => `k${String(index)}`);
    const shown = view(page({ scan: scanOf(names, 'stopped', 1_204_331) }));
    expect(shown.toolbar.scanMore).toMatchObject({
      enabled: false,
      tooltip: '100,000 keys loaded: narrow the pattern to see others.',
    });
  });

  it('counts on the status line as the scan goes', () => {
    const names = Array.from({ length: 500 }, (_, index) => `k${String(index)}`);
    expect(view(page({ scan: scanOf(names, 'stopped', 1_204_331) })).count).toBe('500 of 1,204,331 keys');
    const filtered = page({
      last: startingScan('orders:'),
      scan: { ...scanOf(['a'], 'stopped', 1_204_331), calls: 200 },
    });
    expect(view(filtered).count).toBe('1 key found · about 100,000 of 1,204,331 scanned');
    expect(view({ ...filtered, scan: scanOf(['a'], 'complete', 1_204_331) }).count).toBe('1 of 1,204,331 keys');
  });

  it('says what was not found: nothing matches, or nothing found yet', () => {
    const last = startingScan('orders:');
    expect(view(page({ last, scan: scanOf([], 'complete', 10) })).table).toEqual({
      kind: 'no-match',
      text: 'No keys match `orders:*`.',
    });
    const hashes = page({ last: { ...last, type: 'hash' }, scan: scanOf([], 'complete', 10) });
    expect(view(hashes).table).toMatchObject({ text: 'No keys of type Hash match `orders:*`.' });
    const notYet = page({ last, scan: { ...scanOf([], 'stopped', 1_204_331), calls: 200 } });
    expect(view(notYet).table).toMatchObject({
      kind: 'none-yet',
      text: 'No keys found among the about 100,000 scanned of 1,204,331.',
      scanMore: { enabled: true, element: 'key.scan@empty-state' },
    });
  });

  it('offers Connect while not connected, and Retry with the server message', () => {
    const offline = page({ connection: { id: cache.id, name: cache.name, readOnly: false, connected: false } });
    expect(view(offline).table).toMatchObject({ kind: 'not-connected', connect: { feature: 'connection.connect' } });
    expect(view(page({ error: 'NOPERM' })).table).toMatchObject({ kind: 'error', text: 'NOPERM' });
    expect(view(page()).table).toEqual({ kind: 'loading' });
  });
});
