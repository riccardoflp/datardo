import { describe, expect, it } from 'vitest';
import { readAfterSwitch, switchedMode } from '../../../src/features/query/mode';
import { resetQuery } from '../../../src/features/query/reset';
import { keptQuery, keptText, restoredQuery, restoredState } from '../../../src/features/query/restore';
import { emptyTexts, initialQuery, type QueryState } from '../../../src/features/query/types';
import type { RowKey } from '../../../src/features/table/types';

const paid: QueryState = {
  ...initialQuery,
  texts: { ...emptyTexts, filter: '{ status: "paid" }', sort: '{ total: -1 }' },
  ran: { ...emptyTexts, filter: '{ status: "paid" }', sort: '{ total: -1 }' },
  page: 3,
  pageSize: 100,
  error: { message: 'unknown operator: $foo', details: 'unknown operator: $foo', runAgain: true },
  invalid: ['filter'],
  selection: { keys: ['id:1' as RowKey], anchor: 'id:1' as RowKey },
};

describe('query.mode', () => {
  it('keeps the filter across a switch to Aggregate and back, and runs it again from the first page', () => {
    const aggregate = switchedMode(paid, 'aggregate');
    expect(aggregate.mode).toBe('aggregate');
    expect(readAfterSwitch(paid, 'aggregate')).toBe('aggregate.run');
    const find = switchedMode(aggregate, 'find');
    expect(find.texts.filter).toBe('{ status: "paid" }');
    expect(readAfterSwitch(aggregate, 'find')).toBe('query.run');
    expect(find.page).toBe(1);
  });

  it('shows page 1 of the other mode when switching on page 3', () => {
    expect(switchedMode(paid, 'aggregate').page).toBe(1);
  });

  it('clears the error line and ends the selection of rows', () => {
    const switched = switchedMode(paid, 'aggregate');
    expect(switched.error).toBeUndefined();
    expect(switched.invalid).toEqual([]);
    expect(switched.selection.keys).toEqual([]);
  });

  it('sends nothing when choosing the mode the tab is already in', () => {
    expect(switchedMode(paid, 'find')).toBe(paid);
    expect(readAfterSwitch(paid, 'find')).toBeUndefined();
  });

  it('is in Aggregate when a tab closed in Aggregate is restored', () => {
    const kept = keptText(keptQuery(switchedMode(paid, 'aggregate')));
    expect(restoredQuery(kept).mode).toBe('aggregate');
  });
});

describe('query.reset', () => {
  it('empties the fields and shows the first page', () => {
    const reset = resetQuery(paid);
    expect(reset.texts).toEqual(emptyTexts);
    expect(reset.page).toBe(1);
  });

  it('removes the outline of an invalid field and empties the error line', () => {
    const reset = resetQuery(paid);
    expect(reset.invalid).toEqual([]);
    expect(reset.error).toBeUndefined();
  });

  it('keeps the mode, the page size and whether the builder is open', () => {
    const reset = resetQuery({ ...paid, builderOpen: true });
    expect([reset.mode, reset.pageSize, reset.builderOpen]).toEqual(['find', 100, true]);
  });

  it('with everything already empty gives the empty query again, to run', () => {
    expect(resetQuery(initialQuery)).toEqual(initialQuery);
  });
});

describe('query.restore', () => {
  it('restores the texts, the page and the page size of a tab', () => {
    const kept = restoredQuery(keptText(keptQuery(paid)));
    expect(kept).toEqual({ mode: 'find', texts: paid.ran, page: 3, pageSize: 100, builderOpen: false });
    expect(restoredState(kept).ran).toEqual(paid.ran);
  });

  it('keeps the filter last run, not a text typed and never run', () => {
    const typed: QueryState = { ...paid, texts: { ...paid.texts, filter: '{ status: ' } };
    expect(restoredQuery(keptText(keptQuery(typed))).texts.filter).toBe('{ status: "paid" }');
  });

  it('opens a tab with nothing kept in Find with empty fields, page 1 and page size 50', () => {
    for (const kept of [undefined, null, '', 'not json', '[]', {}]) {
      expect(restoredQuery(kept)).toEqual({
        mode: 'find',
        texts: emptyTexts,
        page: 1,
        pageSize: 50,
        builderOpen: false,
      });
    }
  });

  it('opens kept data with a page size of 37 with page size 50', () => {
    expect(restoredQuery({ pageSize: 37, page: 2 })).toMatchObject({ pageSize: 50, page: 2 });
  });

  it('gives each unusable part its default', () => {
    expect(
      restoredQuery({ mode: 'chart', texts: { filter: 7, sort: '{ a: 1 }' }, page: -2, builderOpen: 'yes' }),
    ).toEqual({
      mode: 'find',
      texts: { ...emptyTexts, sort: '{ a: 1 }' },
      page: 1,
      pageSize: 50,
      builderOpen: false,
    });
  });

  it('keeps whether the builder was open', () => {
    expect(restoredQuery(keptText(keptQuery({ ...paid, builderOpen: true }))).builderOpen).toBe(true);
  });
});
