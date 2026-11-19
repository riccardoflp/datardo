/**
 * Feature: codegen.types
 *
 * How each BSON type is written in each language: an ObjectId stays an ObjectId, a date a date, a Long a Long. The
 * writers of the values are those of the languages' own cards; this module chooses among them, says what each value
 * needs (the BSON classes of Node.js, the import lines of Python, the imports of Java, the imports and functions of
 * Go), and writes the code of a query in the language chosen.
 */
import type { Json } from '../../shared/engine-request';
import { csharpCode, csharpValue } from './csharp';
import { goCode, goValue, type GoNeeds } from './go';
import { javaCode, javaValue } from './java';
import { mongoshCode, mongoshValue } from './mongosh';
import { nodejsCode, nodejsValue } from './nodejs';
import { pythonCode, pythonValue } from './python';
import type { CodeQuery, CodeTarget } from './source';

/** The languages, in the order of the tabs of the Code section. */
export type CodeLanguage = 'mongosh' | 'nodejs' | 'python' | 'java' | 'csharp' | 'go';

/** The languages with their names, in the order of the tabs. */
export const codeLanguages: readonly { readonly language: CodeLanguage; readonly label: string }[] = [
  { language: 'mongosh', label: 'mongosh' },
  { language: 'nodejs', label: 'Node.js' },
  { language: 'python', label: 'Python' },
  { language: 'java', label: 'Java' },
  { language: 'csharp', label: 'C#' },
  { language: 'go', label: 'Go' },
];

/** The name of a language, as its tab says it. */
export function languageLabel(language: CodeLanguage): string {
  return codeLanguages.find((each) => each.language === language)?.label ?? language;
}

/**
 * A value as written, and what a full program adds for it: the BSON classes of Node.js, the import lines of Python,
 * the imports of Java, the packages and functions of Go; nothing for mongosh and C#.
 */
export interface Written {
  readonly text: string;
  readonly needs: readonly string[];
}

function goWritten(value: Json): Written {
  const needs: GoNeeds = { imports: new Set(), functions: new Set() };
  const text = goValue(value, 0, needs);
  return {
    text,
    needs: [...[...needs.imports].sort().map((name) => `import "${name}"`), ...[...needs.functions].sort()],
  };
}

/** Feature: codegen.types — a value written in a language, at the first level, with what it needs. */
export function written(value: Json, language: CodeLanguage): Written {
  const needs = new Set<string>();
  switch (language) {
    case 'mongosh':
      return { text: mongoshValue(value), needs: [] };
    case 'nodejs':
      return { text: nodejsValue(value, 0, needs), needs: [...needs].sort() };
    case 'python':
      return { text: pythonValue(value, 0, needs), needs: [...needs].sort() };
    case 'java':
      return { text: javaValue(value, 0, needs), needs: [...needs].sort() };
    case 'csharp':
      return { text: csharpValue(value, 0), needs: [] };
    case 'go':
      return goWritten(value);
  }
}

/** The code of a query in a language: the lines, or the whole program. */
export function generatedCode(language: CodeLanguage, query: CodeQuery, target: CodeTarget): string {
  switch (language) {
    case 'mongosh':
      return mongoshCode(query, target);
    case 'nodejs':
      return nodejsCode(query, target);
    case 'python':
      return pythonCode(query, target);
    case 'java':
      return javaCode(query, target);
    case 'csharp':
      return csharpCode(query, target);
    case 'go':
      return goCode(query, target);
  }
}
