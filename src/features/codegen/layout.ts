/**
 * Feature: codegen.layout
 *
 * One rule decides where a value is broken over several lines, in every language: a document, an array or a list is
 * on one line when its text, with the indentation of its level, is at most 80 columns long and none of its items is
 * broken; otherwise each item is on its own line, one level deeper, and the closing bracket is on its own line.
 */

/** The width of the code, in columns. */
export const codeWidth = 80;

/** How a language writes a document, an array or a list. */
export interface LayoutStyle {
  /** One level of indentation: 2 spaces, 4 spaces, or a tab, which counts as one column. */
  readonly indent: string;
  readonly open: string;
  readonly close: string;
  /** A space inside the brackets on one line: `{ a: 1 }`. */
  readonly spaced?: boolean;
  /** A comma after the last item of a broken value, as Go's formatter writes it. */
  readonly trailingComma?: boolean;
}

/** The indentation of a level. */
export function indentation(indent: string, level: number): string {
  return indent.repeat(level);
}

/** Whether a text stays on one line at a level: it is not broken and fits in 80 columns with its indentation. */
export function fitsOnOneLine(text: string, indent: string, level: number): boolean {
  return !text.includes('\n') && indentation(indent, level).length + text.length <= codeWidth;
}

/** Feature: codegen.layout — the items, written one level deeper, on one line or one per line. */
export function laidOut(items: readonly string[], level: number, style: LayoutStyle): string {
  const inner = style.spaced === true && items.length > 0 ? ` ${items.join(', ')} ` : items.join(', ');
  const single = `${style.open}${inner}${style.close}`;
  if (items.length === 0 || fitsOnOneLine(single, style.indent, level)) {
    return single;
  }
  const pad = indentation(style.indent, level + 1);
  const lines = items.map((item) => `${pad}${item}`).join(',\n');
  return `${style.open}\n${lines}${style.trailingComma === true ? ',' : ''}\n${indentation(style.indent, level)}${style.close}`;
}

/** A string between double quotes, with the escapes of JSON. */
export function quoted(value: string): string {
  return JSON.stringify(value);
}

/** A byte as `0x0a`. */
export function hexByte(value: number): string {
  return `0x${value.toString(16).padStart(2, '0')}`;
}
