/**
 * Feature: gridfs.hex-dump
 *
 * The hex dump of the first bytes of a binary file: one line for every 16 bytes, its offset in 8 hexadecimal digits,
 * the bytes in two lower-case digits padded to 47 characters, and the bytes as characters, those from 32 to 126 as
 * they are and every other as `.`. Ported from Mongoster's `hexDump`.
 */

/** Bytes on one line. */
export const bytesPerLine = 16;

/** The width of the bytes of a line: 16 bytes of two digits and 15 spaces. */
const hexWidth = bytesPerLine * 3 - 1;

function hexByte(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

function shownCharacter(byte: number): string {
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
}

/** Feature: gridfs.hex-dump — the lines of the bytes, joined by a line break; empty for no bytes. */
export function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const line = [...bytes.subarray(offset, offset + bytesPerLine)];
    const hex = line.map(hexByte).join(' ').padEnd(hexWidth, ' ');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex}  ${line.map(shownCharacter).join('')}`);
  }
  return lines.join('\n');
}
