/**
 * Feature: console.history
 *
 * The commands run in the console of a connection, kept between starts, so that `Up` brings back what was typed the
 * day before. A line is kept once it was sent to the server, as it was typed without the spaces at its ends; a line
 * with a secret argument, any `AUTH` and any `HELLO` with the word `AUTH` are never kept (D43).
 */
import { commandArguments } from './parse-line';
import { holdsSecret } from './secret-arguments';

/** How many commands are kept for each connection by default (`datardo.console.historySize`, Datardo's choice). */
export const defaultHistorySize = 500;

/** Feature: console.history — the history after `line` was sent, `secrets` being its secret positions. */
export function historyAfter(
  history: readonly string[],
  line: string,
  secrets: readonly number[],
  size: number,
): readonly string[] {
  if (size <= 0) {
    return [];
  }
  const kept = line.trim();
  const read = commandArguments(kept);
  const neverKept = kept === '' || secrets.length > 0 || read.kind === 'invalid' || holdsSecret(read.arguments);
  const after = neverKept || history[history.length - 1] === kept ? history : [...history, kept];
  return after.length > size ? after.slice(after.length - size) : after;
}

/** Where `Up` and `Down` are in the history: the line shown, and what was being typed before the first `Up`. */
export interface HistoryBrowsing {
  /** The index of the line shown, from the oldest; none while what is typed is shown. */
  readonly place?: number;
  readonly typed: string;
}

/** Not going through the history. */
export const notBrowsing: HistoryBrowsing = { typed: '' };

/**
 * The line `Up` (older) or `Down` (newer) shows, and where the browsing is then. `Down` past the newest brings back
 * what was being typed before the first `Up`; `Up` on the oldest stays on it.
 */
export function browseHistory(
  history: readonly string[],
  browsing: HistoryBrowsing,
  input: string,
  direction: 'older' | 'newer',
): { readonly browsing: HistoryBrowsing; readonly line: string } {
  const typed = browsing.place === undefined ? input : browsing.typed;
  if (direction === 'older') {
    const place = browsing.place === undefined ? history.length - 1 : Math.max(0, browsing.place - 1);
    const line = history[place];
    return line === undefined ? { browsing, line: input } : { browsing: { place, typed }, line };
  }
  if (browsing.place === undefined) {
    return { browsing, line: input };
  }
  const place = browsing.place + 1;
  const line = history[place];
  return line === undefined ? { browsing: notBrowsing, line: typed } : { browsing: { place, typed }, line };
}
