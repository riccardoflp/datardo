/**
 * The texts of a search as the page shows them: the summary of the options row, its parts joined by ` · ` and
 * followed by the state, and the head of each group (`search.show`, "The summary" and "A group").
 */
import { text } from '../text';
import type { CollectionScan, SearchRun } from '../types';
import { isScanOver } from './run';

/** The milliseconds a search took, from **Search** to its end, or until `now` while it runs. */
function elapsed(run: SearchRun): number | undefined {
  return run.endedAt === undefined ? undefined : run.endedAt - run.startedAt;
}

function collectionsPart(run: SearchRun): string {
  const total = run.scans.length;
  const over = run.scans.filter(isScanOver).filter((scan) => scan.state.kind !== 'stopped').length;
  switch (run.state) {
    case 'listing':
      return text.summary.listing;
    case 'searching':
      return text.summary.reading(over, total);
    case 'stopped':
      return text.summary.stopped(total, over);
    case 'done':
    case 'error':
      return text.summary.collections(total);
  }
}

/** The parts of the summary, in order, without the state. */
export function summaryParts(run: SearchRun): readonly string[] {
  if (run.state === 'error') {
    return [];
  }
  const read = run.scans.reduce((sum, scan) => sum + scan.read, 0);
  const found = run.scans.reduce((sum, scan) => sum + scan.found, 0);
  const groups = run.scans.filter((scan) => scan.found > 0).length;
  const unreadable = run.scans.filter((scan) => scan.state.kind === 'error').length;
  const milliseconds = elapsed(run);
  return [
    collectionsPart(run),
    ...(read > 0 ? [text.summary.documentsRead(read)] : []),
    ...(found > 0 ? [text.summary.found(found, groups)] : []),
    ...(unreadable > 0 ? [text.summary.notReadable(unreadable)] : []),
    ...((run.excluded ?? 0) > 0 ? [text.summary.excluded(run.excluded ?? 0)] : []),
    ...(milliseconds === undefined ? [] : [text.summary.seconds(milliseconds)]),
  ];
}

/** The summary of the options row with its state: *14 collections · 12,400 documents read · 2.4 s · done*. */
export function summaryText(run: SearchRun): string {
  return [...summaryParts(run), text.summary.states[run.state]].join(text.summary.separator);
}

/** What a group's head says after its name: the count, the reading, *first 1,000 read*, the server's message. */
export function headParts(scan: CollectionScan): readonly string[] {
  const count = scan.found > 0 ? [text.group.documents(scan.found)] : [];
  switch (scan.state.kind) {
    case 'waiting':
    case 'read':
    case 'stopped':
      return count;
    case 'reading':
      return [...count, text.group.reading(scan.read, scan.collection.view ? undefined : scan.collection.estimate)];
    case 'first-read':
      return [...count, text.group.firstRead(scan.state.limit)];
    case 'error':
      return [...count, scan.state.message];
  }
}

/** The text of an empty search, once it ended or was stopped with nothing found. */
export function emptyText(run: SearchRun): string | undefined {
  const found = run.scans.some((scan) => scan.found > 0);
  if (found) {
    return undefined;
  }
  if (run.state === 'done') {
    return text.empty.done(run.text);
  }
  return run.state === 'stopped' ? text.empty.stopped(run.text) : undefined;
}
