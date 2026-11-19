/**
 * A request of a read that failed, given to `parse` in place of its reply: `{ kind: 'error', message, code }`, the
 * server's message and its error code when it has one. Each part of a section reads its own requests, so a part that
 * fails leaves the others as they are (`monitor.show`, "States").
 */
import { isRecord } from './ejson';

/** What a failed request left: the server's message, without secrets, and its code. */
export interface Failure {
  readonly message: string;
  readonly code?: number;
}

/** What a part of a page read: its value, or the failure of its request. */
export type PartRead<T> =
  { readonly kind: 'read'; readonly value: T } | { readonly kind: 'failed'; readonly failure: Failure };

/** A part that was read. */
export function readValue<T>(value: T): PartRead<T> {
  return { kind: 'read', value };
}

/** A part whose request failed. */
export function failedPart<T>(failure: Failure): PartRead<T> {
  return { kind: 'failed', failure };
}

/** The value of a part, when it was read. */
export function valueOfPart<T>(part: PartRead<T> | undefined): T | undefined {
  return part?.kind === 'read' ? part.value : undefined;
}

/** The failure of a reply that is one, or `undefined` for a reply. */
export function failureOf(reply: unknown): Failure | undefined {
  if (reply instanceof Error) {
    const code = (reply as Error & { code?: unknown }).code;
    return typeof code === 'number' ? { message: reply.message, code } : { message: reply.message };
  }
  if (!isRecord(reply) || reply['kind'] !== 'error' || typeof reply['message'] !== 'string') {
    return undefined;
  }
  const code = reply['code'];
  return typeof code === 'number' ? { message: reply['message'], code } : { message: reply['message'] };
}

/** A reply as a part: the failure it is, or the value `read` makes of it. */
export function partOf<T>(reply: unknown, read: (reply: unknown) => T): PartRead<T> {
  const failure = failureOf(reply);
  return failure === undefined ? readValue(read(reply)) : failedPart(failure);
}

/** The codes of a server that does not allow a command: an Atlas tier, a command not supported, one not found. */
const notAllowedCodes = new Set([8000, 115, 59]);

/** The code of a command that needs a role the user does not have (`Unauthorized`). */
const unauthorizedCode = 13;

/** Why a command could not be read, as the page says it (`monitor.show`, "A command the server does not allow"). */
export type RefusalKind = 'needs-role' | 'not-allowed' | 'other';

/** The kind of a failure: a missing role, a command the server does not allow, or another error. */
export function refusalKindOf(failure: Failure): RefusalKind {
  if (failure.code === unauthorizedCode) {
    return 'needs-role';
  }
  return failure.code !== undefined && notAllowedCodes.has(failure.code) ? 'not-allowed' : 'other';
}

/** The message without the command some servers append to it: *not authorized on config to execute command { … }*. */
export function shortMessage(message: string): string {
  return message.replace(/ to execute command \{[\s\S]*$/u, '');
}
