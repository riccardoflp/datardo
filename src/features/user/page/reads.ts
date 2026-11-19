/**
 * What the Users and roles page reads, and when (`user.show`, **Reads**): the databases, the users, the roles in one or
 * two rounds, and who the connection is signed in as. The users and the roles are read apart, so that one refused
 * leaves the other shown; a reply that arrives after a newer request of its part was sent is dropped.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, ReadFeature, ReadNeed, ReadRequest } from '../../../shared/feature';
import { featureId, type ConnectionId } from '../../../shared/ids';
import type { RolesRead } from '../list-roles';
import { commandRequest, connectionOfArgs, isRecord, one, recordsOf, textOf } from '../types';

/** The identifier of the read of the databases: `db.adminCommand({ listDatabases: 1, nameOnly: true })`. */
export const databasesReadId = 'user.show:databases';

/** Why the page reads: it opened, **Database** or **Built-in roles** changed, **Refresh**, or a change was made. */
export type PageReadReason = 'opened' | 'database' | 'built-in' | 'refresh' | 'changed' | 'connection-edited';

/** The parts of the page whose replies are kept apart. */
export type PagePart = 'databases' | 'users' | 'roles' | 'signed-in';

/** What the reads are made from. */
export interface PageReadInput {
  readonly connection: ConnectionId;
  /** The database chosen; `undefined` for **All databases**. */
  readonly database?: string;
  readonly builtIn: boolean;
  /** The databases the page lists, for the roles of **All databases** when `admin.system.roles` is refused. */
  readonly known: readonly string[];
}

function need(key: PagePart, read: string, args: Json): ReadNeed {
  return { key, read: featureId(read), args };
}

/**
 * The reads of a reason, each under the name of its part: the databases, the users and the roles every time; who the
 * connection is signed in as when the page opens and when the connection is edited.
 */
export function pageReads(reason: PageReadReason, input: PageReadInput): readonly ReadNeed[] {
  const connection = input.connection;
  const database = input.database ?? null;
  return [
    need('databases', databasesReadId, { connection }),
    need('users', 'user.list', { connection, database }),
    need('roles', 'user.list-roles', { connection, database, builtIn: input.builtIn, known: [...input.known] }),
    ...(reason === 'opened' || reason === 'connection-edited'
      ? [need('signed-in', 'user.signed-in', { connection })]
      : []),
  ];
}

/**
 * The second round of the roles of **All databases**, once the first answered the databases that have custom roles,
 * or failed (`null`): `rolesInfo` to `admin` and those, or to every database the page lists.
 */
export function secondRolesRead(input: PageReadInput, first: RolesRead | null): ReadNeed | undefined {
  if (first !== null && first.kind !== 'custom-role-databases') {
    return undefined;
  }
  return need('roles', 'user.list-roles', {
    connection: input.connection,
    database: null,
    builtIn: input.builtIn,
    known: [...input.known],
    customRoleDatabases: first === null ? null : [...first.databases],
  });
}

/** The requests of each part: the number of the last one sent. */
export type PageRequests = Readonly<Partial<Record<PagePart, number>>>;

/** The requests once one more of a part is sent, and its number. */
export function sendPageRequest(requests: PageRequests, part: PagePart): { requests: PageRequests; number: number } {
  const number = (requests[part] ?? 0) + 1;
  return { requests: { ...requests, [part]: number }, number };
}

/** Whether the reply of request `number` of a part is kept: one older than the last request of its part is dropped. */
export function isLatestPageReply(requests: PageRequests, part: PagePart, number: number): boolean {
  return requests[part] === number;
}

/** The databases of the connection: `listDatabases` with `nameOnly`, which a user without the privilege is refused. */
export const databasesRead: ReadFeature = {
  kind: 'read',
  id: featureId(databasesReadId),
  request: (context: Context, args: Json): ReadRequest => ({
    kind: 'engine',
    requests: [
      {
        connection: connectionOfArgs(args, context),
        request: commandRequest('admin', { listDatabases: one, nameOnly: true }),
      },
    ],
  }),
  parse: (replies) => {
    const reply = replies[0];
    return recordsOf(isRecord(reply) ? reply['databases'] : undefined).flatMap((each) => {
      const name = textOf(each, 'name');
      return name === undefined ? [] : [name];
    });
  },
};
