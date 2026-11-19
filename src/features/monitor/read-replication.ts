/**
 * Feature: monitor.read-replication
 *
 * The kind of server, the members of its replica set with their configuration, and the size and window of the oplog.
 * Two steps, started with `{ connection, step }`: `hello` sends `db.adminCommand({ hello: 1 })`; on a replica set,
 * `replica-set`, with `hello` (the reply of the first step), sends `replSetGetStatus` and `replSetGetConfig`, the
 * `$collStats` of `local.oplog.rs`, and its first and last entries. Each request of the second step may fail alone.
 * Ported from Mongoster's `src/monitor.ts › loadReplication`; `src/replication.ts › helloMembers`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { int, listOf, numberOf, recordOf, textOf, timestampOf, dateOf, type JsonRecord } from './parts/ejson';
import { failureOf, partOf, type Failure, type PartRead } from './parts/failure';
import { adminCommand, collectionCall, engineRead } from './parts/requests';
import { members as pairedMembers, type ReplicaMember } from './replication-lag';
import { readConnection, textArg } from './types';

/** What `hello` says the server is. */
export type ServerKind =
  | { readonly kind: 'mongos' }
  | { readonly kind: 'standalone'; readonly me?: string }
  | { readonly kind: 'replica-set'; readonly setName: string; readonly me?: string; readonly primary?: string };

/** The election settings of the configuration. */
export interface ElectionSettings {
  readonly timeoutMillis?: number;
  readonly heartbeatMillis?: number;
  readonly chainingAllowed?: boolean;
}

/** The size and the window of the oplog. */
export interface OplogWindow {
  readonly size?: number;
  readonly maxSize?: number;
  readonly count?: number;
  /** The times of the first and the last entry, in milliseconds since 1970. */
  readonly first?: number;
  readonly last?: number;
  /** The seconds between the first and the last entry's timestamps, 0 at least. */
  readonly windowSeconds?: number;
}

/** What the second step gives, on a replica set. */
export interface ReplicaSetRead {
  readonly setName: string;
  readonly me?: string;
  readonly primary?: string;
  readonly term?: number;
  readonly protocolVersion?: number;
  readonly election: ElectionSettings;
  readonly members: readonly ReplicaMember[];
  /** The failure of `replSetGetStatus`: the members are then those `hello` names. */
  readonly statusFailure?: Failure;
  readonly configFailure?: Failure;
  readonly oplog: PartRead<OplogWindow>;
}

/** What a step gives. */
export type ReplicationRead =
  | { readonly step: 'hello'; readonly server: PartRead<ServerKind>; readonly hello?: Json }
  | { readonly step: 'replica-set'; readonly replicaSet: ReplicaSetRead };

function oplogCall(method: string, args: readonly Json[], limit?: number): ReturnType<typeof collectionCall> {
  return collectionCall({
    database: 'local',
    collection: 'oplog.rs',
    method,
    arguments: args,
    ...(limit === undefined ? {} : { limit }),
  });
}

function edgeEntry(direction: 1 | -1): ReturnType<typeof collectionCall> {
  return oplogCall(
    'find',
    [{}, { projection: { ts: int(1), wall: int(1) }, sort: { $natural: int(direction) }, limit: int(1) }],
    1,
  );
}

/** Feature: monitor.read-replication — `hello`, or the requests of a replica set. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = readConnection(args);
  if (textArg(args, 'step') !== 'replica-set') {
    return engineRead(connection, [adminCommand({ hello: int(1) })]);
  }
  return engineRead(connection, [
    adminCommand({ replSetGetStatus: int(1) }),
    adminCommand({ replSetGetConfig: int(1) }),
    oplogCall('aggregate', [[{ $collStats: { storageStats: {} } }]]),
    edgeEntry(1),
    edgeEntry(-1),
  ]);
}

/** What `hello` says the server is: a mongos for `isdbgrid`, a standalone server without `setName`. */
export function serverKindOf(hello: unknown): ServerKind {
  const fields = recordOf(hello);
  const me = textOf(fields['me']);
  const setName = textOf(fields['setName']);
  if (fields['msg'] === 'isdbgrid') {
    return { kind: 'mongos' };
  }
  if (setName === undefined) {
    return me === undefined ? { kind: 'standalone' } : { kind: 'standalone', me };
  }
  const primary = textOf(fields['primary']);
  return {
    kind: 'replica-set',
    setName,
    ...(me === undefined ? {} : { me }),
    ...(primary === undefined ? {} : { primary }),
  };
}

function names(value: Json | undefined): readonly string[] {
  return listOf(value).flatMap((each) => (typeof each === 'string' ? [each] : []));
}

