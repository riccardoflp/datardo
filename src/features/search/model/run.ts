/**
 * One search, from **Search** to its end, as the worker of the search and the page follow it: the collections listed,
 * each collection's scan as it grows, stopping, and the end. Every event names the search it belongs to; an event of
 * a search that is no longer the current one changes nothing (`search.scan`, rule 5).
 */
import type { CollectionScan, SearchCollection, SearchInput, SearchRun } from '../types';
import { collectionsAtOnce } from '../scan';

/** What happens to a search. `at` is the time, in milliseconds since 1970. */
export type SearchEvent =
  | {
      readonly kind: 'listed';
      readonly search: number;
      readonly collections: readonly SearchCollection[];
      readonly at: number;
    }
  | { readonly kind: 'list-failed'; readonly search: number; readonly message: string; readonly at: number }
  /** A collection starts to be read, or has news: its scan as it is now. */
  | {
      readonly kind: 'scanned';
      readonly search: number;
      readonly index: number;
      readonly scan: CollectionScan;
      readonly at: number;
    }
  | { readonly kind: 'stopped'; readonly search: number; readonly at: number };

/** A search started with **Search**, listing its collections. */
export function startRun(id: number, input: SearchInput, now: number): SearchRun {
  return {
    id,
    text: input.text.trim(),
    everyDatabase: input.database === undefined,
    state: 'listing',
    scans: [],
    startedAt: now,
  };
}

/** Whether a collection's read has ended: read, read up to **Read**, failed or stopped. */
export function isScanOver(scan: CollectionScan): boolean {
  return scan.state.kind !== 'waiting' && scan.state.kind !== 'reading';
}

/** Whether the search still runs. */
export function isRunning(run: SearchRun): boolean {
  return run.state === 'listing' || run.state === 'searching';
}

function waiting(collection: SearchCollection): CollectionScan {
  return { collection, state: { kind: 'waiting' }, read: 0, found: 0, results: [], ids: [] };
}

function ended(run: SearchRun, at: number): SearchRun {
  return run.scans.every(isScanOver) ? { ...run, state: 'done', endedAt: at } : run;
}

function stopped(run: SearchRun, at: number): SearchRun {
  const scans = run.scans.map((scan) => (isScanOver(scan) ? scan : { ...scan, state: { kind: 'stopped' } as const }));
  return { ...run, state: 'stopped', scans, endedAt: at };
}

/** The search after an event; the same search when the event is of another one or comes after its end. */
export function runAfter(run: SearchRun, event: SearchEvent): SearchRun {
  if (event.search !== run.id || !isRunning(run)) {
    return run;
  }
  switch (event.kind) {
    case 'listed':
      return ended({ ...run, state: 'searching', scans: event.collections.map(waiting) }, event.at);
    case 'list-failed':
      return { ...run, state: 'error', error: event.message, endedAt: event.at };
    case 'scanned': {
      const scans = run.scans.map((scan, index) => (index === event.index ? event.scan : scan));
      return ended({ ...run, scans }, event.at);
    }
    case 'stopped':
      return stopped(run, event.at);
  }
}

/** The collections to start reading now, so that no more than 3 are read at the same time, in the order listed. */
export function nextToRead(run: SearchRun): readonly number[] {
  if (run.state !== 'searching') {
    return [];
  }
  const reading = run.scans.filter((scan) => scan.state.kind === 'reading').length;
  const free = Math.max(0, collectionsAtOnce - reading);
  return run.scans
    .map((scan, index) => ({ scan, index }))
    .filter(({ scan }) => scan.state.kind === 'waiting')
    .slice(0, free)
    .map(({ index }) => index);
}
