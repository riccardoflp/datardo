import { describe, expect, it } from 'vitest';
import { codeLanguages, generatedCode } from '../../../src/features/codegen/types';
import { everyType, program } from './queries';

/**
 * The exit criterion of M24: for one query with a value of every BSON type, the code of each of the six languages is
 * equal to its recorded text, in test/fixtures/codegen. A change to the code of a language shows here as a change to
 * its recorded file, to read before it is accepted.
 */
describe('codegen.types', () => {
  for (const { language } of codeLanguages) {
    it(`writes the query with a value of every BSON type in ${language} as recorded`, async () => {
      const code = generatedCode(language, { kind: 'find', filter: everyType, sort: { at: -1 } }, program);
      await expect(code).toMatchFileSnapshot(`../../fixtures/codegen/every-type.${language}.txt`);
    });
  }
});
