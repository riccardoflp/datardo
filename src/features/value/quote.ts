/**
 * Feature: value.quote — writes a name or a value as one argument of a Redis command, as the confirmation, the Log, a
 * copied command and an exported file show it, so that `redis-cli` and the console read the same bytes back.
 */
import { groupThousands } from '../../shared/text-units';
import { byteUnits, type ByteUnit } from './types';

/** Where an argument is written: in a step shown to the user, where long ones are cut; or whole, in a file or on the clipboard. */
export type QuoteWhere = 'step' | 'whole';

/** In a step, an argument longer than 256 bytes is cut (Datardo's choice). */
export const longestArgument = 256;

/** A cut argument shows its first 64 bytes (Datardo's choice). */
export const shownOfLong = 64;

const escapes: Readonly<Record<number, string>> = { 0x22: '\\"', 0x5c: '\\\\', 0x0a: '\\n', 0x0d: '\\r', 0x09: '\\t' };

function isBare(bytes: Uint8Array): boolean {
  return (
    bytes.length > 0 &&
    bytes[0] !== 0x23 &&
    bytes.every((byte) => byte >= 0x21 && byte <= 0x7e && byte !== 0x22 && byte !== 0x27 && byte !== 0x5c)
  );
}

function hexEscapes(bytes: Uint8Array, unit: ByteUnit): string {
  const length = unit.kind === 'byte' ? 1 : unit.length;
  return Array.from(
    bytes.subarray(unit.start, unit.start + length),
    (byte) => `\\x${byte.toString(16).padStart(2, '0')}`,
  ).join('');
}

/** One unit between double quotes: an escape, a printable character, or `\xHH` for each of its bytes. */
function quotedUnit(bytes: Uint8Array, unit: ByteUnit): string {
  if (unit.kind === 'byte') {
    return hexEscapes(bytes, unit);
  }
  const escape = escapes[unit.codePoint];
  if (escape !== undefined) {
    return escape;
  }
  if ((unit.codePoint >= 0x20 && unit.codePoint <= 0x7e) || unit.codePoint > 0x9f) {
    return String.fromCodePoint(unit.codePoint);
  }
  return hexEscapes(bytes, unit);
}

/** The units that fit whole in the first 64 bytes. */
function firstUnits(units: readonly ByteUnit[]): readonly ByteUnit[] {
  return units.filter((unit) => unit.start + (unit.kind === 'byte' ? 1 : unit.length) <= shownOfLong);
}

/**
 * Feature: value.quote — the bytes as one argument: bare when every byte is a printable ASCII character other than
 * the space, `"`, `'` and `\` and it does not start with `#`; otherwise between double quotes with `\"`, `\\`, `\n`,
 * `\r`, `\t`, characters above U+009F as themselves and every other byte as `\xHH`. In a step, an argument of more
 * than 256 bytes is cut after its first 64, with its length: `"{\"user\":7,…" (12,345 bytes)`.
 */
export function quoted(bytes: Uint8Array, where: QuoteWhere): string {
  const cut = where === 'step' && bytes.length > longestArgument;
  const more = cut ? `… (${groupThousands(bytes.length)} bytes)` : '';
  if (isBare(bytes)) {
    const shown = cut ? bytes.subarray(0, shownOfLong) : bytes;
    return `${new TextDecoder().decode(shown)}${more}`;
  }
  const units = byteUnits(bytes);
  const text = (cut ? firstUnits(units) : units).map((unit) => quotedUnit(bytes, unit)).join('');
  return cut ? `"${text}…" (${groupThousands(bytes.length)} bytes)` : `"${text}"`;
}
