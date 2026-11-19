import { describe, expect, it } from 'vitest';
import {
  databaseAt,
  databaseOfPart,
  statementAtCaret,
  statementOnLine,
  statements,
  statementText,
} from '../../../src/features/playground/statements';

const example = [
  'use("shop");                                    // line 1',
  '',
  '// paid orders',
  'const paid = db.orders                          // line 4',
  '  .find({ status: "paid" })',
  '  .toArray();                                   // line 6',
  'print(paid.length); db.orders.countDocuments(); // line 7',
  'function total(o) { return o.total }            // line 8',
  'db.orders.find({}).limit(20)                    // line 9',
].join('\n');

function lineStart(source: string, line: number): number {
  return (
    source
      .split('\n')
      .slice(0, line - 1)
      .join('\n').length + (line > 1 ? 1 : 0)
  );
}

describe('playground.statements', () => {
  it('gives the four items of the worked example', () => {
    expect(statements(example).map((each) => [each.firstLine, each.lastLine])).toEqual([
      [1, 1],
      [4, 6],
      [7, 7],
      [9, 9],
    ]);
  });

  it('runs the two statements of line 7 as one, on shop', () => {
    const item = statementOnLine(example, 7);
    expect(item).toBeDefined();
    if (item === undefined) return;
    expect(statementText(example, item)).toBe('print(paid.length); db.orders.countDocuments();');
    expect(databaseOfPart(example, item.start, 'test')).toBe('shop');
    expect(statementOnLine(example, 8)).toBeUndefined();
  });

  it('finds the database of the last use before an offset', () => {
    expect(databaseAt(example, lineStart(example, 4))).toBe('shop');
    expect(databaseAt(example, lineStart(example, 1))).toBeUndefined();
  });

  it('finds the statement at the caret', () => {
    expect(statementAtCaret(example, 3)?.firstLine).toBe(4);
    expect(statementAtCaret(example, 5)?.firstLine).toBe(4);
    expect(statementAtCaret(example, 8)?.firstLine).toBe(9);
    expect(statementAtCaret(example, 20)?.firstLine).toBe(9);
  });

  it('gives no items for a script that does not parse', () => {
    expect(statements(example.replace('.find({ status: "paid" })', '.find({ status: "paid" }'))).toEqual([]);
  });

  it('leaves out empty statements, directives and class declarations', () => {
    expect(statements('"use strict";\n;\nclass A {}\nx = 1').map((each) => each.firstLine)).toEqual([4]);
  });

  it('runs a statement after use("a"); use(\'b\') on b', () => {
    const source = 'use("a"); use(\'b\')\ndb.orders.find()';
    expect(databaseOfPart(source, source.indexOf('db.'), 'test')).toBe('b');
  });

  it('does not see use(name) with a variable', () => {
    const source = 'const name = "shop"; use(name)\ndb.orders.find()';
    expect(databaseOfPart(source, source.indexOf('db.'), 'test')).toBe('test');
  });

  it('gives the statements of a script of 5,000 lines in less than 100 ms', () => {
    const source = Array.from({ length: 5000 }, (_, index) => `db.orders.find({ n: ${String(index)} })`).join('\n');
    statements(source);
    const started = performance.now();
    const found = statements(source);
    expect(performance.now() - started).toBeLessThan(100);
    expect(found).toHaveLength(5000);
  });
});
