import { describe, expect, it } from 'vitest';
import { rank, type Rankable } from '../../../src/features/palette/rank';

interface Named extends Rankable {
  readonly label: string;
}

function candidate(label: string, name: string, context: string, more: Partial<Rankable> = {}): Named {
  return { label, name, context, open: false, recent: false, current: false, ...more };
}

/** The candidates of the card's worked examples. */
function candidates(ordersOfShop: Partial<Rankable> = { open: true, recent: true }): readonly Named[] {
  return [
    candidate('orders of shop', 'orders', 'Local / shop', { current: true, ...ordersOfShop }),
    candidate('order_items', 'order_items', 'Local / shop', { current: true }),
    candidate('users', 'users', 'Local / shop', { current: true }),
    candidate('userOrders', 'userOrders', 'Local / shop', { current: true }),
    candidate('orders of crm', 'orders', 'Local / crm', { current: true }),
    candidate('Monitor', 'Monitor', 'Local', { current: true }),
    candidate('Zoom in', 'Zoom in', ''),
    candidate('Zoom out', 'Zoom out', ''),
    candidate('Reset zoom', 'Reset zoom', ''),
  ];
}

function ranked(typed: string, list: readonly Named[] = candidates()): readonly [string, number][] {
  const terms = typed.split(' ').filter((term) => term !== '');
  return rank(terms, list).map((each) => [each.candidate.label, each.score]);
}

describe('palette.rank', () => {
  it('each worked example gives exactly that list in that order', () => {
    expect(ranked('ord')).toEqual([
      ['orders of shop', 120],
      ['orders of crm', 95],
      ['order_items', 95],
      ['userOrders', 85],
    ]);
    expect(ranked('oi')).toEqual([['order_items', 55]]);
    expect(ranked('us ord')).toEqual([['userOrders', 175]]);
    expect(ranked('crm ord')).toEqual([['orders of crm', 105]]);
    expect(ranked('usr')).toEqual([
      ['users', 35],
      ['userOrders', 35],
    ]);
    expect(ranked('users')).toEqual([
      ['users', 105],
      ['userOrders', 35],
    ]);
    expect(ranked('mon')).toEqual([['Monitor', 95]]);
    const commands = candidates().filter((each) => each.context === '');
    expect(ranked('zoom', commands)).toEqual([
      ['Zoom in', 90],
      ['Zoom out', 90],
      ['Reset zoom', 80],
    ]);
  });

  it('ORD gives the same list as ord', () => {
    expect(ranked('ORD')).toEqual(ranked('ord'));
  });

  it('with orders of crm open instead of orders of shop, and neither recent, ord lists crm first', () => {
    const list = candidates({}).map((each) => (each.label === 'orders of crm' ? { ...each, open: true } : each));
    expect(ranked('ord', list).slice(0, 2)).toEqual([
      ['orders of crm', 110],
      ['orders of shop', 95],
    ]);
  });

  it('ordx lists nothing, and no text that starts with ordx lists anything that ordx did not', () => {
    expect(ranked('ordx')).toEqual([]);
    for (const longer of ['ordxy', 'ordx ', 'ordx1']) {
      expect(ranked(longer)).toEqual([]);
    }
  });

  it('with 300 collections whose names start with log_, log lists 50 rows', () => {
    const logs = Array.from({ length: 300 }, (_, index) =>
      candidate(`log_${String(index)}`, `log_${String(index)}`, 'Local / logs'),
    );
    expect(rank(['log'], logs)).toHaveLength(50);
  });

  it('in the row of order_items for oi, the letters in bold are the o of order and the i of items', () => {
    const [found] = rank(['oi'], candidates());
    expect(found?.bold).toEqual([
      { start: 0, length: 1 },
      { start: 6, length: 1 },
    ]);
  });

  it('cafe finds café, and accents and case are left out of the comparison', () => {
    expect(rank(['cafe'], [candidate('café', 'Café', '')])).toHaveLength(1);
  });
});
