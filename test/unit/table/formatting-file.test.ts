import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import {
  readFormatRules,
  readStoredFormatting,
  type FieldRule,
  type FormatRule,
} from '../../../src/shared/formatting-rules';
import { rulesByScope } from '../../../src/features/table/format-scopes';
import {
  formattingFileText,
  groupsOfFormattingFile,
  rulesWithImported,
  type FormattingFile,
} from '../../../src/features/table/formatting-file';
import { byField, condition } from './formatting';

const kept = {
  global: [condition('g', '{ deleted: true }', 'gray')],
  connections: {
    local: {
      rules: [],
      databases: {
        shop: {
          rules: [condition('d', '{ status: "failed" }', 'red')],
          collections: { orders: { rules: [condition('o', '{ amount: { $gt: 5 } }', 'green', 'amount')], off: [] } },
        },
      },
    },
  },
};
const orders = { connection: 'local', database: 'shop', collection: 'orders' };

function read(text: string): FormattingFile {
  const file = groupsOfFormattingFile(text);
  if ('reason' in file) {
    throw new Error(file.message);
  }
  return file;
}

function counter(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `new${String(next)}`;
  };
}

describe('table.formatting-file', () => {
  it('writes the groups global, database and collection in that order, and reads them back as written', () => {
    const scopes = ['collection', 'database', 'connection', 'global'] as const;
    const text = formattingFileText(rulesByScope(kept, orders), scopes, orders);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "datardoFormatting": 1,\n');
    const file = read(text);
    expect(file.groups.map((group) => [group.scope, group.database, group.collection])).toEqual([
      ['global', undefined, undefined],
      ['database', 'shop', undefined],
      ['collection', 'shop', 'orders'],
    ]);
    expect(file.groups.map((group) => group.rules)).toEqual([
      kept.global,
      kept.connections.local.databases.shop.rules,
      kept.connections.local.databases.shop.collections.orders.rules,
    ]);
    expect(file.unreadable).toBe(0);
    expect(text).not.toContain('local');
  });

  it('keeps the rules it can use without unknown properties, and counts the others and an unknown scope', () => {
    const groups: Json = [
      {
        scope: 'collection',
        rules: [{ id: 'a', condition: '{ a: 1 }', color: 'red', extra: 1 }, { id: 'b', color: 'red' }, 'rule'],
      },
      { scope: 'table', rules: [{ id: 'c', condition: '{}', color: 'red' }] },
    ];
    const file = read(JSON.stringify({ datardoFormatting: 1, groups }));
    expect(file.groups).toEqual([{ scope: 'collection', rules: [{ id: 'a', condition: '{ a: 1 }', color: 'red' }] }]);
    expect(file.unreadable).toBe(3);
  });

  it('refuses what is not a formatting file, each with its message', () => {
    const refused = (text: string): readonly [string, string] | undefined => {
      const file = groupsOfFormattingFile(text);
      return 'reason' in file ? [file.reason, file.message] : undefined;
    };
    const notFormatting = 'The file is not a file of formatting rules exported from Datardo or Mongoster.';
    expect(refused('[]')).toEqual(['not-formatting', notFormatting]);
    expect(refused('{ "groups": [] }')).toEqual(['not-formatting', notFormatting]);
    expect(refused('{ "datardoFormatting": 2, "groups": [] }')).toEqual([
      'newer',
      'The file was exported by a newer Datardo: update Datardo to import it.',
    ]);
    expect(refused(' '.repeat(1_000_001))).toEqual([
      'too-large',
      'The file is larger than 1 MB: it is not a file of formatting rules.',
    ]);
    expect(refused('{')?.[0]).toBe('not-json');
    expect(refused('{')?.[1]).toMatch(/^The file is not JSON: /u);
  });

  it("reads Mongoster's file, its condition rules without kind and its field rule", () => {
    const mongoster = {
      mongosterFormatting: 1,
      groups: [
        {
          scope: 'global',
          rules: [
            { id: 'a', condition: '{ status: "failed" }', color: 'red' },
            { id: 'b', kind: 'condition', condition: '{ ok: true }', field: 'ok', color: 'green' },
            { id: 'c', kind: 'field', field: 'status', target: 'row', mode: 'values' },
          ],
        },
      ],
    };
    const file = read(JSON.stringify(mongoster));
    expect(file.groups[0]?.rules.map((rule) => rule.id)).toEqual(['a', 'b', 'c']);
    expect(file.unreadable).toBe(0);
  });

  it('reads a field rule back as written, and an unknown target, mode, palette or scale color as cell and auto', () => {
    const rule: FieldRule = byField('f', 'status', {
      target: 'row',
      mode: 'scale',
      min: 0,
      max: 10,
      scale: { from: 'red', to: 'green' },
      pinned: [{ value: '"gone"', color: 'gray' }],
      palette: 'blue',
      name: 'By status',
      enabled: false,
    });
    expect(readFormatRules([rule as unknown as Json]).rules).toEqual([rule]);
    const odd = {
      id: 'g',
      kind: 'field',
      field: ' status ',
      target: 'side',
      mode: 'pie',
      palette: 'mauve',
      scale: { to: 'x' },
    };
    expect(readFormatRules([odd]).rules).toEqual([byField('g', 'status')]);
  });

  it('adds the rules of a file after those of a scope with new ids, skipping one equal but for its id', () => {
    const existing: FormatRule[] = [condition('x', '{ a: 1 }', 'red'), condition('y', '{ b: 1 }', 'blue')];
    const incoming: FormatRule[] = [
      { color: 'blue', condition: '{ b: 1 }', id: 'other' },
      condition('p', '{ c: 1 }', 'green'),
      condition('q', '{ d: 1 }', 'teal', 'd'),
    ];
    const result = rulesWithImported(existing, incoming, counter());
    expect(result.rules.map((rule) => rule.id)).toEqual(['x', 'y', 'new1', 'new2']);
    expect([result.added, result.already, result.over]).toEqual([2, 1, 0]);
    expect(rulesWithImported(result.rules, incoming, counter()).added).toBe(0);
  });

  it('counts the rules past 100 of a scope as not fitting', () => {
    const full = Array.from({ length: 99 }, (_each, index) =>
      condition(`r${String(index)}`, `{ n: ${String(index)} }`, 'red'),
    );
    const result = rulesWithImported(
      full,
      [condition('a', '{ a: 1 }', 'red'), condition('b', '{ b: 1 }', 'red')],
      counter(),
    );
    expect([result.added, result.already, result.over]).toEqual([1, 0, 1]);
    expect(result.rules).toHaveLength(100);
  });

  it('reads the rules of formatting.json with the same rules, 100 at most in a scope', () => {
    const many = Array.from({ length: 120 }, (_each, index) => ({
      id: `r${String(index)}`,
      condition: '{}',
      color: 'red',
    }));
    const stored = readStoredFormatting({
      version: 1,
      hidden: true,
      global: many,
      connections: {
        local: {
          rules: [{ id: 'c', condition: '{}', color: 'mauve' }],
          databases: { shop: { rules: [], collections: { orders: { rules: [], off: ['global', 'table'] } } } },
        },
        broken: 'x',
      },
    });
    expect(stored.hidden).toBe(true);
    expect(stored.global).toHaveLength(100);
    expect(stored.connections['local']?.rules).toEqual([]);
    expect(stored.connections['local']?.databases['shop']?.collections['orders']?.off).toEqual(['global']);
    expect(Object.keys(stored.connections)).toEqual(['local']);
    expect(readStoredFormatting(null)).toEqual({ hidden: false, global: [], connections: {} });
  });
});
