/**
 * What `advisor.show` says of what it analyzed: the summary of the collections, the indexes and the suggestions, and
 * where the slow operations come from, with **Turn on…** for the databases whose profiler is off.
 */
import type { ConnectionId } from '../../../shared/ids';
import { sizeText } from '../../connection/overview';
import type { ScopeIndexes } from '../read-indexes';
import type { ScopeSlowOperations } from '../read-slow-operations';
import { text } from '../text';
import { agoText, startControl, type AdvisorControl } from './words';

/** The databases whose profiler is off that get a **Turn on for shop…** button, at most. */
export const turnOnButtons = 8;

/** The threshold when no profiler said it. */
const defaultThreshold = 100;

/** A line under the sources, with its buttons. */
export interface SourceNote {
  readonly text: string;
  readonly buttons: readonly AdvisorControl[];
}

/** Where the slow operations come from. */
export interface SourcesView {
  readonly line: string;
  readonly notes: readonly SourceNote[];
}

/** `12 collections · 34 indexes · 1.2 GB of indexes · 5 suggestions`, or `… · nothing to suggest`. */
export function summaryText(indexes: ScopeIndexes, suggestions: number): string {
  const all = indexes.collections.flatMap((collection) => collection.indexes);
  const bytes = all.reduce((total, index) => total + (index.size ?? 0), 0);
  return [
    text.summary.collections(indexes.collections.length),
    text.summary.indexes(all.length),
    text.summary.size(sizeText(bytes)),
    suggestions === 0 ? text.summary.nothing : text.summary.suggestions(suggestions),
  ].join(' · ');
}

function lineOf(slow: ScopeSlowOperations, now: number): string {
  const threshold = slow.threshold ?? defaultThreshold;
  const giving = slow.profilers.filter((each) => each.operations > 0);
  const fromProfiler = giving.reduce((total, each) => total + each.operations, 0);
  const fromLog = slow.log.kind === 'read' ? slow.log.operations : 0;
  if (fromProfiler + fromLog === 0 || slow.oldest === undefined) {
    return text.sources.none(threshold);
  }
  const named = giving.length === 1 && fromLog === 0 ? giving[0]?.database : undefined;
  const parts = [
    fromProfiler > 0 ? text.sources.fromProfiler(fromProfiler, named) : '',
    fromLog > 0 ? text.sources.fromLog(fromLog) : '',
  ].filter((part) => part !== '');
  return text.sources.line(threshold, parts.join(', '), agoText(now - slow.oldest));
}

/** What the sources show, for a connection that may write or not. */
export interface SourcesInput {
  readonly connection: ConnectionId;
  readonly readOnly: boolean;
  readonly now: number;
}

function turnOn(input: SourcesInput, database: string, label: string, threshold: number): AdvisorControl {
  return startControl({
    label,
    element: 'advisor.turn-on-profiler@toolbar',
    feature: 'advisor.turn-on-profiler',
    target: { kind: 'database', connection: input.connection, database },
    args: { connection: input.connection, database },
    tooltip: text.sources.turnOnTooltip(database, threshold),
  });
}

function profilerOffNotes(input: SourcesInput, slow: ScopeSlowOperations): readonly SourceNote[] {
  const threshold = slow.threshold ?? defaultThreshold;
  const off = slow.profilers.filter((each) => each.level === 0 && each.operations === 0).map((each) => each.database);
  const [only] = off;
  if (only === undefined) {
    return [];
  }
  if (off.length === 1) {
    const buttons = input.readOnly ? [] : [turnOn(input, only, text.sources.turnOn, threshold)];
    return [{ text: text.sources.profilerOff(only), buttons }];
  }
  const buttons = input.readOnly
    ? []
    : off
        .slice(0, turnOnButtons)
        .map((database) => turnOn(input, database, text.sources.turnOnFor(database), threshold));
  return [{ text: text.sources.profilersOff(off.length), buttons }];
}

/** Where the slow operations come from, and the lines under it. */
export function sourcesView(input: SourcesInput, indexes: ScopeIndexes, slow: ScopeSlowOperations): SourcesView {
  const failures = [
    ...slow.profilers.flatMap((each) =>
      each.error === undefined ? [] : [text.sources.failed(each.database, each.error)],
    ),
    ...indexes.failed.map((each) => text.sources.failed(each.namespace, each.message)),
  ];
  return {
    line: lineOf(slow, input.now),
    notes: [
      ...(slow.log.kind === 'failed' ? [{ text: text.sources.logUnreadable(slow.log.message), buttons: [] }] : []),
      ...profilerOffNotes(input, slow),
      ...failures.map((each) => ({ text: each, buttons: [] })),
    ],
  };
}
