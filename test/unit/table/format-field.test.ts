import { describe, expect, it } from 'vitest';
import {
  autoMode,
  colorOfValue,
  fieldOnPage,
  legendOfRule,
  valueColors,
  valuesOfField,
} from '../../../src/features/table/format-field';
import { byField, documents, value } from './formatting';

describe('table.format-field', () => {
  it('decides auto from the values of the page', () => {
    expect(autoMode([true, false])).toBe('boolean');
    expect(autoMode(['1', 'NumberLong(5)', 'NumberDecimal("2.5")'].map(value))).toBe('scale');
    expect(autoMode(['ISODate("2024-01-01")', 'ISODate("2025-01-01")'].map(value))).toBe('scale');
    expect(autoMode(['1', 'ISODate("2024-01-01")'].map(value))).toBe('values');
    expect(autoMode(['"a"', '1'].map(value))).toBe('values');
    expect(autoMode([])).toBe('values');
  });

  it('places a value between the ends 0 and 200 of one color', () => {
    const rule = byField('r', 'n', { mode: 'scale', min: 0, max: 200, scale: { to: 'orange' } });
    const page = fieldOnPage(rule, []);
    expect(colorOfValue(rule, page, value('50'))).toEqual({ color: 'orange', strength: 0.25 });
    expect(colorOfValue(rule, page, value('900'))).toEqual({ color: 'orange', strength: 1 });
    expect(colorOfValue(rule, page, value('-5'))).toEqual({ color: 'orange', strength: 0 });
    expect(colorOfValue(rule, page, value('"abc"'))).toBeUndefined();
  });

  it('goes from red through yellow to green between 0 and 100', () => {
    const rule = byField('r', 'n', { mode: 'scale', min: 0, max: 100, scale: { from: 'red', to: 'green' } });
    const page = fieldOnPage(rule, []);
    expect(colorOfValue(rule, page, value('25'))).toEqual({
      color: 'red',
      toward: { color: 'yellow', share: 0.5 },
      strength: 0.6,
    });
    expect(colorOfValue(rule, page, value('100'))).toEqual({ color: 'green', strength: 0.6 });
    expect(colorOfValue(rule, page, value('0'))).toEqual({ color: 'red', strength: 0.6 });
  });

  it('takes the ends it does not have from the page', () => {
    const page = documents('{ n: 10 }', '{ n: 30 }', '{ n: null }', '{ m: 1 }');
    expect(fieldOnPage(byField('r', 'n'), page)).toEqual({ mode: 'scale', min: 10, max: 30 });
    expect(fieldOnPage(byField('r', 'n', { min: 0, max: 100 }), page)).toEqual({ mode: 'scale', min: 0, max: 100 });
    expect(fieldOnPage(byField('r', 'd'), documents('{ d: ISODate("1970-01-01T00:00:01Z") }'))).toEqual({
      mode: 'scale',
      min: 1000,
      max: 1000,
      dates: true,
    });
  });

  it('gives a pinned value its color, which no other value takes', () => {
    const rule = byField('r', 'place', { mode: 'values', pinned: [{ value: '"home"', color: 'green' }] });
    const page = fieldOnPage(rule, []);
    expect(colorOfValue(rule, page, value('"home"'))).toEqual({ color: 'green', strength: 1 });
    const others = Array.from({ length: 200 }, (_each, index) => colorOfValue(rule, page, `place ${String(index)}`));
    expect(others.some((paint) => paint?.color === 'green')).toBe(false);
  });

  it('colors with shades of gray, and outlines a value pinned to gray', () => {
    const rule = byField('r', 'place', {
      mode: 'values',
      palette: 'gray',
      pinned: [
        { value: '"home"', color: 'green' },
        { value: '"away"', color: 'gray' },
      ],
    });
    const page = fieldOnPage(rule, []);
    const others = ['"a"', '"b"', '"c"', '"d"'].map((each) => colorOfValue(rule, page, value(each)));
    expect(others.every((paint) => paint?.color === 'gray' && paint.strength !== undefined)).toBe(true);
    expect(colorOfValue(rule, page, value('"home"'))).toEqual({ color: 'green', strength: 1 });
    expect(colorOfValue(rule, page, value('"away"'))).toEqual({ color: 'gray', strength: 1, outlined: true });
  });

  it('colors true green and false red, swapped by the scale from green to red', () => {
    const rule = byField('r', 'flag');
    const page = fieldOnPage(rule, documents('{ flag: true }', '{ flag: false }'));
    expect(colorOfValue(rule, page, true)).toEqual({ color: 'green', strength: 0.6 });
    expect(colorOfValue(rule, page, false)).toEqual({ color: 'red', strength: 0.6 });
    expect(colorOfValue(rule, page, value('1'))).toBeUndefined();
    const swapped = { ...rule, scale: { from: 'green', to: 'red' } } as const;
    expect(colorOfValue(swapped, page, true)?.color).toBe('red');
  });

  it('lists the pinned values first, then the values of the page by count', () => {
    const rule = byField('r', 'status', { mode: 'values', pinned: [{ value: '"gone"', color: 'red' }] });
    const legend = legendOfRule(
      rule,
      documents('{ status: "ok" }', '{ status: "ok" }', '{ status: "failed" }', '{ other: 1 }'),
    );
    expect(legend.entries.map(({ text, count, pinned }) => [text, count, pinned])).toEqual([
      ['"gone"', 0, true],
      ['"ok"', 2, false],
      ['"failed"', 1, false],
    ]);
    expect(legend.colors).toBe(9);
    expect(legend.repeats).toBeUndefined();
  });

  it('knows 5 and NumberLong(5) as two values, each with its own color', () => {
    const rule = byField('r', 'n', { mode: 'values' });
    const legend = legendOfRule(rule, documents('{ n: 5 }', '{ n: NumberLong(5) }'));
    expect(legend.entries.map((entry) => entry.text)).toEqual(['5', 'NumberLong(5)']);
    expect(legend.entries[0]?.paint.color).not.toBe(legend.entries[1]?.paint.color);
  });

  it('gives the text "failed" the same color in two collections and on two pages', () => {
    const first = byField('a', 'status', { mode: 'values' });
    const second = byField('b', 'state', { mode: 'values' });
    const one = colorOfValue(first, fieldOnPage(first, documents('{ status: "ok" }')), 'failed');
    const two = colorOfValue(second, fieldOnPage(second, documents('{ state: 1 }', '{ state: "x" }')), 'failed');
    expect(one).toEqual(two);
    expect(valueColors).toContain(one?.color);
  });

  it('says when the colors repeat, and lists 60 values at most', () => {
    const page = Array.from({ length: 70 }, (_each, index) => value(`{ n: "v${String(index)}" }`));
    const legend = legendOfRule(byField('r', 'n'), page as never);
    expect(legend.entries).toHaveLength(60);
    expect(legend.repeats).toBe('n has 70 values on this page: the colors repeat.');
  });

  it('takes one value per element through arrays, and an array that is the value as one', () => {
    const [document] = documents(
      '{ items: [ { qty: 1 }, { qty: null }, { other: 2 }, { qty: 3 } ], tags: ["a", "b"] }',
    );
    expect(valuesOfField(document!, 'items.qty')).toEqual([value('1'), value('3')]);
    expect(valuesOfField(document!, 'tags')).toEqual([['a', 'b']]);
  });

  it('gives a missing or null value no color in any mode', () => {
    for (const mode of ['boolean', 'scale', 'values'] as const) {
      const rule = byField('r', 'n', { mode, min: 0, max: 1 });
      expect(colorOfValue(rule, fieldOnPage(rule, []), undefined)).toBeUndefined();
      expect(colorOfValue(rule, fieldOnPage(rule, []), null)).toBeUndefined();
    }
  });
});
