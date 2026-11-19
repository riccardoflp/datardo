/**
 * Feature: key.pattern
 *
 * Turns the text of the pattern field, or a namespace, into the pattern `SCAN … MATCH` receives, so that a plain word
 * finds the keys that contain it.
 */

/** What the pattern is made from: the text typed, or a namespace with its separator (`orders:`). */
export type PatternInput =
  { readonly kind: 'typed'; readonly text: string } | { readonly kind: 'namespace'; readonly namespace: string };

/** The pattern sent, and whether the text was plain (a word, not a glob). */
export interface KeyPattern {
  readonly pattern: string;
  readonly plain: boolean;
}

/** The pattern of every key. */
export const everyKey = '*';

/** A namespace's name with `\` before each `*`, `?`, `[`, `]` and `\`, so that `MATCH` reads it as itself. */
export function escapedForMatch(name: string): string {
  return name.replace(/[*?[\]\\]/gu, (character) => `\\${character}`);
}

/** Whether a text is a glob: it holds `*`, `?`, `[` or `\`. */
export function isGlob(typed: string): boolean {
  return /[*?[\\]/u.test(typed);
}

/**
 * Feature: key.pattern — the pattern: a namespace gives its escaped name and `*`; an empty text `*`; a glob as it is;
 * any other text `*<text>*`, plain. Nothing is trimmed and no letter changes case.
 */
export function pattern(input: PatternInput): KeyPattern {
  if (input.kind === 'namespace') {
    return { pattern: `${escapedForMatch(input.namespace)}*`, plain: false };
  }
  if (input.text === '') {
    return { pattern: everyKey, plain: false };
  }
  return isGlob(input.text) ? { pattern: input.text, plain: false } : { pattern: `*${input.text}*`, plain: true };
}

/**
 * Whether a name matches a pattern as `MATCH` reads it (Redis's `stringmatchlen`): `*`, `?`, sets with ranges and `^`,
 * and `\` that takes the next character literally. Compared character by character, with case.
 */
export function matches(globPattern: string, name: string): boolean {
  return matchFrom(Array.from(globPattern), 0, Array.from(name), 0);
}

function matchFrom(glob: readonly string[], at: number, name: readonly string[], from: number): boolean {
  let g = at;
  let n = from;
  while (g < glob.length) {
    const character = glob[g];
    if (character === '*') {
      return Array.from({ length: name.length - n + 1 }, (_, skip) => n + skip).some((next) =>
        matchFrom(glob, g + 1, name, next),
      );
    }
    if (n >= name.length) {
      return false;
    }
    const step = matchOne(glob, g, name[n] ?? '');
    if (step === undefined) {
      return false;
    }
    g = step;
    n += 1;
  }
  return n === name.length;
}

/** Matches one character of the name at `g` of the pattern; the place after the part of the pattern, or none. */
function matchOne(glob: readonly string[], g: number, character: string): number | undefined {
  const part = glob[g];
  if (part === '?') {
    return g + 1;
  }
  if (part === '[') {
    return matchSet(glob, g + 1, character);
  }
  if (part === '\\' && g + 1 < glob.length) {
    return glob[g + 1] === character ? g + 2 : undefined;
  }
  return part === character ? g + 1 : undefined;
}

function matchSet(glob: readonly string[], start: number, character: string): number | undefined {
  let g = start;
  const negated = glob[g] === '^';
  if (negated) {
    g += 1;
  }
  let found = false;
  while (g < glob.length && glob[g] !== ']') {
    const low = glob[g] === '\\' ? (glob[++g] ?? '') : (glob[g] ?? '');
    if (glob[g + 1] === '-' && g + 2 < glob.length && glob[g + 2] !== ']') {
      const high = glob[g + 2] ?? '';
      const [from, to] = low <= high ? [low, high] : [high, low];
      found ||= character >= from && character <= to;
      g += 3;
    } else {
      found ||= low === character;
      g += 1;
    }
  }
  return found !== negated ? g + 1 : undefined;
}
