/**
 * Bytes read as strict UTF-8 (RFC 3629): whole characters, and the bytes that start none.
 */

/** One unit of bytes read as UTF-8: a whole character, or a byte that starts none. */
export type ByteUnit =
  | { readonly kind: 'character'; readonly codePoint: number; readonly start: number; readonly length: number }
  | { readonly kind: 'byte'; readonly byte: number; readonly start: number };

/** The first bytes of a character of 2, 3 or 4 bytes, with the range of the byte after it (RFC 3629, table 3-7). */
const leads: readonly (readonly [number, number, number, number, number])[] = [
  [0xc2, 0xdf, 2, 0x80, 0xbf],
  [0xe0, 0xe0, 3, 0xa0, 0xbf],
  [0xe1, 0xec, 3, 0x80, 0xbf],
  [0xed, 0xed, 3, 0x80, 0x9f],
  [0xee, 0xef, 3, 0x80, 0xbf],
  [0xf0, 0xf0, 4, 0x90, 0xbf],
  [0xf1, 0xf3, 4, 0x80, 0xbf],
  [0xf4, 0xf4, 4, 0x80, 0x8f],
];

/** The length of the strictly valid UTF-8 character at `index`, or 0: no overlong form, surrogate or code above U+10FFFF. */
export function characterLength(bytes: Uint8Array, index: number): number {
  const first = bytes[index];
  if (first === undefined) {
    return 0;
  }
  if (first < 0x80) {
    return 1;
  }
  const lead = leads.find(([low, high]) => first >= low && first <= high);
  if (lead === undefined || index + lead[2] > bytes.length) {
    return 0;
  }
  const [, , length, low, high] = lead;
  const second = bytes[index + 1] ?? 0;
  if (second < low || second > high) {
    return 0;
  }
  for (let next = 2; next < length; next += 1) {
    if (((bytes[index + next] ?? 0) & 0xc0) !== 0x80) {
      return 0;
    }
  }
  return length;
}

function codePointAt(bytes: Uint8Array, index: number, length: number): number {
  const first = bytes[index] ?? 0;
  if (length === 1) {
    return first;
  }
  let value = first & (0x7f >> length);
  for (let next = 1; next < length; next += 1) {
    value = (value << 6) | ((bytes[index + next] ?? 0) & 0x3f);
  }
  return value;
}

/** The bytes as characters of UTF-8, and the bytes that start none. */
export function byteUnits(bytes: Uint8Array): readonly ByteUnit[] {
  const units: ByteUnit[] = [];
  let index = 0;
  while (index < bytes.length) {
    const length = characterLength(bytes, index);
    if (length === 0) {
      units.push({ kind: 'byte', byte: bytes[index] ?? 0, start: index });
      index += 1;
    } else {
      units.push({ kind: 'character', codePoint: codePointAt(bytes, index, length), start: index, length });
      index += length;
    }
  }
  return units;
}
