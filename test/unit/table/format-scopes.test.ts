import { describe, expect, it } from 'vitest';
import type { FormatScope, KeptFormatting } from '../../../src/shared/formatting-rules';
import {
  rulesInOrder,
  scopeReaches,
  withoutCollection,
  withoutConnection,
  withoutDatabase,
  withRenamedCollection,
} from '../../../src/features/table/format-scopes';
import { tableFormat } from '../../../src/features/table/format-table';
import { condition, documents } from './formatting';

const orders = { connection: 'local', database: 'shop', collection: 'orders' };
const customers = { ...orders, collection: 'customers' };
const leads = { connection: 'local', database: 'crm', collection: 'leads' };

/** A row rule `{}` of each color in each scope: the collection's red, the database's orange, the connection's yellow, everywhere's green. */
function kept(off: readonly FormatScope[] = []): KeptFormatting {
  return {
    global: [condition('g', '{}', 'green')],
    connections: {
      local: {
        rules: [condition('c', '{}', 'yellow')],
        databases: {
          shop: {
            rules: [condition('d', '{}', 'orange')],
            collections: { orders: { rules: [condition('o', '{}', 'red')], off } },
          },
        },
      },
    },
  };
}

const ids = (rules: KeptFormatting, where: typeof orders): string[] =>
  rulesInOrder(rules, where).rules.map((each) => `${each.scope}:${each.rule.id}`);

describe('table.format-scopes', () => {
  it('tries the collection, the database, the connection and everywhere in that order', () => {
    expect(ids(kept(), orders)).toEqual(['collection:o', 'database:d', 'connection:c', 'global:g']);
    expect(ids(kept(), customers)).toEqual(['database:d', 'connection:c', 'global:g']);
    expect(ids(kept(), { ...orders, connection: 'other' })).toEqual(['global:g']);
  });

  it("colors the row with the collection's rule, and with the database's when the collection leaves its own out", () => {
    const rowOf = (rules: KeptFormatting): string | undefined => {
      const inOrder = rulesInOrder(rules, orders).rules.map((each) => each.rule);
      return tableFormat(inOrder, documents('{ a: 1 }'), false, 0).documents[0]?.row?.color;
    };
    expect(rowOf(kept())).toBe('red');
    expect(rowOf(kept(['collection']))).toBe('orange');
    expect(rulesInOrder(kept(['collection']), orders).off).toEqual(['collection']);
  });

  it('leaves everywhere out of shop.orders only', () => {
    expect(ids(kept(['global']), orders)).toEqual(['collection:o', 'database:d', 'connection:c']);
    expect(ids(kept(['global']), customers)).toEqual(['database:d', 'connection:c', 'global:g']);
  });

  it('leaves out a rule whose id was seen in a nearer scope', () => {
    const twice: KeptFormatting = { ...kept(), global: [condition('o', '{}', 'blue'), condition('g', '{}', 'green')] };
    expect(ids(twice, orders)).toEqual(['collection:o', 'database:d', 'connection:c', 'global:g']);
  });

  it("reaches the tabs of a database's collections with a change to its rules, and every tab with everywhere's", () => {
    const database = { scope: 'database', connection: 'local', database: 'shop' } as const;
    expect(scopeReaches(database, customers)).toBe(true);
    expect(scopeReaches(database, leads)).toBe(false);
    expect([orders, customers, leads].every((where) => scopeReaches({ scope: 'global' }, where))).toBe(true);
    expect(scopeReaches({ scope: 'connection', connection: 'local' }, { ...orders, connection: 'other' })).toBe(false);
    expect(scopeReaches({ scope: 'collection', ...orders }, customers)).toBe(false);
  });

  it("removes the rules of a removed connection, its databases' and its collections', and keeps everywhere's", () => {
    const left = withoutConnection(kept(), 'local');
    expect(left.connections).toEqual({});
    expect(ids(left, orders)).toEqual(['global:g']);
  });

  it('removes with a dropped database its rules and its collections, and with a dropped collection its own', () => {
    expect(ids(withoutDatabase(kept(), { connection: 'local', database: 'shop' }), orders)).toEqual([
      'connection:c',
      'global:g',
    ]);
    expect(ids(withoutCollection(kept(['global']), orders), orders)).toEqual([
      'database:d',
      'connection:c',
      'global:g',
    ]);
    expect(withoutCollection(kept(), leads)).toEqual(kept());
  });

  it('moves the rules of a renamed collection, and what it leaves out, to the new name', () => {
    const renamed = withRenamedCollection(kept(['global']), orders, 'orders_2024');
    expect(ids(renamed, { ...orders, collection: 'orders_2024' })).toEqual([
      'collection:o',
      'database:d',
      'connection:c',
    ]);
    expect(ids(renamed, orders)).toEqual(['database:d', 'connection:c', 'global:g']);
  });
});
