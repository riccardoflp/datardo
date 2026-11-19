/**
 * Block-style YAML of plain values (`table.copy-text`), ported from Mongoster's `toYaml`.
 */
import { PlainDate, type Plain } from './plain';

function isDate(value: Plain): value is PlainDate {
  return value instanceof PlainDate;
}

/** Text YAML reads back as the same string without quotes. */
export function isPlainScalar(written: string): boolean {
  if (!/^[A-Za-z_][\w .@/+-]*$/.test(written) || /\s$/.test(written)) {
    return false;
  }
  // Words YAML 1.1 reads as booleans, null or numbers (as PyYAML does: not y and n).
  return !/^(true|false|yes|no|on|off|null|nan|inf)$/i.test(written);
}

function keyOf(key: string): string {
  return isPlainScalar(key) ? key : JSON.stringify(key);
}

function literalBlock(written: string, level: number): string | undefined {
  // A text of several lines as a literal block, when YAML gives it back unchanged.
  const fits =
    written.includes('\n') &&
    !/^\s/.test(written) &&
    !/\p{Cc}/u.test(written.replaceAll('\n', '')) &&
    !/\n\n$/.test(written) &&
    !/ \n| $/.test(written);
  if (!fits) {
    return undefined;
  }
  const pad = '  '.repeat(level);
  const body = written.replace(/\n$/, '');
  const lines = body.split('\n').map((line) => (line === '' ? '' : pad + line));
  return `${written.endsWith('\n') ? '|' : '|-'}\n${lines.join('\n')}`;
}

function scalar(value: Plain, level: number): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return '[]';
  }
  if (typeof value === 'object') {
    return isDate(value) ? value.date : '{}';
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return String(value);
    }
    return Number.isNaN(value) ? '.nan' : value > 0 ? '.inf' : '-.inf';
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (isPlainScalar(value)) {
    return value;
  }
  return literalBlock(value, level) ?? JSON.stringify(value);
}

function block(value: Plain, level: number): string {
  const pad = '  '.repeat(level);
  if (Array.isArray(value) && value.length > 0) {
    return (value as readonly Plain[])
      .map((each) => {
        const inner = block(each, level + 1);
        // A mapping inside a list starts on the dash line: "- a: 1\n  b: 2".
        return `\n${pad}-${inner.startsWith('\n') ? ` ${inner.slice(pad.length + 3)}` : inner}`;
      })
      .join('');
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isDate(value) &&
    Object.keys(value).length > 0
  ) {
    return Object.entries(value)
      .map(([key, inner]) => `\n${pad}${keyOf(key)}:${block(inner, level + 1)}`)
      .join('');
  }
  return ` ${scalar(value, level)}`;
}

/** The YAML of a plain value, with a line break at the end. */
export function yamlOf(value: Plain): string {
  return `${block(value, 0).replace(/^\n/, '')}\n`;
}
