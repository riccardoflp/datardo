import { describe, expect, it } from 'vitest';
import { folderName, queryFilePath, renamedFilePath } from '../../../src/features/saved-query/file-path';

describe('saved-query.file-path', () => {
  it('gives the seven worked examples exactly their paths', () => {
    expect(queryFilePath('shop', 'orders', 'Paid this month', [])).toBe('shop/orders/paid-this-month.json');
    expect(queryFilePath('shop', 'orders', 'Paid this month', ['shop/orders/paid-this-month.json'])).toBe(
      'shop/orders/paid-this-month-2.json',
    );
    expect(queryFilePath('shop', 'orders', 'Città più attive!', [])).toBe('shop/orders/citta-piu-attive.json');
    expect(queryFilePath('shop', 'orders', 'Top 10 — by total', [])).toBe('shop/orders/top-10-by-total.json');
    expect(queryFilePath('shop', 'orders', '???', [])).toBe('shop/orders/query.json');
    expect(queryFilePath('shop', 'orders', 'A'.repeat(70), [])).toBe(`shop/orders/${'a'.repeat(60)}.json`);
    expect(queryFilePath('my:db', 'a/b', 'x', [])).toBe('my_db/a_b/x.json');
    expect(queryFilePath('con', 'logs 2024 ', 'x', [])).toBe('_con/logs 2024_/x.json');
  });

  it('writes the same path on every system: a taken path is found whatever its case', () => {
    expect(queryFilePath('shop', 'orders', 'Paid', ['SHOP/Orders/PAID.JSON'])).toBe('shop/orders/paid-2.json');
    expect(queryFilePath('shop', 'orders', 'Paid', ['shop/orders/paid.json', 'shop/orders/paid-2.json'])).toBe(
      'shop/orders/paid-3.json',
    );
  });

  it('gives Paid! and paid? of the same collection paid.json and paid-2.json', () => {
    const first = queryFilePath('shop', 'orders', 'Paid!', []);
    expect(first).toBe('shop/orders/paid.json');
    expect(queryFilePath('shop', 'orders', 'paid?', [first])).toBe('shop/orders/paid-2.json');
  });

  it('never leaves the queries folder, whatever the names', () => {
    for (const name of ['..', '.', '../..', '/etc', 'C:\\Windows', ' ', '', 'a\u0000b']) {
      const path = queryFilePath(name, name, name, []);
      expect(path.split('/')).toHaveLength(3);
      expect(path.split('/').some((part) => part === '..' || part === '.' || part === '')).toBe(false);
    }
    expect(folderName('..')).toBe('_');
    expect(folderName('')).toBe('_');
    expect(folderName('aux.txt')).toBe('_aux.txt');
    expect(folderName('LPT1')).toBe('_LPT1');
  });

  it('cuts a name to 60 characters without a dash at the end', () => {
    const name = `${'a'.repeat(59)} b`;
    expect(queryFilePath('shop', 'orders', name, [])).toBe(`shop/orders/${'a'.repeat(59)}.json`);
  });

  it('keeps the file of a renamed query when its file name does not change, and numbers it when it is taken', () => {
    expect(renamedFilePath('shop/orders/paid.json', 'PAID!', [])).toBe('shop/orders/paid.json');
    expect(renamedFilePath('shop/orders/paid.json', 'Paid this month', [])).toBe('shop/orders/paid-this-month.json');
    expect(renamedFilePath('shop/orders/paid.json', 'Top', ['shop/orders/top.json'])).toBe('shop/orders/top-2.json');
    expect(renamedFilePath('misc/x.json', 'Paid', [])).toBe('misc/paid.json');
  });
});
