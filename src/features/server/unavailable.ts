/**
 * Feature: server.unavailable
 *
 * Turns the server's refusal of a command into a sentence that says whether the user lacks a permission (`NOPERM`,
 * an ACL user without the command), the server lacks the command (an older server, another server, a command renamed
 * or turned off), or the server is loading its data; and whether the automatic refresh sends the command again. A
 * permission or a command does not appear by itself, so those two are sent again only with **Refresh** and when the
 * section is chosen again.
 */
import { text } from './text';
import { failureOf, readPart, type PartRead, type Unavailable, type UnavailableKind } from './types';

function kindOf(error: string): UnavailableKind {
  const start = error.trimStart().toLowerCase();
  if (start.startsWith('noperm')) {
    return 'not-allowed';
  }
  if (start.startsWith('err unknown command') || start.startsWith('err unknown subcommand')) {
    return 'not-there';
  }
  return start.startsWith('loading') ? 'loading' : 'other';
}

/**
 * Feature: server.unavailable — the sentence of the error reply of `command` (as the page sent it, with its
 * subcommand and without its arguments: `CLIENT LIST`), its kind, and whether it is tried again by itself.
 */
export function unavailableSentence(command: string, error: string): Unavailable {
  const kind = kindOf(error);
  return {
    command,
    kind,
    sentence: text.unavailable[kind](command, error),
    retries: kind === 'loading' || kind === 'other',
  };
}

/** A part from its reply: the sentence of `command` when the reply is an error, the value `read` gives otherwise. */
export function partOf<T>(command: string, reply: unknown, read: (reply: unknown) => T): PartRead<T> {
  const failure = failureOf(reply);
  return failure === undefined
    ? readPart(read(reply))
    : { kind: 'unavailable', unavailable: unavailableSentence(command, failure) };
}

/** Whether the automatic refresh sends again the read of a part: never after a refusal that does not change by itself. */
export function isReadByAutoRefresh(last: PartRead<unknown> | undefined): boolean {
  return last?.kind !== 'unavailable' || last.unavailable.retries;
}
