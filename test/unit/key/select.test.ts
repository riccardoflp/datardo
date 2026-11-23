import { describe, expect, it } from 'vitest';
import type { KeySelection } from '../../../src/features/key/select';
import { noSelection, selectedInOrder, selectionAfter, selectionFound, view } from '../../../src/features/key/select';
import { sortedKeys } from '../../../src/features/key/sort';
import { name } from './context';

const rows = Array.from({ length: 10 }, (_, index) => name(`k${String(9 - index)}`));
const text = (names: readonly Uint8Array[]): string[] => names.map((each) => new TextDecoder().decode(each));

function clicked(...gestures: Parameters<typeof selectionAfter>[1][]): KeySelection {
  return gestures.reduce((selection, gesture) => selectionAfter(selection, gesture, rows), noSelection);
}

describe('key.select', () => {
  it('selects six keys with a click and Shift and a click five rows below, and shows 6 keys selected', () => {
    const selection = clicked({ kind: 'click', key: name('k8') }, { kind: 'extend', key: name('k3') });
    expect(text(selectedInOrder(selection, rows))).toEqual(['k8', 'k7', 'k6', 'k5', 'k4', 'k3']);
    expect(view({ selection, rows, readOnly: false }).bar?.label).toBe('6 keys selected');
  });

  it('keeps the same six keys selected when sorted by Key', () => {
    const selection = clicked({ kind: 'click', key: name('k8') }, { kind: 'extend', key: name('k3') });
    const sorted = sortedKeys(
      rows.map((each) => ({ name: each })),
      'key',
      'ascending',
    ).map((row) => row.name);
    expect(text(selectedInOrder(selection, sorted))).toEqual(['k3', 'k4', 'k5', 'k6', 'k7', 'k8']);
  });

  it('selects the 500 keys loaded with Ctrl+A', () => {
    const loaded = Array.from({ length: 500 }, (_, index) => name(`k${String(index)}`));
    const selection = selectionAfter(noSelection, { kind: 'all' }, loaded);
    expect(view({ selection, rows: loaded, readOnly: false }).count).toBe(500);
  });

  it('keeps selected after Refresh the keys the first run finds, and a key deleted meanwhile leaves it', () => {
    const selection = clicked({ kind: 'click', key: name('k8') }, { kind: 'toggle', key: name('k2') });
    expect(selection.keys.size).toBe(2);
    expect(selectionFound(selection, rows)).toBe(selection);
    const found = selectionFound(
      selection,
      rows.filter((row) => text([row])[0] !== 'k8'),
    );
    expect(text(selectedInOrder(found, rows))).toEqual(['k2']);
    expect(found.anchor).toBe(selection.anchor);
    expect(selectionFound(selection, [])).toEqual(noSelection);
  });

  it('clears the selection with Esc', () => {
    const selection = clicked({ kind: 'click', key: name('k8') }, { kind: 'toggle', key: name('k2') });
    expect(selectionAfter(selection, { kind: 'clear' }, rows)).toEqual(noSelection);
  });

  it('shows one key in the inspector island without a bar, and 3 selected with three', () => {
    const one = clicked({ kind: 'click', key: name('k8') });
    expect(view({ selection: one, rows, readOnly: false })).toMatchObject({
      count: 1,
      inspector: { kind: 'one', key: name('k8') },
    });
    expect(view({ selection: one, rows, readOnly: false }).bar).toBeUndefined();
    const three = clicked({ kind: 'click', key: name('k8') }, { kind: 'extend', key: name('k6') });
    expect(view({ selection: three, rows, readOnly: false }).inspector).toEqual({
      kind: 'several',
      title: '3 selected',
      line: 'Select one key to see its value.',
    });
    expect(view({ selection: noSelection, rows, readOnly: false }).inspector).toEqual({
      kind: 'none',
      title: 'Nothing selected',
      line: 'Select a key to see its value here.',
    });
  });

  it('has Copy names and Export… only, besides Clear, on a read-only connection', () => {
    const three = clicked({ kind: 'click', key: name('k8') }, { kind: 'extend', key: name('k6') });
    expect(view({ selection: three, rows, readOnly: true }).bar?.entries.map((entry) => entry.label)).toEqual([
      'Copy names',
      'Export…',
      'Clear',
    ]);
    expect(view({ selection: three, rows, readOnly: false }).rowMenu?.map((entry) => entry.label)).toEqual([
      'Copy 3 names',
      'Export 3 keys…',
      'Delete 3 keys…',
    ]);
  });
});
