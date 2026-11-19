import { describe, expect, it } from 'vitest';
import { schemaSummary } from '../../../src/features/schema/analyze';
import { share } from '../../../src/features/schema/share';
import { view } from '../../../src/features/schema/show';
import { int } from './context';

describe('schema.share', () => {
  it.each([
    [4, 4, '100%'],
    [3, 4, '75%'],
    [1, 3, '33%'],
    [2, 3, '67%'],
    [1, 10, '10%'],
    [1, 40, '2.5%'],
    [3, 1000, '0.3%'],
    [99, 1000, '9.9%'],
    [1, 10_000, '0%'],
    [9999, 10_000, '100%'],
    [994, 1000, '99%'],
    [0, 4, '0%'],
    [1, 0, ''],
  ])('writes %i of %i as %j', (count, of, written) => {
    expect(share(count, of)).toBe(written);
  });

  it('never writes more than one decimal, and no decimal at 10 or above', () => {
    for (let of = 1; of <= 400; of += 1) {
      for (let count = 0; count <= of; count += 1) {
        const written = share(count, of);
        expect(written).toMatch(/^\d+(\.\d)?%$/u);
        if (Number.parseFloat(written) >= 10) {
          expect(written).not.toContain('.');
        }
      }
    }
  });

  it('reads 100% for 995 of 1,000, its hover text still saying the 5 missing', () => {
    const documents = Array.from({ length: 1000 }, (_, index) => (index < 995 ? { a: int(index) } : { b: int(1) }));
    const [row] = view({
      size: 1000,
      expanded: [],
      running: false,
      invalidFilter: false,
      cancelled: false,
      view: false,
      result: { summary: schemaSummary(documents), outOf: 1000, milliseconds: 5 },
    }).rows;
    expect(row?.present).toMatchObject({ share: '100%', hint: 'In 995 of 1,000, missing in 5' });
  });

  it('gives the types of a field their shares of its values, not of the documents', () => {
    const summary = schemaSummary([{ qty: int(2) }, { qty: { $numberLong: '5' } }, {}, {}]);
    const [row] = view({
      size: 1000,
      expanded: [],
      running: false,
      invalidFilter: false,
      cancelled: false,
      view: false,
      result: { summary, outOf: 4, milliseconds: 5 },
    }).rows;
    expect(row?.present.share).toBe('50%');
    expect(row?.types.chips.map((chip) => chip.label)).toEqual(['int 50%', 'long 50%']);
  });
});
