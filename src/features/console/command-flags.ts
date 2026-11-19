/**
 * Feature: console.command-flags
 *
 * Asks the server for the flags of a command, to know whether it writes: `COMMAND INFO <name>` with the name in lower
 * case, on the console's own connection, the first time a name is run there. From Redis 7.0 the entry holds the
 * subcommands, each with its own flags; on Redis 6.2 a command with subcommands has one set of flags for all of them.
 * A server that refuses `COMMAND` does not tell, and `console.classify` uses its built-in list alone.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import type { CommandFlags } from './types';
import { consoleClient, jsonField } from './types';

/** How long the server has to answer `COMMAND INFO` (Datardo's choice). */
export const commandFlagsTimeLimitMs = 5000;

function textArg(args: Json, name: string): string | undefined {
  const value = jsonField(args, name);
  return typeof value === 'string' ? value : undefined;
}

/** Feature: console.command-flags — `COMMAND INFO <name>` on the console's connection: `{ connection, name }`. */
export function request(_context: Context, args: Json): ReadRequest | Outcome {
  const connection = connectionId(textArg(args, 'connection') ?? '');
  const name = (textArg(args, 'name') ?? '').toLowerCase();
  return {
    kind: 'engine',
    requests: [
      {
        connection: consoleClient(connection),
        request: { ...redisCommand(0, 'COMMAND', 'INFO', name), timeLimitMs: commandFlagsTimeLimitMs },
      },
    ],
  };
}

const decoder = new TextDecoder();

function textOf(reply: RedisReply | undefined): string {
  return reply instanceof Uint8Array ? decoder.decode(reply) : '';
}

function listOf(reply: RedisReply | undefined): readonly RedisReply[] {
  return Array.isArray(reply) ? (reply as readonly RedisReply[]) : [];
}

function errorOf(reply: unknown): string | undefined {
  return typeof reply === 'object' &&
    reply !== null &&
    'kind' in reply &&
    reply.kind === 'error' &&
    'message' in reply &&
    typeof reply.message === 'string'
    ? reply.message
    : undefined;
}

/** Whether an error means the server refuses `COMMAND` itself: an ACL that denies it, or a server without it. */
export function refusesCommand(message: string): boolean {
  return message.startsWith('NOPERM') || message.startsWith('ERR unknown command');
}

function flagsOf(entry: readonly RedisReply[]): readonly string[] {
  return listOf(entry[2]).map((flag) => textOf(flag).toLowerCase());
}

/**
 * Feature: console.command-flags — the flags of the command of `args.name`, or of its subcommand when `args.subcommand`
 * names one of the entry's subcommands; *unknown* for a nil entry; *not told* when the server refused `COMMAND`.
 */
export function parse(replies: readonly unknown[], args: Json = null): CommandFlags {
  const [reply] = replies;
  const error = errorOf(reply);
  if (error !== undefined) {
    return refusesCommand(error) ? { kind: 'not-told' } : { kind: 'unknown' };
  }
  const entry = listOf(listOf(reply as RedisReply)[0] ?? null);
  if (entry.length === 0) {
    return { kind: 'unknown' };
  }
  const subcommand = textArg(args, 'subcommand');
  if (subcommand !== undefined) {
    const full = `${textOf(entry[0]).toLowerCase()}|${subcommand.toLowerCase()}`;
    const found = listOf(entry[9])
      .map(listOf)
      .find((each) => textOf(each[0]).toLowerCase() === full);
    if (found !== undefined) {
      return { kind: 'told', flags: flagsOf(found) };
    }
  }
  return { kind: 'told', flags: flagsOf(entry) };
}
