/**
 * Where the statements of a playground's script start and end, and the database a part of it runs on
 * (`playground.statements`): what each **Run** button runs. The script is parsed as `playground.rewrite` parses it;
 * `databaseAt` is ported from Mongoster's `src/playground/context.ts`.
 */
import type { AnyNode } from 'acorn';
import { isNode, parsedScript } from './parse';

/** A statement of the script, or several that start on the same line: one **Run** button. */
export interface Statement {
  /** Its first line, from 1: the line of its **Run** button. */
  readonly firstLine: number;
  readonly lastLine: number;
  /** Where it starts and ends in the text, as offsets: **Run** runs the text between them. */
  readonly start: number;
  readonly end: number;
}

/** Whether a statement at the top level does something alone: not `;`, a directive, or a declaration of a function. */
function doesSomething(node: AnyNode): boolean {
  if (isNode(node, 'ExpressionStatement')) {
    return node.directive === undefined;
  }
  return node.type !== 'EmptyStatement' && node.type !== 'FunctionDeclaration' && node.type !== 'ClassDeclaration';
}

/** The offset at which each line starts, the first line's at 0. */
export function lineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let index = source.indexOf('\n'); index >= 0; index = source.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

/** The line, from 1, of an offset of the text whose lines start at `starts`. */
export function lineOf(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

/** The statements of a script, in order; none for a script that does not parse. */
export function scriptStatements(source: string): readonly Statement[] {
  const parsed = parsedScript(source);
  if (parsed.kind === 'syntax-error') {
    return [];
  }
  const starts = lineStarts(source);
  const items: Statement[] = [];
  for (const node of parsed.program.body) {
    if (!doesSomething(node)) {
      continue;
    }
    const firstLine = lineOf(starts, node.start);
    const lastLine = lineOf(starts, Math.max(node.start, node.end - 1));
    const previous = items[items.length - 1];
    if (previous?.firstLine === firstLine) {
      items[items.length - 1] = { ...previous, lastLine, end: node.end };
    } else {
      items.push({ firstLine, lastLine, start: node.start, end: node.end });
    }
  }
  return items;
}

/** The statement at the caret's line: the one whose lines hold it, else the first that starts after it, else the last. */
export function statementAtLine(statements: readonly Statement[], line: number): Statement | undefined {
  return (
    statements.find((each) => each.firstLine <= line && line <= each.lastLine) ??
    statements.find((each) => each.firstLine > line) ??
    statements[statements.length - 1]
  );
}

/** A `use("…")` with a name in quotes, at the start of a line or after a space or a `;`. */
const useCall = /(?:^|[;\s])use\(\s*(["'`])([^"'`\n]+)\1\s*\)/gu;

/** The database of the last `use("…")` written before `offset`; undefined when there is none. */
export function databaseAt(source: string, offset: number): string | undefined {
  let database: string | undefined;
  for (const match of source.slice(0, offset).matchAll(useCall)) {
    database = match[2];
  }
  return database;
}
