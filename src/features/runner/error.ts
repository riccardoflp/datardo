/**
 * Feature: runner.error
 *
 * An error Datardo did not decide (the server said no, the network dropped, the disk is full) in the product's
 * words, with the original text and code under **Details**, and never a secret.
 */

/** What kind of error it is, which decides what is offered with it (**Reconnect** for *not connected*). */
export type ErrorKind =
  'not connected' | 'timed out' | 'not allowed' | 'not found' | 'conflict' | 'invalid' | 'disk' | 'other';

/** What the message needs to know of where the error happened. */
export interface ErrorContext {
  /** The name of the connection the error came from. */
  readonly connection?: string;
  /** The time limit of what was sent, in seconds. */
  readonly timeLimitSeconds?: number;
  /** The file or folder that was written. */
  readonly path?: string;
}

/** An error as the user reads it. */
export interface ShownError {
  readonly kind: ErrorKind;
  readonly message: string;
  /** The original text and code of the server or the system, without a secret. */
  readonly details: string;
}

/** What is read of an error, whatever threw it. */
interface ErrorFacts {
  readonly text: string;
  readonly code?: string | number;
  readonly name?: string;
  readonly path?: string;
}

/** Feature: runner.error. The error in the product's words. */
export function errorMessage(error: unknown, context: ErrorContext = {}): ShownError {
  const facts = factsOf(error);
  const text = withoutSecrets(facts.text);
  const details = facts.code === undefined ? text : `${text} (${String(facts.code)})`;
  const [kind, message] = mongoCase(facts, context) ??
    redisCase(text, context) ??
    systemCase(facts, context) ?? ['other', text];
  return { kind, message, details };
}

/** A connection string in a text, with its password replaced by `***`. */
export function withoutSecrets(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/[^:/@\s]*):([^@\s]*)@/giu, '$1:***@');
}

function factsOf(error: unknown): ErrorFacts {
  if (typeof error !== 'object' || error === null) {
    return { text: String(error) };
  }
  const record = error as Record<string, unknown>;
  const text = typeof record['message'] === 'string' ? record['message'] : JSON.stringify(error);
  const code = record['code'];
  return {
    text,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    ...(typeof record['name'] === 'string' ? { name: record['name'] } : {}),
    ...(typeof record['path'] === 'string' ? { path: record['path'] } : {}),
  };
}

type Case = readonly [ErrorKind, string];

function notConnected(context: ErrorContext): Case {
  return ['not connected', `${context.connection ?? 'The connection'} is not connected.`];
}

function notAllowed(context: ErrorContext): Case {
  return ['not allowed', `The user of ${context.connection ?? 'the connection'} is not allowed to do this.`];
}

function mongoCase(facts: ErrorFacts, context: ErrorContext): Case | undefined {
  if (facts.code === 18 || facts.code === 13) {
    return notAllowed(context);
  }
  if (facts.code === 50) {
    return ['timed out', `The server took longer than ${String(context.timeLimitSeconds ?? 60)} seconds.`];
  }
  if (facts.code === 11000) {
    const index = /index: (\S+)/u.exec(facts.text)?.[1] ?? 'key';
    return ['conflict', `A document with the same ${index} already exists.`];
  }
  if (
    facts.name !== undefined &&
    /^Mongo(Network|NetworkTimeout|ServerSelection|TopologyClosed)Error$/u.test(facts.name)
  ) {
    return notConnected(context);
  }
  return undefined;
}

function redisCase(text: string, context: ErrorContext): Case | undefined {
  if (/^(NOAUTH|WRONGPASS|NOPERM)\b/u.test(text)) {
    return notAllowed(context);
  }
  if (text.startsWith('WRONGTYPE')) {
    return ['invalid', 'The key holds another type of value.'];
  }
  if (text.startsWith('READONLY')) {
    return ['not allowed', 'This server is a replica and does not accept writes.'];
  }
  if (text.startsWith('OOM')) {
    return ['other', 'The server is out of memory.'];
  }
  if (/socket closed|the client is closed|connection is closed/iu.test(text)) {
    return notConnected(context);
  }
  return undefined;
}

function systemCase(facts: ErrorFacts, context: ErrorContext): Case | undefined {
  switch (facts.code) {
    case 'ENOSPC':
      return ['disk', 'The disk is full.'];
    case 'EACCES':
    case 'EPERM':
      return ['not allowed', `Datardo may not write to ${facts.path ?? context.path ?? 'this place'}.`];
    case 'ENOENT':
      return ['not found', withoutSecrets(facts.text)];
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ENOTFOUND':
    case 'EHOSTUNREACH':
      return notConnected(context);
    case 'ETIMEDOUT':
      return ['timed out', withoutSecrets(facts.text)];
    case undefined:
    default:
      return undefined;
  }
}
