/**
 * The random draws of generated values (`transfer.generate-values`): a seeded random source, and the characters,
 * words and shapes drawn from it. Ported from Mongoster's `src/shared/generate.ts`.
 */
import { commonWords, firstNames, lastNames } from './words';

/** Numbers in [0, 1), from a seeded source. */
export type Random = () => number;

/** The cyrb128 hash of a text: four 32-bit words. */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < text.length; index += 1) {
    const k = text.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const a = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  return [a, (h2 ^ a) >>> 0, (h3 ^ a) >>> 0, (h4 ^ a) >>> 0];
}

/** A seeded random source: sfc32 over a cyrb128 hash of the seed's text. The same seed gives the same numbers. */
export function seededRandom(seed: string | number): Random {
  let [a, b, c, d] = cyrb128(String(seed));
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** One of the items, each as likely as its weight. */
export function pickWeighted<T>(random: Random, items: readonly T[], weight: (item: T, index: number) => number): T {
  const total = items.reduce((sum, item, index) => sum + weight(item, index), 0);
  let left = random() * total;
  for (const [index, item] of items.entries()) {
    left -= weight(item, index);
    if (left < 0) {
      return item;
    }
  }
  return items[items.length - 1] as T;
}

/** The hexadecimal digits, in lower case. */
export const hexDigits = '0123456789abcdef';
const lowerLetters = 'abcdefghijklmnopqrstuvwxyz';
const hexOnly = /^[0-9a-f]+$/iu;

/** The first letter in capital. */
export function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lower-case letters, digits, `.` and `_` only. */
export function ascii(text: string): string {
  return text.normalize('NFD').replace(/[^a-z0-9._]/gu, '');
}

/** `n` as `width` hexadecimal digits. */
export function hex(n: number, width: number): string {
  return (n >>> 0).toString(16).padStart(width, '0').slice(-width);
}

/** The words of the examples needed for text made of them. */
const leastVocabulary = 8;

/** The draws of one generator, from its random source. */
export class Draw {
  constructor(readonly random: Random) {}

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)] as T;
  }

  /** A whole number from 0 to `below` - 1. */
  below(below: number): number {
    return Math.floor(this.random() * below);
  }

  digits(count: number): string {
    return Array.from({ length: count }, () => String(this.below(10))).join('');
  }

  hexChars(count: number): string {
    return Array.from({ length: count }, () => hexDigits[this.below(16)] ?? '0').join('');
  }

  /** A version-4 UUID, as text. */
  uuid(): string {
    const drawn = this.hexChars(32);
    const variant = hexDigits[8 + this.below(4)] ?? '8';
    const text = `${drawn.slice(0, 12)}4${drawn.slice(13, 16)}${variant}${drawn.slice(17)}`;
    return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
  }

  /** A number with as many digits as `digits` (1 to 9 for one digit), without leading zeros. */
  numberLike(digits: string): string {
    const length = Math.min(digits.length, 9);
    const low = length === 1 ? 1 : 10 ** (length - 1);
    return String(low + this.below(10 ** length - low));
  }

  /** A word of the examples, or of the common words when they have few, now and then one of those. */
  word(vocabulary: readonly string[] = commonWords): string {
    return this.pick(vocabulary.length >= leastVocabulary && this.random() < 0.9 ? vocabulary : commonWords);
  }

  /** A word close to `length` characters, when there is one. */
  wordNear(vocabulary: readonly string[], length: number): string {
    let best = this.word(vocabulary);
    for (let tries = 0; tries < 12 && Math.abs(best.length - length) > 1; tries += 1) {
      const word = this.word(vocabulary);
      best = Math.abs(word.length - length) < Math.abs(best.length - length) ? word : best;
    }
    return best;
  }

  slug(segment: string, vocabulary: readonly string[]): string {
    const separator = segment.includes('_') ? '_' : '-';
    const parts = Math.max(1, segment.split(/[-_]/u).length);
    return Array.from({ length: Math.min(parts, 4) }, () => this.word(vocabulary)).join(separator);
  }

  username(): string {
    const first = ascii(this.pick(firstNames).toLowerCase());
    const last = ascii(this.pick(lastNames).toLowerCase());
    const styles = [`${first.charAt(0)}${last}${this.digits(2)}`, `${first}.${last}`, `${first}${this.digits(3)}`];
    return this.pick(styles);
  }

  /** A character of the same kind as `character`: a digit, a hexadecimal letter, a letter of the same case. */
  private like(character: string, onlyHex: boolean): string {
    if (character >= '0' && character <= '9') {
      return String(this.below(10));
    }
    if (onlyHex && /[a-fA-F]/u.test(character)) {
      const letter = hexDigits[10 + this.below(6)] ?? 'a';
      return character === character.toUpperCase() ? letter.toUpperCase() : letter;
    }
    if (/[a-zA-Z]/u.test(character)) {
      const letter = lowerLetters[this.below(26)] ?? 'a';
      return character === character.toUpperCase() ? letter.toUpperCase() : letter;
    }
    return character;
  }

  /**
   * The example with its digits and letters replaced by others of the same kind, except at the `fixed` positions; a
   * phone keeps its `+<country>` prefix.
   */
  mimic(example: string, phone: boolean, fixed?: readonly boolean[]): string {
    const keep = phone && example.startsWith('+') ? (/^\+\d{1,3}/u.exec(example)?.[0].length ?? 1) : 0;
    const onlyHex = hexOnly.test(example);
    let made = example.slice(0, keep);
    for (let index = keep; index < example.length; index += 1) {
      const character = example.charAt(index);
      made += fixed?.[index] === true ? character : this.like(character, onlyHex);
    }
    return made;
  }
}
