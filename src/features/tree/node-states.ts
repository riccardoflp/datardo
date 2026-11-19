/**
 * Feature: tree.node-states
 *
 * What a node shows under it while it loads (**Loading…**, once 200 ms have passed), when it holds nothing (**No
 * databases**, **No collections**, **No keys**, **No namespaces**), when a filter keeps nothing, and when reading it
 * fails: the server's message, in the color of errors, with **Retry**. These lines are not nodes: they have no
 * context menu, and `Enter` on one does only what its button does.
 */
import type { Control, Loadable, TreeLine } from './types';
import { text } from './text';

/** How long a read must take before **Loading…** is shown, in ms (Datardo's choice). */
export const loadingDelayMs = 200;

/** Whether **Loading…** is shown for a read started at `since`. */
export function isLoadingShown(since: number, now: number): boolean {
  return now - since >= loadingDelayMs;
}

/** Where the lines go: under which node, at which level. */
export interface LinePlace {
  readonly parent: string;
  readonly level: number;
}

/** A line under a node. `what` tells the lines of one node apart. */
export function line(place: LinePlace, what: string, words: string, more: Partial<TreeLine> = {}): TreeLine {
  return {
    kind: 'line',
    id: `${place.parent}/${what}`,
    parent: place.parent,
    level: place.level,
    tone: 'quiet',
    text: words,
    ...more,
  };
}

/** What a node's read says under it. */
export interface NodeStateInput {
  readonly place: LinePlace;
  readonly loadable: Loadable<unknown>;
  readonly now: number;
  /** Whether what was read holds nothing, and the line that says so. */
  readonly empty?: string;
  /** **Retry**: what reads the node again (`tree.refresh`). */
  readonly retry: Control;
}

/** The line of a read that failed: the server's message, with **Retry**. */
export function failedLine(place: LinePlace, message: string, retry: Control): TreeLine {
  return line(place, 'failed', message, { tone: 'error', button: retry });
}

/** The line of a read in progress, once 200 ms have passed; none before. */
export function loadingLines(place: LinePlace, since: number, now: number): readonly TreeLine[] {
  return isLoadingShown(since, now) ? [line(place, 'loading', text.states.loading)] : [];
}

/**
 * Feature: tree.node-states — the lines under a node for the state of its read: **Loading…** once 200 ms have passed
 * (none while what was read before is still shown), the error with **Retry**, or the line that says it holds nothing.
 */
export function view(input: NodeStateInput): readonly TreeLine[] {
  const { place, loadable } = input;
  switch (loadable.kind) {
    case 'idle':
      return [];
    case 'loading':
      return loadable.previous === undefined ? loadingLines(place, loadable.since, input.now) : [];
    case 'failed':
      return [failedLine(place, loadable.message, input.retry)];
    case 'loaded':
      return input.empty === undefined ? [] : [line(place, 'empty', input.empty)];
  }
}

/** **Nothing matches "<text>"**, under **Databases**. */
export function nothingMatches(place: LinePlace, typed: string): TreeLine {
  return line(place, 'nothing-matches', text.states.nothingMatches(typed));
}

/** **No collections match "<text>"**, under a database shown for its name. */
export function noCollectionsMatch(place: LinePlace, typed: string): TreeLine {
  return line(place, 'no-match', text.states.noCollectionsMatch(typed));
}
