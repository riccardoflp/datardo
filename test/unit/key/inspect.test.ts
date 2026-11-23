import { describe, expect, it } from 'vitest';
import type { InspectState } from '../../../src/features/key/inspect';
import { parse, request, view } from '../../../src/features/key/inspect';
import { settleMs } from '../../../src/features/key/details';
import { hexOf } from '../../../src/features/key/types';
import type { ReadRequest } from '../../../src/shared/feature';
import { cache, keyContext, name, onKey, recordedReplies, requestWords } from './context';

const noon = new Date(2026, 10, 18, 12, 0, 0, 0).getTime();

function loaded(key: Parameters<typeof view>[0]['read'], more: Partial<InspectState> = {}): InspectState {
  return { name: name('user:7'), readOnly: false, read: key, now: noon, ...more };
}

const values = (state: InspectState): Record<string, string> =>
  Object.fromEntries(view(state).lines.map((line) => [line.label, line.value]));
const buttons = (state: InspectState): string[] => [
  view(state).copyName.label,
  ...view(state).lines.flatMap((line) => (line.buttons ?? []).map((each) => each.label)),
  ...view(state).buttons.map((each) => each.label),
];

describe('key.inspect', () => {
  it('reads the hash user:7 in one pipeline and shows Hash, Persistent, its size and listpack', () => {
    const asked = request(keyContext('key.inspect', onKey('user:7')), {
      connection: cache.id,
      database: 15,
      key: hexOf(name('user:7')),
    });
    expect((asked as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords)).toEqual([
      'TYPE user:7',
      'PTTL user:7',
      'MEMORY USAGE user:7',
      'OBJECT ENCODING user:7',
    ]);
    const key = parse(recordedReplies('inspect-hash'));
    expect(key).toEqual({ type: 'hash', timeLeft: null, size: 88, encoding: 'listpack' });
    const state = loaded({ kind: 'loaded', key: key as Exclude<typeof key, 'gone'>, readAt: noon });
    expect(values(state)).toEqual({ Type: 'Hash', Expiry: 'Persistent', Size: '88 B', Encoding: 'listpack' });
    expect(view(state).value).toEqual({ kind: 'value' });
  });

  it('shows the name and the labels of the lines at once while the key is read, so that the island does not grow', () => {
    const reading = loaded({ kind: 'loading' });
    expect(view(reading).loading).toBe(true);
    expect(values(reading)).toEqual({ Type: '', Expiry: '', Size: '', Encoding: '' });
  });

  it('counts the time left again every second from the date read', () => {
    const key = { type: 'string', timeLeft: 7_500_000, size: 64 } as const;
    const state = loaded({ kind: 'loaded', key, readAt: noon });
    expect(values(state)['Expiry']).toBe('in 2 h 5 min · 2026-11-18 14:05:00');
    expect(values({ ...state, now: noon + 1000 })['Expiry']).toBe('in 2 h 4 min · 2026-11-18 14:05:00');
  });

  it('reads only after the selection settles for 150 ms', () => {
    expect(settleMs).toBe(150);
  });

  it('shows of a key deleted meanwhile only that it no longer exists', () => {
    expect(parse(recordedReplies('inspect-gone'))).toBe('gone');
    const shown = view(loaded({ kind: 'gone' }, { name: name('orders:42') }));
    expect(shown.message).toBe('The key orders:42 no longer exists: it was deleted or it expired.');
    expect(shown.lines).toEqual([]);
    expect(shown.buttons).toEqual([]);
  });

  it('shows the type, expiry, size and encoding of a ReJSON-RL key, and that its value is not shown', () => {
    const key = { type: 'ReJSON-RL', timeLeft: null, size: 1228, encoding: 'raw' } as const;
    const state = loaded({ kind: 'loaded', key, readAt: noon });
    expect(values(state)).toEqual({ Type: 'ReJSON-RL', Expiry: 'Persistent', Size: '1.2 KB', Encoding: 'raw' });
    expect(view(state).value).toEqual({
      kind: 'module',
      text: 'Datardo does not show values of the type ReJSON-RL yet.',
    });
  });

  it('has only Copy name and Open in a tab on a read-only connection', () => {
    const key = { type: 'hash', timeLeft: 90_000, size: 88 } as const;
    const state = loaded({ kind: 'loaded', key, readAt: noon }, { readOnly: true });
    expect(buttons(state)).toEqual(['Copy name', 'Open in a tab']);
    expect(buttons({ ...state, readOnly: false })).toEqual([
      'Copy name',
      'Set expiry…',
      'Make persistent',
      'Open in a tab',
      'Rename…',
      'Copy to…',
      'Delete key…',
    ]);
  });

  it('shows Persistent once read again after Make persistent', () => {
    const before = loaded({ kind: 'loaded', key: { type: 'hash', timeLeft: 90_000, size: 88 }, readAt: noon });
    const after = loaded({ kind: 'loaded', key: { type: 'hash', timeLeft: null, size: 88 }, readAt: noon });
    expect(values(before)['Expiry']).not.toBe('Persistent');
    expect(values(after)['Expiry']).toBe('Persistent');
    expect(buttons(after)).not.toContain('Make persistent');
  });

  it('writes — for a line the server refused', () => {
    const [refused] = recordedReplies('unknown-command');
    const key = parse([name('hash'), -1, refused, refused]);
    expect(key).toEqual({ type: 'hash', timeLeft: null, size: 'refused' });
    const state = loaded({ kind: 'loaded', key: key as Exclude<typeof key, 'gone'>, readAt: noon });
    expect(values(state)).toMatchObject({ Size: '—', Encoding: '—' });
  });
});
