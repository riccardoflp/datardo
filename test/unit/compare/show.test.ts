import { describe, expect, it } from 'vitest';
import { fieldDiff } from '../../../src/features/compare/field-diff';
import type { ShownResult } from '../../../src/features/compare/page/rows';
import { parse as parseRead } from '../../../src/features/compare/read';
import type { DetailEntry } from '../../../src/features/compare/read-details';
import { pageShows, plan, tabTitle, view, type ComparePageState } from '../../../src/features/compare/show';
import { otherSide, type CompareCounts, type CompareResult, type SideInfo } from '../../../src/features/compare/types';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import {
  contextWith,
  double,
  int,
  leftSide,
  local,
  planOf,
  production,
  productionReadOnly,
  rightSide,
} from './context';

const left: SideInfo = { ...leftSide, connection: local.id, connectionName: 'Local' };
const right: SideInfo = { ...rightSide, connection: production.id, connectionName: 'Production' };
const options = { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true };

function entries(kind: DetailEntry['kind'], count: number, from = 0): readonly DetailEntry[] {
  return Array.from({ length: count }, (_, index): DetailEntry => {
    const id = int(from + index);
    return kind === 'different'
      ? { kind, id, rows: [{ path: 'status', left: 'new', right: 'paid' }], summary: 'status' }
      : { kind, id, preview: `{ _id: ${String(from + index)} }` };
  });
}

function state(more: Partial<ComparePageState> = {}): ComparePageState {
  return { left, right, choosing: { saved: [local, production] }, options, ...more };
}

function result(counts: CompareCounts, shown: readonly DetailEntry[], filtered = false): ShownResult {
  return { counts, entries: shown, milliseconds: 1400, filtered };
}

const found = result({ identical: 1180, different: 12, onlyLeft: 3, onlyRight: 9 }, [
  ...entries('different', 12),
  ...entries('only-left', 3, 100),
  ...entries('only-right', 9, 200),
]);

