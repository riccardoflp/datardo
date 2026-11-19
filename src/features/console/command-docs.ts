/**
 * Feature: console.command-docs
 *
 * The names, the summaries and the arguments of the server's commands, for autocomplete and for the hint. Read with
 * `COMMAND DOCS` on a server of 7.0 or later, on the connection's ordinary client; on an older server, on one that
 * answers it with an error, and until the reply arrives, Datardo's built-in list of the commands of Redis 7.2 stands
 * in, without what is newer than the server.
 *
 * The built-in list, `redis-7.2-commands.json`, is made by `test/integration/console/record-replies.test.ts` from
 * `COMMAND DOCS` and `COMMAND INFO` of the test server (Redis 7.4), keeping the commands, subcommands and arguments
 * whose `since` is 7.2 or older, and the flags of `COMMAND INFO`.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import builtinList from './redis-7.2-commands.json';
import type { ArgumentDoc, ArgumentType, CommandDoc } from './types';
import { isAtLeast, jsonField } from './types';

/** The commands a console completes and hints, and where they came from. */
export interface CommandDocs {
  readonly source: 'server' | 'built-in';
  readonly commands: readonly CommandDoc[];
}

/** Datardo's built-in list: the commands of Redis 7.2, with the flags of `COMMAND INFO`. */
export const builtinCommands: readonly CommandDoc[] = (builtinList as { readonly commands: readonly CommandDoc[] })
  .commands;

/** `COMMAND DOCS` needs Redis 7.0. */
export const commandDocsSince = '7.0.0';

/** How long the server has to answer `COMMAND DOCS` (Datardo's choice). */
export const commandDocsTimeLimitMs = 10_000;

/** The `redis_version` of a connection's server, when it is known. */
export function serverVersion(context: Context, connection: string): string {
  const server = context.state.connections.live[connection]?.server;
  return server?.engine === 'redis' ? server.redisVersion : '';
}

/** Feature: console.command-docs — `COMMAND DOCS` on the ordinary client: `{ connection, version }`. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const connection = jsonField(args, 'connection');
  const id = connectionId(typeof connection === 'string' ? connection : '');
  const version = serverVersion(context, id);
  if (version !== '' && !isAtLeast(version, commandDocsSince)) {
    return { kind: 'engine', requests: [] };
  }
  return {
    kind: 'engine',
    requests: [
      { connection: id, request: { ...redisCommand(0, 'COMMAND', 'DOCS'), timeLimitMs: commandDocsTimeLimitMs } },
    ],
  };
}

const decoder = new TextDecoder();

function textOf(reply: RedisReply | undefined): string {
  if (reply instanceof Uint8Array) {
    return decoder.decode(reply);
  }
  return typeof reply === 'number' ? String(reply) : '';
}

/** The pairs of a map: a RESP3 map, or a RESP2 flat array of names and values. */
export function pairsOf(reply: RedisReply | undefined): readonly (readonly [string, RedisReply])[] {
  if (reply !== null && typeof reply === 'object' && 'kind' in reply) {
    return reply.kind === 'map' ? reply.entries.map(([key, each]) => [textOf(key), each] as const) : [];
  }
  if (!Array.isArray(reply)) {
    return [];
  }
  const items = reply as readonly RedisReply[];
  const pairs: (readonly [string, RedisReply])[] = [];
  for (let index = 0; index + 1 < items.length; index += 2) {
    pairs.push([textOf(items[index]), items[index + 1] ?? null]);
  }
  return pairs;
}

function listOf(reply: RedisReply | undefined): readonly RedisReply[] {
  return Array.isArray(reply) ? (reply as readonly RedisReply[]) : [];
}

const argumentTypes: readonly ArgumentType[] = [
  'string',
  'integer',
  'double',
  'key',
  'pattern',
  'unix-time',
  'pure-token',
  'oneof',
  'block',
];

