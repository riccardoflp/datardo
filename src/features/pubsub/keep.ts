/**
 * Feature: pubsub.keep
 *
 * Adds the messages that arrive to the list, holds them while the list is paused, and drops the oldest beyond the
 * limit. Each message gets a number, counted from 1 since the tab was opened, so that two equal messages stay two. The
 * rules are those of Mongoster's Watch tab (`src/webview/watch.ts › add`), with a limit of 10,000 in place of 1,000.
 * With **Events of** on, the limit counts the rows of `pubsub.event-rows`, each of which may hold several messages.
 */
import { joinedRow, rebuiltRows, rowOf, withMessage } from './event-rows';
import { oplogEvent } from './oplog-event';
import type { Arrived, Gap, Kept, Message, OplogLink, Row } from './types';

/** The list and the held messages together keep at most this many rows (Datardo's choice). */
export const keptMost = 10_000;

/** The list of a page just opened. */
export const emptyKept: Kept = { listed: [], held: [], paused: false, dropped: 0, next: 1 };

function numbered(arrived: Arrived, number: number): Message | Gap {
  return arrived.kind === 'gap' ? { ...arrived, number } : { ...arrived, number };
}

/** Adds a row to the rows in place, joining the row of its event when it is one (`pubsub.event-rows`). */
function addTo(rows: Row[], row: Message | Gap, link: OplogLink | undefined): void {
  if (row.kind === 'gap' || link === undefined) {
    rows.push(row);
    return;
  }
  const arrived = { message: row, event: oplogEvent(row.channel, row.message, link) };
  const index = joinedRow(rows, arrived);
  const joined = index === undefined ? undefined : rows[index];
  if (index !== undefined && joined?.kind === 'event') {
    rows[index] = withMessage(joined, row);
  } else {
    rows.push(rowOf(arrived));
  }
}

/** The rows beyond the limit dropped, the oldest first, from `listed` first (rule 4). */
function limited(kept: Kept, most: number): Kept {
  const over = kept.listed.length + kept.held.length - most;
  if (over <= 0) {
    return kept;
  }
  const fromListed = Math.min(over, kept.listed.length);
  return {
    ...kept,
    listed: kept.listed.slice(fromListed),
    held: kept.held.slice(over - fromListed),
    dropped: kept.dropped + over,
  };
}

/** Feature: pubsub.keep — the list after the messages that arrived, in the order the server sent them. */
export function messagesAfter(state: Kept, arrived: readonly Arrived[], most: number = keptMost): Kept {
  const rows = [...(state.paused ? state.held : state.listed)];
  let next = state.next;
  for (const each of arrived) {
    addTo(rows, numbered(each, next), state.link);
    next += 1;
  }
  const after = state.paused ? { ...state, held: rows, next } : { ...state, listed: rows, next };
  return limited(after, most);
}

/** The list paused: what arrives is held, and the list stands still. */
export function pausedKept(state: Kept): Kept {
  return { ...state, paused: true };
}

/** The list resumed: the held messages join it, in the order they arrived (rule 3). */
export function resumedKept(state: Kept): Kept {
  return { ...state, listed: [...state.listed, ...state.held], held: [], paused: false };
}

/** The list cleared: nothing listed or held, nothing dropped; the numbering goes on (rule 5). */
export function clearedKept(state: Kept): Kept {
  return { ...state, listed: [], held: [], dropped: 0 };
}

/** The list with **Events of** set to a link, or turned off: its rows built again (`pubsub.event-rows`, rule 5). */
export function keptWithLink(state: Kept, link: OplogLink | undefined, most: number = keptMost): Kept {
  const { link: _before, ...rest } = state;
  const relinked = {
    ...rest,
    listed: rebuiltRows(state.listed, link),
    held: rebuiltRows(state.held, link),
    ...(link === undefined ? {} : { link }),
  };
  return limited(relinked, most);
}
