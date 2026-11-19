/**
 * SHA-1 (FIPS 180-4) of a text's UTF-8 bytes, written out because `src/features` uses no API of Node (R1.5).
 * `compare.read` keeps one per document of the left side instead of the document (`compare.equality`), so that two
 * collections of 1,000,000 documents are compared with memory proportional to their number (QA11).
 */

const initial: readonly number[] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

function rotate(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/** The bytes with the padding of the algorithm: a 1 bit, zeros, and the length in bits on 64 bits. */
function padded(bytes: Uint8Array): Uint8Array {
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const out = new Uint8Array(length);
  out.set(bytes);
  out[bytes.length] = 0x80;
  const bits = bytes.length * 8;
  const view = new DataView(out.buffer);
  view.setUint32(length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(length - 4, bits >>> 0);
  return out;
}

function roundValue(round: number, b: number, c: number, d: number): number {
  if (round < 20) {
    return ((b & c) | (~b & d)) + 0x5a827999;
  }
  if (round < 40) {
    return (b ^ c ^ d) + 0x6ed9eba1;
  }
  return round < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc : (b ^ c ^ d) + 0xca62c1d6;
}

/** Mixes one block of 64 bytes into the state. */
function mixBlock(state: number[], view: DataView, offset: number, words: Uint32Array): void {
  for (let index = 0; index < 16; index += 1) {
    words[index] = view.getUint32(offset + index * 4);
  }
  for (let index = 16; index < 80; index += 1) {
    words[index] = rotate(
      (words[index - 3] ?? 0) ^ (words[index - 8] ?? 0) ^ (words[index - 14] ?? 0) ^ (words[index - 16] ?? 0),
      1,
    );
  }
  let [a, b, c, d, e] = state as [number, number, number, number, number];
  for (let round = 0; round < 80; round += 1) {
    const next = (rotate(a, 5) + roundValue(round, b, c, d) + e + (words[round] ?? 0)) >>> 0;
    [e, d, c, b, a] = [d, c, rotate(b, 30), a, next];
  }
  [a, b, c, d, e].forEach((value, index) => {
    state[index] = ((state[index] ?? 0) + value) >>> 0;
  });
}

/** The SHA-1 of the text's UTF-8 bytes, as 40 hexadecimal digits in lower case. */
export function sha1(text: string): string {
  const bytes = padded(new TextEncoder().encode(text));
  const view = new DataView(bytes.buffer);
  const state = [...initial];
  const words = new Uint32Array(80);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    mixBlock(state, view, offset, words);
  }
  return state.map((value) => value.toString(16).padStart(8, '0')).join('');
}
