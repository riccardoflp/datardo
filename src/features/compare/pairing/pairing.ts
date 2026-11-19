/**
 * The pairing of `compare.read`, as a worker thread runs it while the documents of the two sides stream in: the left
 * side is read first and only its `_id`s and the SHA-1 of their `compare.equality` text are kept; each document of the
 * right side is then looked up by `_id`. The state is the worker's own: `addLeft` and `addRight` change it in place
 * and return how the read stands, so that 1,000,000 documents a side take memory proportional to their number (QA11).
 *
 * The interface of the worker (src/runner/workers):
 * - `startPairing({ options, left, right })` makes the state of one comparison;
 * - `addLeft(pairing, documents)` for each batch of the left side's `find`, then `addRight(pairing, documents)` for
 *   each batch of the right side's; each returns `{ kind: 'going', progress }` (the text for `runner.progress`, sent
 *   at most every 200 ms) or the refusal `compare.read/too-many`, after which the read stops;
 * - `finishPairing(pairing)` once the right side has ended gives the `CompareResult` the page shows.
 * A comparison that is cancelled or replaced is dropped by its worker: nothing of it reaches the page.
 */
import type { Json } from '../../../shared/engine-request';
import { refuse, type Outcome } from '../../../shared/feature';
import { groupThousands } from '../../../shared/text-units';
import { comparable, ignoredPaths } from '../equality';
import { text } from '../text';
import {
  idKey,
  idOfDocument,
  mostDocuments,
  type CompareCounts,
  type CompareResult,
  type ComparisonOptions,
  type Difference,
  type EqualityOptions,
  type SideInfo,
} from '../types';
import { sha1 } from './sha1';

/** What a comparison is of. */
export interface PairingInput {
  readonly options: ComparisonOptions;
  readonly left: SideInfo;
  readonly right: SideInfo;
}

/** The state of one comparison while its documents are read. */
export interface Pairing {
  readonly input: PairingInput;
  readonly equality: EqualityOptions;
  /** The left side's `_id` keys and the hashes of their documents; emptied as the right side finds them. */
  readonly left: Map<string, string>;
  /** The differences met on the right side, in its order: different, or only on the right. */
  readonly right: Difference[];
  readonly read: { left: number; right: number };
  readonly counts: { identical: number; different: number; onlyRight: number };
}

/** How the read of a batch went. */
export type PairingStep =
  { readonly kind: 'going'; readonly progress: string } | Extract<Outcome, { readonly kind: 'refuse' }>;

/** The equality options of what the page shows. */
export function equalityOf(options: ComparisonOptions): EqualityOptions {
  return {
    ignore: ignoredPaths(options.ignore),
    ignoreOrder: options.ignoreOrder,
    numbersByValue: options.numbersByValue,
  };
}

/** The state of a comparison before anything is read. */
export function startPairing(input: PairingInput): Pairing {
  return {
    input,
    equality: equalityOf(input.options),
    left: new Map(),
    right: [],
    read: { left: 0, right: 0 },
    counts: { identical: 0, different: 0, onlyRight: 0 },
  };
}

function hashOf(document: Json, options: EqualityOptions): string {
  return sha1(comparable(document, options));
}

function tooMany(side: SideInfo): PairingStep {
  return refuse('compare.read/too-many', text.read.tooMany(side.collection)) as PairingStep;
}

/** Takes a batch of the left side. */
export function addLeft(pairing: Pairing, documents: readonly Json[]): PairingStep {
  for (const document of documents) {
    pairing.read.left += 1;
    if (pairing.read.left > mostDocuments) {
      return tooMany(pairing.input.left);
    }
    pairing.left.set(idKey(idOfDocument(document)), hashOf(document, pairing.equality));
  }
  return { kind: 'going', progress: text.read.readingLeft(groupThousands(pairing.read.left)) };
}

/** Takes a batch of the right side, after the whole left side. */
export function addRight(pairing: Pairing, documents: readonly Json[]): PairingStep {
  for (const document of documents) {
    pairing.read.right += 1;
    if (pairing.read.right > mostDocuments) {
      return tooMany(pairing.input.right);
    }
    const id = idOfDocument(document);
    const key = idKey(id);
    const hash = pairing.left.get(key);
    if (hash === undefined) {
      pairing.counts.onlyRight += 1;
      pairing.right.push({ id, kind: 'only-right' });
      continue;
    }
    pairing.left.delete(key);
    if (hash === hashOf(document, pairing.equality)) {
      pairing.counts.identical += 1;
    } else {
      pairing.counts.different += 1;
      pairing.right.push({ id, kind: 'different' });
    }
  }
  const progress = text.read.comparing(groupThousands(pairing.read.right), groupThousands(pairing.read.left));
  return { kind: 'going', progress };
}

/** What the comparison found, once both sides were read. */
export function finishPairing(pairing: Pairing): CompareResult {
  const onlyLeft: Difference[] = [...pairing.left.keys()].map((key) => ({
    id: JSON.parse(key) as Json,
    kind: 'only-left',
  }));
  const counts: CompareCounts = { ...pairing.counts, onlyLeft: onlyLeft.length };
  return {
    counts,
    differences: [...pairing.right, ...onlyLeft],
    filtered: pairing.input.options.filter.trim() !== '',
  };
}