function argumentOf(reply: RedisReply): ArgumentDoc {
  const fields = new Map(pairsOf(reply));
  const type = argumentTypes.find((each) => each === textOf(fields.get('type'))) ?? 'string';
  const displayText = textOf(fields.get('display_text'));
  const token = textOf(fields.get('token'));
  const since = textOf(fields.get('since'));
  const nested = listOf(fields.get('arguments')).map(argumentOf);
  return {
    name: textOf(fields.get('name')),
    type,
    ...(displayText === '' ? {} : { displayText }),
    ...(token === '' ? {} : { token }),
    flags: listOf(fields.get('flags')).map(textOf),
    ...(since === '' ? {} : { since }),
    ...(nested.length === 0 ? {} : { arguments: nested }),
  };
}

function commandOf(name: string, reply: RedisReply): CommandDoc {
  const fields = new Map(pairsOf(reply));
  const deprecated = listOf(fields.get('doc_flags')).map(textOf).includes('deprecated');
  return {
    name: name.toLowerCase(),
    summary: textOf(fields.get('summary')),
    since: textOf(fields.get('since')),
    group: textOf(fields.get('group')),
    arguments: listOf(fields.get('arguments')).map(argumentOf),
    subcommands: pairsOf(fields.get('subcommands')).map(([subcommand, each]) => commandOf(subcommand, each)),
    ...(deprecated
      ? {
          deprecated: {
            since: textOf(fields.get('deprecated_since')),
            replacedBy: textOf(fields.get('replaced_by')),
          },
        }
      : {}),
  };
}

/** Whether something added in `since` is in a server of `version`. */
function isIn(since: string | undefined, version: string): boolean {
  return since === undefined || since === '' || isAtLeast(version, since);
}

function argumentsFor(found: readonly ArgumentDoc[], version: string): readonly ArgumentDoc[] {
  return found.flatMap((argument) => {
    if (!isIn(argument.since, version)) {
      return [];
    }
    if (argument.arguments === undefined) {
      return [argument];
    }
    const nested = argumentsFor(argument.arguments, version);
    return nested.length === 0 ? [] : [{ ...argument, arguments: nested }];
  });
}

/** The commands, subcommands and arguments a server of `version` has; all of them when the version is unknown. */
export function docsForVersion(commands: readonly CommandDoc[], version: string): readonly CommandDoc[] {
  return commands
    .filter((command) => isIn(command.since, version))
    .map((command) => ({
      ...command,
      arguments: argumentsFor(command.arguments, version),
      subcommands: docsForVersion(command.subcommands, version),
    }));
}

/** The built-in list as a server of `version` has it (rule 4). */
export function builtinDocs(version: string): CommandDocs {
  return { source: 'built-in', commands: docsForVersion(builtinCommands, version) };
}

function isError(reply: unknown): boolean {
  return typeof reply === 'object' && reply !== null && 'kind' in reply && reply.kind === 'error';
}

/**
 * Feature: console.command-docs — the commands of the reply to `COMMAND DOCS`, or the built-in list for the version
 * in `args` when nothing was sent or the server answered with an error.
 */
export function parse(replies: readonly unknown[], args: Json = null): CommandDocs {
  const version = jsonField(args, 'version');
  const [reply] = replies;
  if (reply === undefined || isError(reply)) {
    return builtinDocs(typeof version === 'string' ? version : '');
  }
  return {
    source: 'server',
    commands: pairsOf(reply as RedisReply).map(([name, each]) => commandOf(name, each)),
  };
}

/** The flags of a command, or of its subcommand when `subcommand` names one, in the built-in list. */
export function builtinFlags(name: string, subcommand: string | undefined): readonly string[] | undefined {
  const command = builtinCommands.find((each) => each.name === name.toLowerCase());
  if (command === undefined) {
    return undefined;
  }
  const full = `${command.name}|${(subcommand ?? '').toLowerCase()}`;
  const sub = command.subcommands.find((each) => each.name === full);
  return (sub ?? command).flags ?? [];
}

/** The entry of a command, or of its subcommand when the second word names one. */
export function commandDoc(
  commands: readonly CommandDoc[],
  name: string,
  subcommand: string | undefined,
): CommandDoc | undefined {
  const command = commands.find((each) => each.name === name.toLowerCase());
  if (command === undefined || subcommand === undefined) {
    return command;
  }
  return command.subcommands.find((each) => each.name === `${command.name}|${subcommand.toLowerCase()}`) ?? command;
}
