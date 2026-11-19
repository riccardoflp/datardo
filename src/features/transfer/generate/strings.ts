/**
 * Generated strings (`transfer.generate-values`): the first rule that fits the field's name and its examples, among
 * UUIDs, emails, URLs, ISO dates, phones, prefixed codes, names, cities, countries, streets, ids, hexadecimal ids,
 * codes, words and text. Ported from Mongoster's `src/shared/generate.ts`.
 */
import { ascii, capital, Draw } from './draw';
import { cities, countries, countryCodes, firstNames, firstNameSet, lastNames, streets, streetTypes } from './words';

type Make = () => string;

const day = 86_400_000;
const uuidText = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const hexText = /^[0-9a-f]+$/iu;
const emailText = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/iu;
const urlText = /^[a-z][a-z0-9+.-]*:\/\/[^\s/]+/iu;
const isoText = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;
const personText = /^\p{Lu}[\p{L}'-]+( \p{Lu}[\p{L}'.-]*){1,2}$/u;
const personField =
  /^(full|display|contact|customer|owner|author|employee|person|patient|student|teacher|manager)name$|^(author|owner|customer|contact|employee|person|patient|student|teacher|manager|assignee|reporter)$/u;

/** The field's name in lower case without separators: `first_name` → `firstname`. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function isPhone(text: string): boolean {
  const digits = text.replace(/\D/gu, '').length;
  return /^\+?[\d\s()./-]{7,20}$/u.test(text) && digits >= 7 && /[\s().+/-]/u.test(text);
}

function commonPrefix(examples: readonly string[]): string {
  let prefix = examples[0] ?? '';
  for (const example of examples) {
    while (!example.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function urlPath(url: string): string | undefined {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]+([^?#]*)/iu.exec(url)?.[1];
}

/** The distinct words of the examples, without punctuation: the vocabulary of generated text. */
export function vocabulary(examples: readonly string[]): readonly string[] {
  const words = new Set<string>();
  for (const word of examples.flatMap((example) => example.split(/[\s\-_.,;:!?()"/]+/u))) {
    if (/^\p{L}{2,}$/u.test(word)) {
      words.add(word.toLowerCase());
    }
  }
  return [...words];
}

type CaseStyle = 'lower' | 'upper' | 'capital' | 'camel';

function caseStyle(examples: readonly string[]): CaseStyle {
  const count = (pattern: RegExp): number => examples.filter((example) => pattern.test(example)).length;
  if (count(/^[^a-z]*$/u) >= 0.6 * examples.length && count(/[A-Z]/u) > 0) {
    return 'upper';
  }
  if (count(/^[A-Z]/u) >= 0.6 * examples.length) {
    return 'capital';
  }
  return count(/^[a-z]+[A-Z]/u) >= 0.6 * examples.length ? 'camel' : 'lower';
}

function applyCase(text: string, style: CaseStyle): string {
  if (style === 'upper') {
    return text.toUpperCase();
  }
  return style === 'capital' ? capital(text) : text.charAt(0).toLowerCase() + text.slice(1);
}

/** The lengths of the examples, or 5 to 20 around 10 when there are none. */
export function lengthsOf(examples: readonly string[]): { min: number; max: number; avg: number } {
  if (examples.length === 0) {
    return { min: 5, max: 20, avg: 10 };
  }
  const lengths = examples.map((example) => example.length);
  const sum = lengths.reduce((total, length) => total + length, 0);
  return { min: Math.min(...lengths), max: Math.max(...lengths), avg: sum / lengths.length };
}

/** The strings of one field, drawn with a generator's draws. */
export class Strings {
  constructor(
    private readonly draw: Draw,
    private readonly now: number,
  ) {}

  /** Lengths like the examples' (or the range seen), for words and text. */
  lengthPlan(examples: readonly string[], chars: { min: number; max: number; avg: number }): () => number {
    const clamp = (n: number): number => Math.max(chars.min, Math.min(chars.max, Math.round(n)));
    const random = this.draw.random;
    if (examples.length >= 5) {
      const mean = examples.reduce((sum, example) => sum + example.length, 0) / examples.length;
      const scale = mean > 0 ? chars.avg / mean : 1;
      return () => clamp(this.draw.pick(examples).length * scale * (0.85 + 0.3 * random()));
    }
    const { min, max } = chars;
    const mode = Math.max(min, Math.min(max, 3 * chars.avg - min - max));
    return () => {
      if (max <= min) {
        return min;
      }
      const u = random();
      const c = (mode - min) / (max - min);
      const low = min + Math.sqrt(u * (max - min) * (mode - min));
      return clamp(u < c ? low : max - Math.sqrt((1 - u) * (max - min) * (max - mode)));
    };
  }

  /** How the strings of a field are made, from its name (as {@link nameKey}) and its examples. */
  kind(key: string, examples: readonly string[], length: () => number): Make {
    const most = (pattern: RegExp): boolean =>
      examples.length > 0 && examples.filter((example) => pattern.test(example)).length >= 0.8 * examples.length;
    const none = examples.length === 0;
    if (most(uuidText) || (none && /uuid|guid/u.test(key))) {
      const upper = examples.length > 0 && examples[0] === examples[0]?.toUpperCase();
      return () => (upper ? this.draw.uuid().toUpperCase() : this.draw.uuid());
    }
    if (most(emailText) || (none && /e?mail$/u.test(key))) {
      return this.emailPlan(examples);
    }
    if (most(urlText) || (none && /(url|link|website|href)$/u.test(key))) {
      return this.urlPlan(examples);
    }
    if (most(isoText)) {
      return this.isoPlan(examples);
    }
    if ((!none && examples.every(isPhone)) || (none && /phone|mobile|^tel|fax/u.test(key))) {
      return none
        ? () => `+1 555-${this.draw.digits(3)}-${this.draw.digits(4)}`
        : this.shapePlan(examples, { phone: true, id: false });
    }
    const prefixed =
      examples.length >= 3 &&
      examples.every((example) => !/\s/u.test(example) && /\d/u.test(example)) &&
      commonPrefix(examples).length >= 2;
    if (prefixed) {
      return this.shapePlan(examples, { phone: false, id: key === 'id' });
    }
    return this.namedKind(key, examples) ?? this.shapedKind(key, examples, length);
  }

  /** Names, places and streets, by the field's name. */
  private namedKind(key: string, examples: readonly string[]): Make | undefined {
    const pick =
      (items: readonly string[]): Make =>
      () =>
        this.draw.pick(items);
    if (/^(first|given|fore)name$|^name(first|given)$/u.test(key)) {
      return pick(firstNames);
    }
    if (/^(last|family|sur)name$|^surname$|^name(last|family)$/u.test(key)) {
      return pick(lastNames);
    }
    if (/^(user|login|nick|screen)name$|^handle$|^login$/u.test(key)) {
      return () => this.draw.username();
    }
    if (this.personLike(key, examples)) {
      return () => `${this.draw.pick(firstNames)} ${this.draw.pick(lastNames)}`;
    }
    if (/city$|town$/u.test(key)) {
      return pick(cities);
    }
    if (/country(code)?$/u.test(key)) {
      const codes = examples.length > 0 && examples.every((example) => /^[A-Z]{2}$/u.test(example));
      return pick(codes ? countryCodes : countries);
    }
    if (/^(street|address|addressline\d?|address\d)$/u.test(key)) {
      if (examples.some((example) => /\d/u.test(example))) {
        return () => this.draw.pick(examples).replace(/\d+/gu, (digits) => this.draw.numberLike(digits));
      }
      return () => `${String(1 + this.draw.below(250))} ${this.draw.pick(streets)} ${this.draw.pick(streetTypes)}`;
    }
    return undefined;
  }

  /** Ids, hexadecimal ids, codes, words and text: by the shape of the examples. */
  private shapedKind(key: string, examples: readonly string[], length: () => number): Make {
    const noSpace = examples.length > 0 && examples.every((example) => !/\s/u.test(example));
    if (key === 'id' && noSpace) {
      return this.shapePlan(examples, { phone: false, id: true });
    }
    const first = examples[0] ?? '';
    const sameLength = examples.length > 0 && examples.every((example) => example.length === first.length);
    const hexIds = examples.every((example) => hexText.test(example)) && examples.some((e) => /\d/u.test(e));
    if (sameLength && first.length >= 8 && hexIds) {
      const upper = examples.some((example) => /[A-F]/u.test(example));
      return () => (upper ? this.draw.hexChars(first.length).toUpperCase() : this.draw.hexChars(first.length));
    }
    if (noSpace && examples.filter((example) => /\d/u.test(example)).length >= 0.5 * examples.length) {
      return this.shapePlan(examples, { phone: false, id: false });
    }
    const words = vocabulary(examples);
    return noSpace ? this.tokenPlan(examples, length, words) : this.textPlan(examples, length, words);
  }

  /** Names of people: by the field's name, or because the examples start with known first names. */
  private personLike(key: string, examples: readonly string[]): boolean {
    const shaped = examples.filter((example) => personText.test(example));
    if (examples.length > 0 && shaped.length < 0.8 * examples.length) {
      return false;
    }
    if (personField.test(key)) {
      return true;
    }
    if (examples.length === 0) {
      return key === 'fullname';
    }
    return shaped.filter((example) => firstNameSet.has(example.split(' ')[0] ?? '')).length >= 0.3 * examples.length;
  }

  private emailPlan(examples: readonly string[]): Make {
    const domains = examples
      .map((example) => example.slice(example.lastIndexOf('@') + 1).toLowerCase())
      .filter((domain) => domain.includes('.'));
    const pool = domains.length > 0 ? domains : ['example.com', 'example.org', 'example.net'];
    return () => {
      const first = this.draw.pick(firstNames).toLowerCase();
      const last = this.draw.pick(lastNames).toLowerCase();
      const styles = [
        () => `${first}.${last}`,
        () => `${first.charAt(0)}${last}`,
        () => `${first}${this.draw.digits(2)}`,
        () => `${first}_${last}${this.draw.digits(1)}`,
      ];
      return `${ascii(this.draw.pick(styles)())}@${this.draw.pick(pool)}`;
    };
  }

  private urlPlan(examples: readonly string[]): Make {
    const segments = new Map<number, Set<string>>();
    for (const url of examples) {
      (urlPath(url) ?? '').split('/').forEach((segment, index) => {
        segments.set(index, (segments.get(index) ?? new Set<string>()).add(segment));
      });
    }
    const keep = (index: number): boolean =>
      examples.length >= 3 && (segments.get(index)?.size ?? examples.length) <= Math.max(1, examples.length / 4);
    const words = vocabulary(examples.map((url) => urlPath(url) ?? ''));
    return () => {
      const sample = examples.length > 0 ? this.draw.pick(examples) : 'https://www.example.com/a';
      const match = /^([a-z][a-z0-9+.-]*:\/\/[^/?#\s]+)([^?#]*)/iu.exec(sample);
      if (match === null) {
        return sample;
      }
      const path = (match[2] ?? '').split('/').map((segment, index) => {
        if (segment === '' || keep(index)) {
          return segment;
        }
        return /\d/u.test(segment) ? this.draw.mimic(segment, false) : this.draw.slug(segment, words);
      });
      return `${match[1] ?? ''}${path.join('/')}`;
    };
  }

  /**
   * Strings shaped like the examples: a random example with its letters and digits replaced, except where all the
   * examples of that length (at least 3) have the same character. For an `_id`, digits always change.
   */
  private shapePlan(examples: readonly string[], as: { readonly phone: boolean; readonly id: boolean }): Make {
    const byLength = new Map<number, string[]>();
    for (const example of examples) {
      byLength.set(example.length, [...(byLength.get(example.length) ?? []), example]);
    }
    const fixed = new Map<number, boolean[]>();
    for (const [length, list] of byLength) {
      const first = list[0] ?? '';
      const same = (index: number): boolean => list.every((example) => example[index] === first[index]);
      const kept = (index: number): boolean => same(index) && !(as.id && /\d/u.test(first.charAt(index)));
      if (list.length >= 3) {
        fixed.set(
          length,
          Array.from({ length }, (_, index) => kept(index)),
        );
      }
    }
    return () => {
      const sample = this.draw.pick(examples);
      return this.draw.mimic(sample, as.phone, fixed.get(sample.length));
    };
  }

  private isoPlan(examples: readonly string[]): Make {
    const times = examples
      .map((example) => Date.parse(example.length === 10 ? `${example}T00:00:00Z` : example))
      .filter((time) => !Number.isNaN(time));
    let from = times.length > 0 ? Math.min(...times) : this.now - 365 * day;
    let to = times.length > 0 ? Math.max(...times) : this.now;
    if (to - from < day) {
      from -= 182 * day;
      to += 182 * day;
    }
    return () => {
      const sample = this.draw.pick(examples);
      const iso = new Date(from + this.draw.random() * (to - from)).toISOString();
      if (sample.length === 10) {
        return iso.slice(0, 10);
      }
      const time = /^.{11}\d{2}:\d{2}:\d{2}/u.test(sample) ? iso.slice(11, 19) : iso.slice(11, 16);
      const fraction = /\.(\d+)/u.exec(sample.slice(19))?.[1];
      const zone = /(Z|[+-]\d{2}:?\d{2})$/u.exec(sample)?.[1] ?? '';
      const digits =
        fraction === undefined ? '' : `.${iso.slice(20, 23).padEnd(fraction.length, '0').slice(0, fraction.length)}`;
      return `${iso.slice(0, 10)}${sample.charAt(10)}${time}${digits}${zone}`;
    };
  }

  /** Single words or slugs: words joined like the examples, with their case. */
  private tokenPlan(examples: readonly string[], length: () => number, words: readonly string[]): Make {
    const separator =
      ['-', '_', '.'].find((each) => examples.filter((e) => e.includes(each)).length >= 0.3 * examples.length) ?? '';
    const style = caseStyle(examples);
    return () => {
      const target = length();
      const drawn: string[] = [];
      let total = 0;
      do {
        const room = target - total - (drawn.length > 0 ? separator.length : 0);
        const word = separator !== '' || drawn.length === 0 ? this.draw.wordNear(words, room) : this.draw.word(words);
        drawn.push(word);
        total += word.length + (drawn.length > 1 ? separator.length : 0);
      } while (total < target - 2 && drawn.length < 8);
      const camel = (word: string, index: number): string =>
        index > 0 && style !== 'lower' && style !== 'upper' ? capital(word) : word;
      return applyCase(separator === '' ? drawn.map(camel).join('') : drawn.join(separator), style);
    };
  }

  /** Text with spaces: words up to a similar length, capitalized and ended like the examples. */
  private textPlan(examples: readonly string[], length: () => number, words: readonly string[]): Make {
    const share = (test: (example: string) => boolean): number =>
      examples.length === 0 ? 0 : examples.filter(test).length / examples.length;
    const capitalized = share((example) => /^\p{Lu}/u.test(example)) >= 0.5;
    const title = share((example) => example.split(/\s+/u).every((word) => !/^\p{Ll}/u.test(word))) >= 0.6;
    const period = share((example) => /[.!?]$/u.test(example)) >= 0.5;
    return () => {
      const target = Math.max(1, length() - (period ? 1 : 0));
      const drawn: string[] = [];
      let total = 0;
      while (total < target) {
        const word = this.draw.word(words);
        const next = total + (drawn.length > 0 ? 1 : 0) + word.length;
        if (drawn.length > 0 && next - target > target - total) {
          break;
        }
        drawn.push(word);
        total = next;
      }
      const text = (title ? drawn.map(capital) : drawn).join(' ');
      const shown = capitalized ? capital(text) : text;
      return period ? `${shown}.` : shown;
    };
  }
}
