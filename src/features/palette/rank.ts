/**
 * Feature: palette.rank
 *
 * Gives every candidate a score for the text typed, and orders the list by it. The rules are exact, so that the same
 * text always gives the same list: a candidate one of whose terms matches nothing is never listed, and typing one
 * more character at the end of the last term never adds a candidate.
 */

/** What a candidate brings to the ranking: its name, its context and three facts. */
export interface Rankable {
  readonly name: string;
  readonly context: string;
  /** Whether it is open in a tab. */
  readonly open: boolean;
  /** Whether it is among the recent places (`palette.recent`). */
  readonly recent: boolean;
  /** Whether it belongs to the current connection. */
  readonly current: boolean;
}

/** A part of a name: from `start`, `length` characters (code points), that matched a term. */
export interface MatchedLetters {
  readonly start: number;
  readonly length: number;
}

/** A candidate that matched, with its score and the letters of its name to write in bold, in order. */
export interface Ranked<T extends Rankable> {
  readonly candidate: T;
  readonly score: number;
  readonly bold: readonly MatchedLetters[];
}

/** How many candidates are listed at most (Datardo's choice). */
export const mostRanked = 50;

/** The score of each way a term matches (Datardo's choices). */
export const scores = {
  same: 100,
  starts: 90,
  wordStart: 80,
  anywhere: 70,
  wordLetters: 50,
  letters: 30,
  context: 10,
  open: 15,
  recent: 10,
  current: 5,
} as const;

/** A character without its accents and its case: `É` is `e`. */
function folded(character: string): string {
  return character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** A text compared without case and accents, as one folded character for each character of the text. */
function foldedCharacters(text: string): readonly string[] {
  return Array.from(text, folded);
}

/** The text folded, for comparing. */
export function foldedText(text: string): string {
  return foldedCharacters(text).join('');
}

function isLower(character: string): boolean {
  return character !== character.toUpperCase() && character === character.toLowerCase();
}

function isUpper(character: string): boolean {
  return character !== character.toLowerCase() && character === character.toUpperCase();
}

function isDigit(character: string): boolean {
  return /\p{Nd}/u.test(character);
}

const wordSeparators = new Set([' ', '.', '_', '-', ':', '/']);

/** The word starts of a name: its first character, one after a separator, an upper case after a lower case or digit. */
export function wordStarts(name: string): ReadonlySet<number> {
  const characters = Array.from(name);
  const starts = new Set<number>();
  characters.forEach((character, index) => {
    const before = characters[index - 1];
    if (
      before === undefined ||
      wordSeparators.has(before) ||
      (isUpper(character) && (isLower(before) || isDigit(before)))
    ) {
      starts.add(index);
    }
  });
  return starts;
}

/** Where a sequence of folded characters holds another, from `from`; -1 when it does not. */
function indexOf(haystack: readonly string[], needle: readonly string[], from: number): number {
  for (let start = from; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((character, offset) => haystack[start + offset] === character)) {
      return start;
    }
  }
  return -1;
}

/** The letters of the term found in the name in order, the first at one of `firsts` and each in `allowed`. */
function lettersInOrder(
  name: readonly string[],
  term: readonly string[],
  firsts: ReadonlySet<number>,
  allowed: (index: number) => boolean,
): readonly number[] | undefined {
  for (const first of [...firsts].sort((one, other) => one - other)) {
    if (name[first] !== term[0]) {
      continue;
    }
    const found = [first];
    let at = first + 1;
    for (const character of term.slice(1)) {
      while (at < name.length && !(name[at] === character && allowed(at))) {
        at += 1;
      }
      if (at >= name.length) {
        break;
      }
      found.push(at);
      at += 1;
    }
    if (found.length === term.length) {
      return found;
    }
  }
  return undefined;
}

/** The letters of a set of positions, as runs of neighbors. */
function runs(positions: readonly number[]): readonly MatchedLetters[] {
  const result: MatchedLetters[] = [];
  for (const position of positions) {
    const last = result[result.length - 1];
    if (last !== undefined && last.start + last.length === position) {
      result[result.length - 1] = { start: last.start, length: last.length + 1 };
    } else {
      result.push({ start: position, length: 1 });
    }
  }
  return result;
}