describe('compare.show', () => {
  it('opens on shop.orders of Local a tab titled Compare: orders with Connection at Local, same connection', () => {
    const outcome = plan(contextWith('compare.show'), {});
    expect(JSON.stringify(planOf(outcome))).toContain(JSON.stringify(pageShows(left)));
    expect(pageShows(left)).toMatchObject({ kind: 'page', page: 'compare', title: 'Compare: orders' });
    const shown = view({ left, choosing: { saved: [production, local], connection: local.id }, options });
    expect(shown.title).toBe('Compare: orders');
    expect(shown.left).toEqual({ label: 'Left', namespace: 'shop.orders', connectionName: 'Local' });
    expect(shown.right.connection.chosen).toBe(local.id);
    expect(shown.right.connection.choices[0]).toEqual({
      connection: local.id,
      name: 'Local',
      notes: ['same connection'],
    });
    expect(shown.options.enabled).toBe(false);
    expect(shown.counts).toBeUndefined();
  });

  it('marks a read-only connection in Connection', () => {
    const shown = view({ left, choosing: { saved: [local, productionReadOnly] }, options });
    expect(shown.right.connection.choices.map((each) => each.notes)).toEqual([['same connection'], ['read-only']]);
  });

  it('titles the tab Compare: orders ↔ orders_2023 when the right collection has another name', () => {
    expect(tabTitle(left, { ...right, collection: 'orders_2023' })).toBe('Compare: orders ↔ orders_2023');
    expect(tabTitle(left, right)).toBe('Compare: orders');
  });

  it('lists neither orders itself nor system.views on the same connection and database', () => {
    const shown = view({
      left,
      choosing: {
        saved: [local],
        connection: local.id,
        databases: ['admin', 'shop', 'local', 'config'],
        database: 'shop',
        collections: [
          { name: 'system.views', view: false },
          { name: 'orders', view: false },
          { name: 'recent', view: true },
          { name: 'customers', view: false },
        ],
      },
      options,
    });
    expect(shown.right.database?.choices).toEqual(['shop', 'admin']);
    expect(shown.right.collection?.choices.map((each) => each.name)).toEqual(['customers', 'recent']);
  });

  it('says Local › shop has no other collection to compare with.', () => {
    const shown = view({
      left,
      choosing: {
        saved: [local],
        connection: local.id,
        databases: ['shop'],
        database: 'shop',
        collections: [{ name: 'orders', view: false }],
      },
      options,
    });
    expect(shown.right.empty).toBe('Local › shop has no other collection to compare with.');
  });

  it('shows the counts in the chips and 24 differences in the summary', () => {
    const shown = view(state({ result: found }));
    expect(shown.counts?.chips.map((chip) => chip.label)).toEqual([
      '1,180 identical',
      '12 different',
      '3 only left',
      '9 only right',
    ]);
    expect(shown.counts?.summary).toBe('24 differences · 1.4 s');
    expect(shown.rows).toHaveLength(24);
  });

  it('says The collections are the same and No differences., and for the filter when there is one', () => {
    const same = view(state({ result: result({ identical: 5, different: 0, onlyLeft: 0, onlyRight: 0 }, []) }));
    expect(same.counts?.summary).toBe('The collections are the same · 1.4 s');
    expect(same.empty).toBe('No differences.');
    expect(same.bulk).toEqual([]);
    const filtered = result({ identical: 5, different: 0, onlyLeft: 0, onlyRight: 0 }, [], true);
    expect(view(state({ result: filtered })).counts?.summary).toBe(
      'The collections are the same for the filter · 1.4 s',
    );
  });

  it('lists only the rows Only left while the chip only left is pressed, and all of them when it is not', () => {
    const pressed = view(state({ result: found, chip: 'only-left' }));
    expect(pressed.rows.map((row) => row.kindLabel)).toEqual(['Only left', 'Only left', 'Only left']);
    expect(pressed.counts?.chips.find((chip) => chip.kind === 'only-left')?.pressed).toBe(true);
    expect(view(state({ result: found })).rows).toHaveLength(24);
  });

  it('says Nothing of this kind. for a chip whose rows are not shown', () => {
    const counts = { identical: 0, different: 1, onlyLeft: 0, onlyRight: 0 };
    expect(view(state({ result: result(counts, entries('different', 1)), chip: 'only-right' })).empty).toBe(
      'Nothing of this kind.',
    );
  });

  it('lists 300 rows of 1,204 different documents and says the buttons apply to all of them', () => {
    const many = result({ identical: 0, different: 1204, onlyLeft: 0, onlyRight: 0 }, entries('different', 300));
    const shown = view(state({ result: many }));
    expect(shown.rows).toHaveLength(300);
    expect(shown.shown).toBe('Showing the first 300 of 1,204; the buttons above apply to all of them.');
  });

  it('shows the error of a comparison under the options', () => {
    const message = 'orders has more than 1,000,000 documents to compare: narrow them with a filter.';
    expect(view(state({ error: message })).error).toBe(message);
  });

  it('keeps the previous result listed with Comparison cancelled.', () => {
    const shown = view(state({ result: found, message: 'Comparison cancelled.' }));
    expect(shown.message).toBe('Comparison cancelled.');
    expect(shown.rows).toHaveLength(24);
  });

  it('disables the options, ⇄ and the writes while a comparison runs, and offers Cancel', () => {
    const shown = view(state({ result: found, progress: 'Reading the left side… 12,000 documents' }));
    expect(shown.progress).toBe('Reading the left side… 12,000 documents');
    expect(shown.options.enabled).toBe(false);
    expect(shown.swap.enabled).toBe(false);
    expect(shown.compare).toEqual({ label: 'Cancel', enabled: true });
    expect(shown.bulk.every((each) => !each.enabled && each.hint === 'Wait for the comparison to finish.')).toBe(true);
    expect(shown.rows[0]?.buttons.every((each) => !each.enabled)).toBe(true);
  });

  it('moves 1 against 1.0 from identical to different when Compare numbers by value is unticked', () => {
    const replies = [[{ _id: int(1), n: int(1) }], [{ _id: int(1), n: double('1.0') }]];
    const read = (numbersByValue: boolean) =>
      parseRead(replies, {
        left: leftSide,
        right: rightSide,
        options: { ...options, numbersByValue },
      }) as CompareResult;
    expect(read(true).counts).toMatchObject({ identical: 1, different: 0 });
    expect(read(false).counts).toMatchObject({ identical: 0, different: 1 });
  });

  it('shows the fields of a row Different and the document of a row Only left in the inspector island', () => {
    const difference = fieldDiff(
      { _id: int(1), status: 'new' },
      { _id: int(1), status: 'paid' },
      { ...options, ignore: [] },
    );
    const different: DetailEntry = { kind: 'different', id: int(1), ...difference };
    const onlyLeft: DetailEntry = { kind: 'only-left', id: int(4), preview: '{ _id: 4 }' };
    const counts = { identical: 0, different: 1, onlyLeft: 1, onlyRight: 0 };
    const shown = result(counts, [different, onlyLeft]);
    expect(view(state({ result: shown, selected: { id: int(1) } })).inspector).toMatchObject({
      kind: 'different',
      rows: [{ kind: 'field', path: 'status', left: { text: '"new"' }, right: { text: '"paid"' } }],
    });
    const document: Json = { _id: int(4), only: 'left' };
    const one = view(state({ result: shown, selected: { id: int(4), read: { kind: 'document', document } } }));
    expect(one.inspector).toMatchObject({ kind: 'one-side', missing: 'Missing on the right side' });
    expect(one.inspector?.kind === 'one-side' && one.inspector.document).toContain('only: "left"');
  });

  it('disables → Right, Delete for the right and Make right like left… on a read-only connection, saying why', () => {
    const readOnly: SideInfo = { ...right, readOnlyWhy: 'read-only' };
    const shown = view(state({ right: readOnly, result: found }));
    const why = 'The connection Production is read-only.';
    expect(shown.right.side?.badge).toEqual({ text: 'read-only', hint: why });
    expect(shown.bulk.map((each) => [each.label, each.enabled, each.hint])).toEqual([
      ['Make right like left…', false, why],
      [
        'Make left like right…',
        true,
        'Insert the documents missing on the left, replace the different ones (and optionally delete those only on the left)',
      ],
    ]);
    const toRight = shown.rows.flatMap((row) => row.buttons.filter((each) => each.to === 'right'));
    expect(toRight.map((each) => each.label)).toContain('Delete');
    expect(toRight.every((each) => !each.enabled && each.hint === why)).toBe(true);
  });

  it('puts shop.orders of Local on the right after ⇄, and the documents only left become only right', () => {
    const replies = [[{ _id: int(1) }, { _id: int(4) }], [{ _id: int(1) }]];
    const before = parseRead(replies, { left: leftSide, right: rightSide, options }) as CompareResult;
    const after = parseRead([replies[1], replies[0]], { left: rightSide, right: leftSide, options }) as CompareResult;
    expect(before.differences).toEqual([{ id: int(4), kind: 'only-left' }]);
    expect(after.differences).toEqual([{ id: int(4), kind: 'only-right' }]);
    const swapped = view(state({ left: right, right: left }));
    expect(swapped.right.side).toMatchObject({ namespace: 'shop.orders', connectionName: 'Local' });
    expect(otherSide('left')).toBe('right');
  });

  it('opens nothing without a collection', () => {
    const context = contextWith('compare.show');
    const none = plan({ ...context, target: { kind: 'connection', connection: connectionId('c-local') } }, {});
    expect(planOf(none).steps).toEqual([]);
  });
});
