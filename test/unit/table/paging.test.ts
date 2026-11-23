import { describe, expect, it } from 'vitest';
import { pageWindow } from '../../../src/features/table/page-window';
import { countAgain, view as pagingView, type PagingState } from '../../../src/features/table/paging';
import { sortAfterClick, sortDirections } from '../../../src/features/table/sort';

const count = 1204;

describe('table.page-window', () => {
  it('gives the numbers of each worked example', () => {
    expect(pageWindow({ page: 1, pageSize: 50, skip: 0, count, received: 50 })).toMatchObject({
      skip: 0,
      limit: 50,
      total: 1204,
      first: 1,
      last: 50,
    });
    expect(pageWindow({ page: 3, pageSize: 50, skip: 0, count, received: 50 })).toMatchObject({
      skip: 100,
      limit: 50,
      first: 101,
      last: 150,
    });
    expect(pageWindow({ page: 1, pageSize: 50, skip: 1000, count, received: 50 })).toMatchObject({
      skip: 1000,
      limit: 50,
      total: 204,
    });
    expect(pageWindow({ page: 3, pageSize: 50, skip: 0, limit: 120, count, received: 20 })).toMatchObject({
      skip: 100,
      limit: 20,
      total: 120,
      first: 101,
      last: 120,
      after: false,
    });
    expect(pageWindow({ page: 2, pageSize: 50, skip: 10, limit: 500, count, received: 50 })).toMatchObject({
      skip: 60,
      limit: 50,
      total: 500,
      first: 51,
      last: 100,
    });
    expect(pageWindow({ page: 1, pageSize: 50, skip: 2000, count, received: 0 })).toMatchObject({
      total: 0,
      first: 0,
      last: 0,
    });
  });

  it('decides the page after from the documents received when the count is unknown', () => {
    expect(pageWindow({ page: 1, pageSize: 50, skip: 0, received: 50 }).after).toBe(true);
    expect(pageWindow({ page: 1, pageSize: 50, skip: 0, received: 37 }).after).toBe(false);
  });

  it('never sends a limit of 0', () => {
    expect(pageWindow({ page: 4, pageSize: 50, skip: 0, limit: 120 })).toMatchObject({ page: 3, limit: 20 });
  });
});

function paging(changes: Partial<PagingState>): PagingState {
  return {
    page: 1,
    pageSize: 50,
    skip: 0,
    received: 50,
    count: { kind: 'counted', count, estimated: false },
    ...changes,
  };
}

describe('table.paging', () => {
  it('reads the range of the first and of the last page', () => {
    expect(pagingView(paging({})).range).toBe('1–50 of 1,204');
    expect(pagingView(paging({ page: 25, received: 4 })).range).toBe('1,201–1,204 of 1,204');
  });

  it('reads 0–0 of 0, … while counting and ? when it could not be counted', () => {
    expect(pagingView(paging({ received: 0, count: { kind: 'counted', count: 0, estimated: false } })).range).toBe(
      '0–0 of 0',
    );
    expect(pagingView(paging({ count: { kind: 'pending' } })).range).toBe('1–50 of …');
    expect(pagingView(paging({ count: { kind: 'failed' } })).range).toBe('1–50 of ?');
  });

  it('keeps the total counted before, dimmed, while it is counted again', () => {
    const again = countAgain({ kind: 'counted', count, estimated: false });
    expect(again).toEqual({ kind: 'pending', last: { kind: 'counted', count, estimated: false } });
    expect(countAgain(again)).toEqual(again);
    expect(countAgain({ kind: 'failed' })).toEqual({ kind: 'pending' });
    const shown = pagingView(paging({ count: again }));
    expect(shown.range).toBe('1–50 of 1,204');
    expect(shown.total).toMatchObject({ text: '1,204', counting: true });
    expect(pagingView(paging({})).total.counting).toBe(false);
    expect(pagingView(paging({ count: again, received: 37 })).next.enabled).toBe(false);
  });

  it('disables Previous page on the first page and Next page after the last document', () => {
    const first = pagingView(paging({}));
    expect(first.previous.enabled).toBe(false);
    expect(first.next).toMatchObject({ enabled: true, page: 2 });
    expect(pagingView(paging({ page: 25, received: 4 })).next.enabled).toBe(false);
    expect(pagingView(paging({ count: { kind: 'pending' }, received: 37 })).next.enabled).toBe(false);
  });

  it('offers the page sizes and the tooltip of an estimated total', () => {
    const shown = pagingView(paging({ count: { kind: 'counted', count, estimated: true } }));
    expect(shown.pageSize.choices).toEqual([10, 20, 50, 100, 200, 500]);
    expect(shown.total.tip).toBe('Estimated: the count the collection keeps of itself. Click to count exactly.');
  });
});

describe('table.sort', () => {
  it('gives the sort of each worked example', () => {
    expect(sortAfterClick('', 'total')).toBe('{ total: 1 }');
    expect(sortAfterClick('{ total: 1 }', 'total')).toBe('{ total: -1 }');
    expect(sortAfterClick('{ total: -1 }', 'total')).toBe('');
    expect(sortAfterClick('{ status: 1, total: -1 }', 'createdAt')).toBe('{ createdAt: 1 }');
    expect(sortAfterClick('{ status: 1, total: -1 }', 'total')).toBe('');
    expect(sortAfterClick('{ status: ', 'total')).toBe('{ total: 1 }');
    expect(sortAfterClick('', 'address.city')).toBe('{ "address.city": 1 }');
  });

  it('marks every field of the sort with its direction', () => {
    expect([...sortDirections('{ status: 1, total: -1 }')]).toEqual([
      ['status', 1],
      ['total', -1],
    ]);
  });
});
