/**
 * Feature: console.argument-hint
 *
 * Shows, under the input, how the command being typed is written, as the pages of redis.io write it from the same data
 * (`COMMAND DOCS`): its syntax on one line, its summary, and the version it came in.
 */
import { commandDoc } from './command-docs';
import { text } from './text';
import type { ArgumentDoc, CommandDoc } from './types';

/** The hint of a command. */
export interface ArgumentHint {
  /** `SET key value [NX | XX] [GET] …` */
  readonly syntax: string;
  readonly summary: string;
  /** *Since 6.2.0* */
  readonly since: string;
}

function valueOf(argument: ArgumentDoc): string {
  switch (argument.type) {
    case 'pure-token':
      return argument.token ?? argument.name;
    case 'oneof': {
      const choices = (argument.arguments ?? []).map(written).join(' | ');
      return argument.flags.includes('optional') ? choices : `<${choices}>`;
    }
    case 'block':
      return (argument.arguments ?? []).map(written).join(' ');
    case 'string':
    case 'integer':
    case 'double':
    case 'key':
    case 'pattern':
    case 'unix-time':
      return argument.displayText ?? argument.name;
  }
}

/** One argument as the syntax writes it: its token, its value, repeated, optional. */
function written(argument: ArgumentDoc): string {
  const value = valueOf(argument);
  const token = argument.type === 'pure-token' || argument.token === undefined ? '' : `${argument.token} `;
  let shown = `${token}${value}`;
  if (argument.flags.includes('multiple')) {
    shown = argument.flags.includes('multiple_token') ? `${shown} [${shown} ...]` : `${token}${value} [${value} ...]`;
  }
  return argument.flags.includes('optional') ? `[${shown}]` : shown;
}

/** Feature: console.argument-hint — the syntax, the summary and the version of a command's entry. */
export function syntaxLine(command: CommandDoc): ArgumentHint {
  const name = command.name.toUpperCase().replace('|', ' ');
  return {
    syntax: [name, ...command.arguments.map(written)].join(' '),
    summary: command.summary,
    since: text.argumentHint.since(command.since),
  };
}

/**
 * The hint for a line: the command its first word names, once that word is followed by a space or names a command
 * exactly; the subcommand when the second word names one. None when the first word names no command.
 */
export function hintFor(line: string, docs: readonly CommandDoc[]): ArgumentHint | undefined {
  const words = line.trimStart().split(/[ \t]+/u);
  const [first = '', second] = words;
  const command = commandDoc(docs, first, undefined);
  if (command === undefined) {
    return undefined;
  }
  const entry = second === undefined || second === '' ? command : commandDoc(docs, first, second);
  return syntaxLine(entry ?? command);
}
