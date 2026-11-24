/**
 * Feature: mcp.output-limits
 *
 * What bounds every tool of the MCP server: how much text it returns (`MAX_OUTPUT`), how long a query or a command may
 * run (`MAX_TIME_MS`), where counts stop (`COUNT_CAP`), the largest `skip` (`SKIP_MAX`), the messages of one batch
 * (`MAX_BATCH`), and the tools' own bounds on items and values, so that a result never floods the model's context and a
 * tool never runs for long on the user's server.
 */
import { groupThousands } from '../../shared/text-units';

/** Characters of output of every tool, with no exception. */
export const MAX_OUTPUT = 60_000;

/** The `maxTimeMS` of every query and command the tools send to MongoDB, and how long a Redis tool waits. */
export const MAX_TIME_MS = 30_000;

/** Counts stop here unless `exact` is asked. */
export const COUNT_CAP = 100_000;

/** The largest `skip` of `find_documents`, so that a call cannot make the server walk a collection for nothing. */
export const SKIP_MAX = 1_000_000;

/** The messages of one JSON-RPC batch, each of which may run a command for {@link MAX_TIME_MS} (`mcp.server`). */
export const MAX_BATCH = 20;

/** The characters `watch_changes`, `write_history` and `redis_scan_keys` keep for their head and foot. */
export const HEAD_AND_FOOT = 2000;

/** Characters of a value in a change, an oplog entry or a Redis value before it is cut. */
export const LONGEST_VALUE = 1500;

/** Characters of a distinct value, a running operation's command or a slow command before it is cut with `…`. */
export const LONGEST_LINE = 300;

/** Field lines of `describe_collection`. */
export const MOST_FIELDS = 400;

/** The tools' own bounds, as `[default, lowest, highest]`. */
export const bounds = {
  documents: [20, 1, 100],
  distinctValues: [50, 1, 500],
  keys: [100, 1, 1000],
  items: [20, 1, 100],
} as const;

/** `SCAN` asks for at most this many keys at a time *(Datardo's choice)*. */
export const SCAN_COUNT = 500;

/** `redis_scan_keys` sends `SCAN` at most this many times in a call *(Datardo's choice)*. */
export const SCAN_CALLS = 20;

/** Bytes of a string `redis_read_value` reads in one call *(Datardo's choice)*. */
export const STRING_PART = 4000;

/** The line that ends a text cut at {@link MAX_OUTPUT}. */
export function truncationLine(max: number): string {
  return `… (output truncated at ${groupThousands(max)} characters)`;
}

/**
 * Feature: mcp.output-limits — the text, or its start cut at the last line break before `max` when that is past half
 * of it (otherwise at `max`), followed by a line that says it was cut.
 */
export function truncated(text: string, max: number = MAX_OUTPUT): string {
  if (text.length <= max) {
    return text;
  }
  const lineBreak = text.lastIndexOf('\n', max);
  const cut = lineBreak > max / 2 ? lineBreak : max;
  return `${text.slice(0, cut)}\n${truncationLine(max)}`;
}

/** A value of a change, an oplog entry or a key, cut at 1,500 characters with `… (<n> more characters)`. */
export function clippedValue(text: string, most: number = LONGEST_VALUE): string {
  return text.length <= most ? text : `${text.slice(0, most)}… (${groupThousands(text.length - most)} more characters)`;
}

/** A line cut at 300 characters with `…`: a distinct value, the command of an operation, a slow command. */
export function clippedLine(text: string, most: number = LONGEST_LINE): string {
  return text.length <= most ? text : `${text.slice(0, most)}…`;
}

/** The items that fit, whole, and how many were left out. */
export interface FittedItems {
  readonly shown: readonly string[];
  readonly left: number;
}

/**
 * The items, each one or more lines, that fit whole in the output once {@link HEAD_AND_FOOT} characters are kept for
 * the head and the foot; the others are left out whole and counted, so that the next call can get them.
 */
export function fittedItems(items: readonly string[], room: number = MAX_OUTPUT - HEAD_AND_FOOT): FittedItems {
  let used = 0;
  let shown = 0;
  for (const item of items) {
    if (used + item.length + 1 > room) {
      break;
    }
    used += item.length + 1;
    shown += 1;
  }
  return { shown: items.slice(0, shown), left: items.length - shown };
}

/** `1,234 documents`, `1 document`: a count with its word, singular for one. */
export function counted(count: number, word: string, plural = `${word}s`): string {
  return `${groupThousands(count)} ${count === 1 ? word : plural}`;
}
