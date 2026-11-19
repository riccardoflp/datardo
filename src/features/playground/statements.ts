/**
 * Feature: playground.statements
 *
 * Where the statements of a script start and end: what each **Run** button runs, and on which database. The script is
 * parsed as `playground.rewrite` parses it, by the same code of `src/shared/playground`.
 */
import { databaseAt, scriptStatements, statementAtLine, type Statement } from '../../shared/playground/statements';

export type { Statement } from '../../shared/playground/statements';
export { databaseAt, statementAtLine } from '../../shared/playground/statements';

/**
 * Feature: playground.statements — the statements at the top level of a script, in order: one item per line that has a
 * **Run** button. Empty statements, directives and declarations of functions and classes are left out; statements
 * that start on the same line are one item; a script that does not parse has none.
 */
export function statements(source: string): readonly Statement[] {
  return scriptStatements(source);
}

/** The database a part of the script that starts at `offset` runs on: the last `use("…")` before it, else `fallback`. */
export function databaseOfPart(source: string, offset: number, fallback: string): string {
  return databaseAt(source, offset) ?? fallback;
}

/** The text a statement's **Run** button runs: from its start to its end, alone. */
export function statementText(source: string, statement: Statement): string {
  return source.slice(statement.start, statement.end);
}

/** The statement whose **Run** button is on `line`, when one is. */
export function statementOnLine(source: string, line: number): Statement | undefined {
  return scriptStatements(source).find((each) => each.firstLine === line);
}

/** The statement at the caret, for **Run statement** (`Ctrl+Shift+Enter`). */
export function statementAtCaret(source: string, caretLine: number): Statement | undefined {
  return statementAtLine(scriptStatements(source), caretLine);
}
