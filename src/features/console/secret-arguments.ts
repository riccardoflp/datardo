/**
 * Feature: console.secret-arguments
 *
 * Marks the arguments of a command that hold a password, so that the output, the confirmation, the Log and the history
 * never show one. Names and option words are compared without case; a script is not read, so a password written
 * inside the text of `EVAL` is not found.
 */
import { commandArguments } from './parse-line';
import type { CommandArguments } from './types';
import { upperWords } from './types';

/** What a secret argument is written as. */
export const maskedArgument = '***';

/** The parameters of `CONFIG SET` whose value is a secret: `requirepass`, and names ending as a password's do. */
export function isSecretParameter(parameter: string): boolean {
  return /(pass|password|auth|secret)$/u.test(parameter.toLowerCase());
}

function authSecrets(words: readonly string[]): readonly number[] {
  if (words.length === 2) {
    return [1];
  }
  return words.length >= 3 ? [2] : [];
}

/** `HELLO <version> [AUTH <username> <password>] [SETNAME <name>]`: the second argument after `AUTH`. */
function helloSecrets(words: readonly string[]): readonly number[] {
  const found: number[] = [];
  let index = 2;
  while (index < words.length) {
    if (words[index] === 'AUTH') {
      if (index + 2 < words.length) {
        found.push(index + 2);
      }
      index += 3;
    } else {
      index += words[index] === 'SETNAME' ? 2 : 1;
    }
  }
  return found;
}

/** `MIGRATE <host> <port> <key> <db> <timeout> …`: after `AUTH` and the second after `AUTH2`, before `KEYS`. */
function migrateSecrets(words: readonly string[]): readonly number[] {
  const found: number[] = [];
  let index = 6;
  while (index < words.length && words[index] !== 'KEYS') {
    const word = words[index];
    const secret = word === 'AUTH' ? index + 1 : word === 'AUTH2' ? index + 2 : undefined;
    if (secret !== undefined && secret < words.length) {
      found.push(secret);
    }
    index = secret === undefined ? index + 1 : secret + 1;
  }
  return found;
}

/** `CONFIG SET <parameter> <value> …`: the value of every parameter that is a secret. */
function configSetSecrets(words: readonly string[]): readonly number[] {
  const found: number[] = [];
  for (let index = 2; index + 1 < words.length; index += 2) {
    if (isSecretParameter(words[index] ?? '')) {
      found.push(index + 1);
    }
  }
  return found;
}

/** `ACL SETUSER <username> <rule> …`: every rule that adds or removes a password or its hash. */
function aclSetUserSecrets(command: CommandArguments): readonly number[] {
  const found: number[] = [];
  command.forEach((argument, index) => {
    const first = argument[0];
    // `>`, `<`, `#` and `!` are 0x3e, 0x3c, 0x23 and 0x21.
    if (index >= 3 && (first === 0x3e || first === 0x3c || first === 0x23 || first === 0x21)) {
      found.push(index);
    }
  });
  return found;
}

/** Feature: console.secret-arguments — the positions (from 0, the name being 0) of the secret arguments. */
export function secretArguments(command: CommandArguments): readonly number[] {
  const words = upperWords(command);
  const [name = '', second] = words;
  switch (name) {
    case 'AUTH':
      return authSecrets(words);
    case 'HELLO':
      return helloSecrets(words);
    case 'MIGRATE':
      return migrateSecrets(words);
    case 'CONFIG':
      return second === 'SET' ? configSetSecrets(words) : [];
    case 'ACL':
      return second === 'SETUSER' ? aclSetUserSecrets(command) : [];
    default:
      return [];
  }
}

/** The arguments with each secret replaced by the bytes of `***`, as the step's text and the Log write them. */
export function maskedArguments(command: CommandArguments): CommandArguments {
  const secrets = new Set(secretArguments(command));
  const masked = new TextEncoder().encode(maskedArgument);
  return command.map((argument, index) => (secrets.has(index) ? masked : argument));
}

/**
 * A line as typed, each secret argument replaced by `***`, as the output and **Copy command** show it. A line that
 * cannot be read has no argument to mask and is given back as it is.
 */
export function maskedLine(line: string): string {
  const read = commandArguments(line);
  if (read.kind === 'invalid') {
    return line;
  }
  const secrets = secretArguments(read.arguments);
  let masked = line;
  for (const position of [...secrets].sort((first, second) => second - first)) {
    const span = read.spans[position];
    if (span !== undefined) {
      masked = `${masked.slice(0, span.start)}${maskedArgument}${masked.slice(span.end)}`;
    }
  }
  return masked;
}

/** Whether a line holds a secret argument, or is an `AUTH`, or a `HELLO` with the word `AUTH`: never kept. */
export function holdsSecret(command: CommandArguments): boolean {
  const words = upperWords(command);
  const [name] = words;
  return (
    secretArguments(command).length > 0 || name === 'AUTH' || (name === 'HELLO' && words.slice(1).includes('AUTH'))
  );
}