/** The members `hello` names, when `replSetGetStatus` is refused (rule 3). */
export function helloMembers(hello: unknown): readonly ReplicaMember[] {
  const fields = recordOf(hello);
  const listed = [
    ...names(fields['hosts']).map((name) => ({ name, arbiter: false, priority: undefined })),
    ...names(fields['passives']).map((name) => ({ name, arbiter: false, priority: 0 })),
    ...names(fields['arbiters']).map((name) => ({ name, arbiter: true, priority: undefined })),
  ];
  const me = textOf(fields['me']);
  return listed.map((each, id): ReplicaMember => {
    const self = each.name === me;
    const state =
      each.name === fields['primary']
        ? 'PRIMARY'
        : each.arbiter
          ? 'ARBITER'
          : self && fields['secondary'] === true
            ? 'SECONDARY'
            : '?';
    return {
      id,
      name: each.name,
      state,
      healthy: true,
      self,
      hidden: false,
      arbiter: each.arbiter,
      tags: [],
      ...(each.priority === undefined ? {} : { priority: each.priority }),
      status: { hello: each.name },
    };
  });
}

function electionOf(config: JsonRecord): ElectionSettings {
  const settings = recordOf(config['settings']);
  const timeout = numberOf(settings['electionTimeoutMillis']);
  const heartbeat = numberOf(settings['heartbeatIntervalMillis']);
  const chaining = settings['chainingAllowed'];
  return {
    ...(timeout === undefined ? {} : { timeoutMillis: timeout }),
    ...(heartbeat === undefined ? {} : { heartbeatMillis: heartbeat }),
    ...(typeof chaining === 'boolean' ? { chainingAllowed: chaining } : {}),
  };
}

/** The time of an edge entry: its `wall`, else its timestamp's seconds. */
function entryTime(entry: unknown): number | undefined {
  const fields = recordOf(entry);
  const seconds = timestampOf(fields['ts'])?.t;
  return dateOf(fields['wall']) ?? (seconds === undefined ? undefined : seconds * 1000);
}

/** The window of the oplog from its `$collStats` and its first and last entries (rule 4). */
export function oplogWindowOf(stats: unknown, first: unknown, last: unknown): OplogWindow {
  const storage = recordOf(recordOf(listOf(stats)[0])['storageStats']);
  const firstEntry = listOf(first)[0];
  const lastEntry = listOf(last)[0];
  const firstSeconds = timestampOf(recordOf(firstEntry)['ts'])?.t;
  const lastSeconds = timestampOf(recordOf(lastEntry)['ts'])?.t;
  const parts: Record<string, number | undefined> = {
    size: numberOf(storage['size']),
    maxSize: numberOf(storage['maxSize']),
    count: numberOf(storage['count']),
    first: entryTime(firstEntry),
    last: entryTime(lastEntry),
    windowSeconds:
      firstSeconds === undefined || lastSeconds === undefined ? undefined : Math.max(0, lastSeconds - firstSeconds),
  };
  return Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== undefined));
}

function oplogPart(stats: unknown, first: unknown, last: unknown): PartRead<OplogWindow> {
  const failure = failureOf(stats) ?? failureOf(first) ?? failureOf(last);
  return failure === undefined
    ? { kind: 'read', value: oplogWindowOf(stats, first, last) }
    : { kind: 'failed', failure };
}

/** What the second step gives, from its five replies and the reply of `hello`. */
export function replicaSetOf(replies: readonly unknown[], hello: unknown): ReplicaSetRead {
  const [status, config, stats, first, last] = replies;
  const kind = serverKindOf(hello);
  const statusFailure = failureOf(status);
  const configFailure = failureOf(config);
  const configuration = configFailure === undefined ? recordOf(recordOf(config)['config']) : {};
  const statusFields = recordOf(status);
  const term = numberOf(statusFields['term']);
  const protocol = numberOf(configuration['protocolVersion']);
  return {
    setName: kind.kind === 'replica-set' ? kind.setName : (textOf(statusFields['set']) ?? ''),
    ...(kind.kind === 'replica-set' && kind.me !== undefined ? { me: kind.me } : {}),
    ...(kind.kind === 'replica-set' && kind.primary !== undefined ? { primary: kind.primary } : {}),
    ...(term === undefined ? {} : { term }),
    ...(protocol === undefined ? {} : { protocolVersion: protocol }),
    election: electionOf(configuration),
    members:
      statusFailure === undefined
        ? pairedMembers(listOf(statusFields['members']), listOf(configuration['members']))
        : helloMembers(hello),
    ...(statusFailure === undefined ? {} : { statusFailure }),
    ...(configFailure === undefined ? {} : { configFailure }),
    oplog: oplogPart(stats, first, last),
  };
}

/** Feature: monitor.read-replication — what `hello` says, or the replica set. */
export function parse(replies: readonly unknown[], args: Json = null): ReplicationRead {
  if (textArg(args, 'step') !== 'replica-set') {
    const hello = replies[0];
    const server = partOf(hello, serverKindOf);
    return server.kind === 'read' ? { step: 'hello', server, hello: hello as Json } : { step: 'hello', server };
  }
  return { step: 'replica-set', replicaSet: replicaSetOf(replies, recordOf(args)['hello']) };
}

/** The arguments of the second step, when `hello` found a replica set; `undefined` when nothing more is read. */
export function replicaSetArgs(connection: string, read: ReplicationRead): Json | undefined {
  if (read.step !== 'hello' || read.server.kind !== 'read' || read.server.value.kind !== 'replica-set') {
    return undefined;
  }
  return { connection, step: 'replica-set', hello: read.hello ?? null };
}
