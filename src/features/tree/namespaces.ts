/**
 * Feature: tree.namespaces
 *
 * Turns the key names seen in a database into the namespaces the tree shows: a prefix of key names that ends with the
 * separator is a namespace when at least 2 of the keys seen start with it. Names stay bytes throughout, so that a name
 * that is not text is cut and counted like any other; the same names give the same tree in whatever order they came.
 */
import { keyText } from '../palette/find-keys';
import { countText } from './count';
import { text } from './text';
import { hexOf } from './types';

/** How many keys seen must start with a prefix for it to be a namespace (Datardo's choice). */
export const leastKeysOfNamespace = 2;

/** A namespace of keys, with its own namespaces under it. */
export interface Namespace {
  /** The prefix, as bytes: the key names under it start with it, and it ends with the separator. */
  readonly prefix: Uint8Array;
  readonly prefixHex: string;
  /** The prefix as text; bytes that are not text written as `value.format` writes them. */
  readonly prefixText: string;
  /** The part between the last two separators of the prefix: `2024` for `orders:2024:`; **(empty)** when empty. */
  readonly name: string;
  /** How many keys seen start with the prefix, those of its own namespaces included. */
  readonly count: number;
  /** The count as the tree writes it, with `+` when the scan did not reach the end: `312`, `312+`. */
  readonly countText: string;
  /** The prefix with `\` before `*`, `?`, `[`, `]` and `\`, followed by `*`: `orders:2024:*`. */
  readonly pattern: string;
  readonly namespaces: readonly Namespace[];
}

/** The namespaces of a database, and the number of keys seen. */
export interface Namespaces {
  readonly namespaces: readonly Namespace[];
  readonly keysSeen: number;
}

/** Where the separator starts in a name, left to right, each occurrence after the end of the one before. */
function cuts(name: Uint8Array, separator: Uint8Array): readonly number[] {
  const found: number[] = [];
  let at = 0;
  while (at + separator.length <= name.length) {
    if (separator.every((byte, index) => name[at + index] === byte)) {
      found.push(at);
      at += separator.length;
    } else {
      at += 1;
    }
  }
  return found;
}

/** A pattern of `MATCH` that stands for the keys under a prefix. */
export function patternOf(prefixText: string): string {
  return `${prefixText.replace(/[*?[\]\\]/gu, (character) => `\\${character}`)}*`;
}

/** A part of a name as text: UTF-8 when it is, otherwise as `value.format` writes bytes. */
function partText(bytes: Uint8Array): string {
  return keyText(bytes);
}

/** What one prefix is, before its namespaces are put under it. */
interface Found {
  readonly prefix: Uint8Array;
  readonly hex: string;
  /** Where the part that names it starts and ends in the prefix. */
  readonly nameStart: number;
  readonly nameEnd: number;
  /** The prefix just shorter, as hexadecimal, when there is one. */
  readonly parent?: string;
  count: number;
}

function foundPrefixes(names: readonly Uint8Array[], separator: Uint8Array): ReadonlyMap<string, Found> {
  const found = new Map<string, Found>();
  for (const name of names) {
    let parent: string | undefined;
    let start = 0;
    for (const at of cuts(name, separator)) {
      const prefix = name.subarray(0, at + separator.length);
      const hex = hexOf(prefix);
      const known = found.get(hex);
      if (known === undefined) {
        const fresh = { prefix: prefix.slice(), hex, nameStart: start, nameEnd: at, count: 1 };
        found.set(hex, parent === undefined ? fresh : { ...fresh, parent });
      } else {
        known.count += 1;
      }
      parent = hex;
      start = at + separator.length;
    }
  }
  return found;
}

function compareBytes(one: Uint8Array, other: Uint8Array): number {
  const length = Math.min(one.length, other.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (one[index] ?? 0) - (other[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return one.length - other.length;
}

/** Namespaces under the same node: by name ignoring case, then by their bytes. */
export function compareNamespaces(one: Namespace, other: Namespace): number {
  const first = one.name.toLowerCase();
  const second = other.name.toLowerCase();
  return first < second ? -1 : first > second ? 1 : compareBytes(one.prefix, other.prefix);
}

function namespaceOf(found: Found, children: readonly Namespace[], complete: boolean): Namespace {
  const part = found.prefix.subarray(found.nameStart, found.nameEnd);
  const prefixText = partText(found.prefix);
  return {
    prefix: found.prefix,
    prefixHex: found.hex,
    prefixText,
    name: part.length === 0 ? text.redis.emptyName : partText(part),
    count: found.count,
    countText: `${countText(found.count)}${complete ? '' : '+'}`,
    pattern: patternOf(prefixText),
    namespaces: [...children].sort(compareNamespaces),
  };
}

/** The distinct names, by the hexadecimal of their bytes. */
function distinct(keyNames: readonly Uint8Array[]): readonly Uint8Array[] {
  const seen = new Map<string, Uint8Array>();
  for (const name of keyNames) {
    seen.set(hexOf(name), name);
  }
  return [...seen.values()];
}

/**
 * The namespaces of the key names seen, as a tree, and the number of keys seen. `complete` says whether the scan
 * reached the end: when it did not, each count ends with `+`. An empty separator gives no namespace.
 */
export function namespacesOf(keyNames: readonly Uint8Array[], separator: string, complete: boolean): Namespaces {
  const names = distinct(keyNames);
  const bytes = new TextEncoder().encode(separator);
  if (bytes.length === 0) {
    return { namespaces: [], keysSeen: names.length };
  }
  const kept = [...foundPrefixes(names, bytes).values()].filter((each) => each.count >= leastKeysOfNamespace);
  const childrenOf = new Map<string | undefined, Found[]>();
  for (const each of kept) {
    childrenOf.set(each.parent, [...(childrenOf.get(each.parent) ?? []), each]);
  }
  const build = (parent: string | undefined): readonly Namespace[] =>
    (childrenOf.get(parent) ?? []).map((each) => namespaceOf(each, build(each.hex), complete));
  return { namespaces: [...build(undefined)].sort(compareNamespaces), keysSeen: names.length };
}
