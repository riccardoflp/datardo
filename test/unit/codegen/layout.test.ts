import { describe, expect, it } from 'vitest';
import { codeWidth, laidOut } from '../../../src/features/codegen/layout';
import { codeLanguages, generatedCode } from '../../../src/features/codegen/types';
import { nodejsCode } from '../../../src/features/codegen/nodejs';
import { mongoshCode } from '../../../src/features/codegen/mongosh';
import { goCode } from '../../../src/features/codegen/go';
import { emptyFind, everyType, findExample, lines, pipelineExample, program } from './queries';

const braces = { indent: '  ', open: '{', close: '}', spaced: true };

describe('codegen.layout', () => {
  it('keeps a value on one line when it fits in 80 columns with its indentation, and breaks it otherwise', () => {
    const fits = ['a'.repeat(36), 'b'.repeat(36)];
    expect(laidOut(fits, 0, braces)).toBe(`{ ${fits.join(', ')} }`);
    expect(laidOut(fits, 1, braces)).toBe(`{ ${fits.join(', ')} }`);
    expect(laidOut(fits, 2, braces)).toBe(`{\n      ${fits[0]},\n      ${fits[1]}\n    }`);
  });

  it('breaks a value when one of its items is broken', () => {
    expect(laidOut(['a: {\n  b: 1\n}', 'c: 2'], 0, braces)).toBe('{\n  a: {\n  b: 1\n},\n  c: 2\n}');
  });

  it('never breaks an empty document or array', () => {
    expect(laidOut([], 40, braces)).toBe('{}');
    expect(laidOut([], 40, { indent: '\t', open: 'bson.A{', close: '}', trailingComma: true })).toBe('bson.A{}');
  });

  it('counts a tab as one column, and puts a comma after the last item of a broken value of Go', () => {
    const items = ['x'.repeat(70)];
    expect(laidOut(items, 2, { indent: '\t', open: '{', close: '}', trailingComma: true })).toBe(`{${items[0]}}`);
    expect(laidOut(['y'.repeat(80)], 0, { indent: '\t', open: '{', close: '}', trailingComma: true })).toBe(
      `{\n\t${'y'.repeat(80)},\n}`,
    );
  });

  it('lays a value on one line only when it is at most 80 columns long with its indentation', () => {
    for (let length = 70; length <= 90; length += 1) {
      for (const level of [0, 1, 3]) {
        const text = laidOut(['z'.repeat(length - 4)], level, braces);
        if (!text.includes('\n')) {
          expect(2 * level + text.length).toBeLessThanOrEqual(codeWidth);
        }
      }
    }
  });

  it('writes the filter of the find example on five lines in Node.js', () => {
    const code = nodejsCode(findExample, lines);
    expect(code.slice(0, code.indexOf(';')).split('\n')).toHaveLength(5);
  });

  it('breaks the $group stage of the pipeline example in mongosh and keeps its body on one line', () => {
    expect(mongoshCode(pipelineExample, lines)).toContain(
      '  {\n    $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } }\n  },\n',
    );
  });

  it('breaks the same stage twice in Go', () => {
    expect(goCode(pipelineExample, lines)).toContain(
      '\tbson.D{\n\t\t{Key: "$group", Value: bson.D{\n\t\t\t{Key: "_id"',
    );
  });

  it('writes a filter of one field with a short value on one line in every language', () => {
    for (const { language } of codeLanguages) {
      const code = generatedCode(language, { kind: 'find', filter: { status: 'paid' } }, lines);
      const declaration = code.split('\n')[0] ?? '';
      expect(declaration, language).toContain('"paid"');
    }
  });

  it('gives the same text for the same query each time, ending with one line break and no spaces at line ends', () => {
    for (const { language } of codeLanguages) {
      for (const query of [findExample, pipelineExample, emptyFind, { kind: 'find' as const, filter: everyType }]) {
        for (const target of [lines, program]) {
          const code = generatedCode(language, query, target);
          expect(generatedCode(language, query, target)).toBe(code);
          expect(code.endsWith('\n') && !code.endsWith('\n\n'), language).toBe(true);
          expect(code, language).not.toMatch(/[ \t]$/mu);
        }
      }
    }
  });
});
