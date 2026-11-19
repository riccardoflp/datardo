import { at, task } from './harness';
import { describe, expect, it } from 'vitest';
import { freeName, outputName, patternError } from '../../../src/features/task/file-names';

/** Thursday 8 October 2026, 16:45:12. */
const thursday = at(2026, 10, 8, 16, 45, 12);

describe('task.file-names', () => {
  it('names the outputs of the default pattern by the database, the collection or the connection', () => {
    expect(outputName(task(), thursday, 'Local')).toBe('shop_2026-10-08_16-45-12.agz');
    expect(outputName(task({ format: 'gzip' }), thursday, 'Local')).toBe('shop_2026-10-08_16-45-12');
    expect(outputName(task({ kind: 'export', collection: 'orders', format: 'csv' }), thursday, 'Local')).toBe(
      'orders_2026-10-08_16-45-12.csv',
    );
    const { database: _database, ...noDatabase } = task();
    expect(outputName(noDatabase, thursday, 'My Server')).toBe('My_Server_2026-10-08_16-45-12.agz');
  });

  it('expands every placeholder, in local time', () => {
    const pattern = '{connection}-{database}.{collection}-{YYYY}{MM}{DD}-{HH}{mm}{ss}-{weekday}';
    expect(outputName(task({ pattern, collection: 'orders', format: 'plain' }), thursday, 'Prod DB')).toBe(
      'Prod_DB-shop.orders-20261008-164512-Thu',
    );
  });

  it('leaves an empty collection empty and trims what is left', () => {
    expect(outputName(task({ pattern: '{collection}{date}' }), thursday, 'Local')).toBe('2026-10-08.agz');
  });

  it('refuses unknown placeholders, separators and patterns without the date or time', () => {
    expect(patternError('{day}')).toBe(
      'Unknown placeholder {day}: use {name} {connection} {database} {collection} {date} {time} {YYYY} {MM} {DD} {HH} {mm} {ss} {weekday}',
    );
    expect(patternError('backup')).toBe(
      'Include the date or time, e.g. {date}_{time}, so the runs write different files',
    );
    expect(patternError('daily/{date}')).toBe('The file name cannot contain / or \\: choose the folder instead');
    expect(patternError('   ')).toBe('Enter a file name');
    expect(patternError('{name}_{date}_{time}')).toBeUndefined();
  });

  it('accepts a pattern with only {weekday}: seven names, one per day of the week', () => {
    expect(patternError('{weekday}')).toBeUndefined();
    const names = Array.from({ length: 7 }, (_, day) =>
      outputName(task({ pattern: '{weekday}' }), at(2026, 11, 8 + day, 2), 'Local'),
    );
    expect(names).toEqual(['Sun.agz', 'Mon.agz', 'Tue.agz', 'Wed.agz', 'Thu.agz', 'Fri.agz', 'Sat.agz']);
  });

  it('never writes a character Windows refuses, whatever the names', () => {
    const awkward = 'a\\b/c:d*e?f"g<h>i|j k\tl';
    const name = outputName(
      task({ pattern: '{connection}{database}{collection}{date}', database: awkward, collection: `.${awkward}.` }),
      thursday,
      ` ${awkward} `,
    );
    expect(name).not.toMatch(/[\\/:*?"<>|\s]/u);
    expect(name).not.toMatch(/^[._]|[._]\.agz$/u);
    expect(outputName(task({ pattern: '{collection}', database: '???' }), thursday, 'x').length).toBeGreaterThan(4);
  });

  it('adds a number before the extension when the name exists', () => {
    const taken = new Set(['shop.agz', 'shop_2.agz']);
    expect(freeName('shop.agz', '.agz', (name) => taken.has(name))).toBe('shop_3.agz');
    expect(freeName('shop-20261101', '', (name) => name === 'shop-20261101')).toBe('shop-20261101_2');
  });
});