/** How one term matches a name and a context: its score and the letters in bold, or `undefined` when it does not. */
export function scoreTerm(
  term: string,
  name: string,
  context: string,
): { readonly score: number; readonly bold: readonly MatchedLetters[] } | undefined {
  const wanted = foldedCharacters(term);
  const letters = foldedCharacters(name);
  const whole = { start: 0, length: wanted.length };
  if (wanted.length === 0) {
    return undefined;
  }
  if (wanted.join('') === letters.join('')) {
    return { score: scores.same, bold: [{ start: 0, length: letters.length }] };
  }
  if (indexOf(letters, wanted, 0) === 0) {
    return { score: scores.starts, bold: [whole] };
  }
  const starts = wordStarts(name);
  for (let at = indexOf(letters, wanted, 0); at >= 0; at = indexOf(letters, wanted, at + 1)) {
    if (starts.has(at)) {
      return { score: scores.wordStart, bold: [{ start: at, length: wanted.length }] };
    }
  }
  const anywhere = indexOf(letters, wanted, 0);
  if (anywhere >= 0) {
    return { score: scores.anywhere, bold: [{ start: anywhere, length: wanted.length }] };
  }
  return lettersScore(letters, wanted, starts) ?? contextScore(wanted, context);
}

function lettersScore(
  letters: readonly string[],
  wanted: readonly string[],
  starts: ReadonlySet<number>,
): { readonly score: number; readonly bold: readonly MatchedLetters[] } | undefined {
  const onWordStarts = lettersInOrder(letters, wanted, starts, (index) => starts.has(index));
  if (onWordStarts !== undefined) {
    return { score: scores.wordLetters, bold: runs(onWordStarts) };
  }
  const inOrder = lettersInOrder(letters, wanted, starts, () => true);
  return inOrder === undefined ? undefined : { score: scores.letters, bold: runs(inOrder) };
}

function contextScore(
  wanted: readonly string[],
  context: string,
): { readonly score: number; readonly bold: readonly MatchedLetters[] } | undefined {
  return indexOf(foldedCharacters(context), wanted, 0) >= 0 ? { score: scores.context, bold: [] } : undefined;
}

/** Compares two texts character by character, without regard to case. */
function compareText(one: string, other: string): number {
  const left = foldedText(one);
  const right = foldedText(other);
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** The order of rule 5: the higher score, the shorter name, the name, the context. */
function compareRanked<T extends Rankable>(one: Ranked<T>, other: Ranked<T>): number {
  return (
    other.score - one.score ||
    Array.from(one.candidate.name).length - Array.from(other.candidate.name).length ||
    compareText(one.candidate.name, other.candidate.name) ||
    compareText(one.candidate.context, other.candidate.context)
  );
}

/** One candidate against every term; `undefined` when a term matches nothing. */
function rankOne<T extends Rankable>(terms: readonly string[], candidate: T): Ranked<T> | undefined {
  let score = 0;
  const bold: MatchedLetters[] = [];
  for (const term of terms) {
    const matched = scoreTerm(term, candidate.name, candidate.context);
    if (matched === undefined) {
      return undefined;
    }
    score += matched.score;
    bold.push(...matched.bold);
  }
  score += (candidate.open ? scores.open : 0) + (candidate.recent ? scores.recent : 0);
  score += candidate.current ? scores.current : 0;
  return { candidate, score, bold: [...bold].sort((one, other) => one.start - other.start) };
}

/** The candidates that match every term, in order, at most {@link mostRanked}. */
export function rank<T extends Rankable>(terms: readonly string[], candidates: readonly T[]): readonly Ranked<T>[] {
  const kept = terms.filter((term) => term !== '');
  if (kept.length === 0) {
    return [];
  }
  return candidates
    .flatMap((candidate) => {
      const ranked = rankOne(kept, candidate);
      return ranked === undefined ? [] : [ranked];
    })
    .sort(compareRanked)
    .slice(0, mostRanked);
}
