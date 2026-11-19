/**
 * Feature: server.read-clients
 *
 * The clients connected to the server (`CLIENT LIST`), as rows of the Clients section. A field a line does not have is
 * missing, not 0 (`laddr` is given from Redis 6.2, `ssub` and `resp` from 7.0, `lib-name` from 7.2); every field of the
 * line is kept for the inspector island. The client the page reads with, and Datardo's other clients, are marked.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { partOf } from './unavailable';
import { numberOfText, serverCommand, textArg, textOf, type NamedValue, type PartRead } from './types';

/** The command as the page sends it, for `server.unavailable`. */
export const clientListCommand = 'CLIENT LIST';

/** One client of the server, as a line of `CLIENT LIST` gives it. */
export interface ServerClient {
  /** As the server wrote it: a 64-bit number, kept as text. */
  readonly id: string;
  /** Its address and port: `10.0.0.7:52144`. */
  readonly address?: string;
  /** The server's address it reached (`laddr`, Redis 6.2). */
  readonly localAddress?: string;
  readonly name?: string;
  readonly user?: string;
  readonly database?: number;
  readonly ageSeconds?: number;
  readonly idleSeconds?: number;
  readonly flags?: string;
  /** Its last command, in lower case: `client|list` from Redis 7.0. */
  readonly command?: string;
  readonly channels?: number;
  readonly patterns?: number;
  readonly shardChannels?: number;
  /** The commands queued in a transaction; -1 when none. */
  readonly queued?: number;
  /** `tot-mem`, in bytes (Redis 6.0). */
  readonly memoryBytes?: number;
  /** `omem`: the bytes waiting to be sent to it. */
  readonly outputBytes?: number;
  readonly protocol?: number;
  readonly libraryName?: string;
  readonly libraryVersion?: string;
  /** Every field of the line, in its order, those not known included. */
  readonly fields: readonly NamedValue[];
  /** The client whose `id` `CLIENT ID` answered to this page. */
  readonly own: boolean;
  /** A client whose name starts with `datardo`. */
  readonly datardo: boolean;
}

/** Feature: server.read-clients — `CLIENT LIST`, with `{ connection, own }`, `own` being what `CLIENT ID` answered. */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(textArg(args, 'connection')), request: serverCommand('CLIENT', 'LIST') }],
  };
}

/** The pairs of a line: `field=value` separated by spaces, each split at its first `=`; a value may be empty. */
export function pairsOfClientLine(line: string): readonly NamedValue[] {
  return line
    .split(' ')
    .filter((part) => part !== '')
    .map((part) => {
      const equals = part.indexOf('=');
      return equals < 0 ? ([part, ''] as const) : ([part.slice(0, equals), part.slice(equals + 1)] as const);
    });
}

const textFields = {
  address: 'addr',
  localAddress: 'laddr',
  name: 'name',
  user: 'user',
  flags: 'flags',
  command: 'cmd',
  libraryName: 'lib-name',
  libraryVersion: 'lib-ver',
} as const;

const numberFields = {
  database: 'db',
  ageSeconds: 'age',
  idleSeconds: 'idle',
  channels: 'sub',
  patterns: 'psub',
  shardChannels: 'ssub',
  queued: 'multi',
  memoryBytes: 'tot-mem',
  outputBytes: 'omem',
  protocol: 'resp',
} as const;

/** A client from the text of its line. */
export function clientOfLine(line: string, own?: string): ServerClient {
  const fields = pairsOfClientLine(line);
  const values = new Map(fields);
  const texts = Object.entries(textFields).flatMap(([name, field]) => {
    const value = values.get(field);
    return value === undefined ? [] : [[name, value] as const];
  });
  const numbers = Object.entries(numberFields).flatMap(([name, field]) => {
    const value = numberOfText(values.get(field));
    return value === undefined ? [] : [[name, value] as const];
  });
  const id = values.get('id') ?? '';
  return {
    ...(Object.fromEntries([...texts, ...numbers]) as Omit<ServerClient, 'id' | 'fields' | 'own' | 'datardo'>),
    id,
    fields,
    own: own !== undefined && own !== '' && id === own,
    datardo: (values.get('name') ?? '').startsWith('datardo'),
  };
}

/** The clients of the text of `CLIENT LIST`, one per line. */
export function clientsOf(list: string, own?: string): readonly ServerClient[] {
  return list
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => clientOfLine(line.trim(), own));
}

/** Feature: server.read-clients — the clients, or the sentence of `server.unavailable` when `CLIENT LIST` was refused. */
export function parse(replies: readonly unknown[], args: Json = null): PartRead<readonly ServerClient[]> {
  const own = textArg(args, 'own');
  return partOf(clientListCommand, replies[0], (reply) => clientsOf(textOf(reply), own));
}

/** The request of `CLIENT ID`, sent once when the page opens, to know which row is the page's own. */
export function clientIdRequest(): ReturnType<typeof serverCommand> {
  return serverCommand('CLIENT', 'ID');
}

/** The id `CLIENT ID` answered, as text; `undefined` when it was refused. */
export function parseClientId(reply: unknown): string | undefined {
  if (typeof reply === 'number' || typeof reply === 'bigint') {
    return String(reply);
  }
  const text = textOf(reply);
  return /^\d+$/u.test(text) ? text : undefined;
}
