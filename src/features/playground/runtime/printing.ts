/**
 * What `print`, `printjson` and the methods of `console` write (`playground.runtime`): one line per call, strings as
 * they are, anything else in mongosh syntax, on one line for `print` and on several for `printjson` and `dir`. The
 * process of a run turns each argument into a {@link Printed} (its value as canonical Extended JSON) and sends the line
 * this module writes. Ported from Mongoster's `display` (`src/playground/shell.ts`).
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue, prettyWidth } from '../../aggregate/mongosh/format';
import { text } from '../text';

/** An argument of a call that prints, as the process gives it. */
export type Printed =
  | { readonly kind: 'string'; readonly text: string }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'cursor' }
  | { readonly kind: 'mongo' }
  | { readonly kind: 'function'; readonly name: string }
  /** A value that cannot be BSON (a cycle): the text JavaScript gives it. */
  | { readonly kind: 'text'; readonly text: string };

/** How a call prints its values: `print`, `console.log` on one line; `printjson`, `console.dir` indented. */
export type PrintLayout = 'line' | 'pretty';

/** The functions of printing a script has, and the layout of each. */
export const printers: Readonly<Record<string, PrintLayout>> = {
  print: 'line',
  printjson: 'pretty',
  'console.log': 'line',
  'console.info': 'line',
  'console.warn': 'line',
  'console.error': 'line',
  'console.dir': 'pretty',
};

function printedText(value: Printed, layout: PrintLayout): string {
  switch (value.kind) {
    case 'string':
    case 'text':
      return value.text;
    case 'cursor':
      return text.runtime.cursor;
    case 'mongo':
      return text.runtime.mongo;
    case 'function':
      return text.runtime.functionNamed(value.name);
    case 'value':
      return formattedValue(
        value.value,
        layout === 'line' ? { kind: 'one-line' } : { kind: 'pretty', width: prettyWidth },
      );
  }
}

/** The line one call prints: `print("total", NumberLong(5), { a: 1 })` → `total NumberLong(5) { a: 1 }`. */
export function printedLine(values: readonly Printed[], layout: PrintLayout): string {
  return values.map((value) => printedText(value, layout)).join(' ');
}
