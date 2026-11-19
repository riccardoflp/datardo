/**
 * Feature: monitor.replication-lag
 *
 * Pairs what the replica set reports about each member (`replSetGetStatus`) with how it is configured
 * (`replSetGetConfig`), and says how far each is behind the primary. Ported from Mongoster's `src/replication.ts ›
 * replMembers`.
 */
import type { Json } from '../../shared/engine-request';
import { dateOf, isRecord, numberOf, recordOf, textOf } from './parts/ejson';

/** One member of a replica set, as the Replication section shows it. */
export interface ReplicaMember {
  readonly id: number;
  readonly name: string;
  /** `PRIMARY`, `SECONDARY`, `ARBITER`, … or `?`. */
  readonly state: string;
  readonly healthy: boolean;
  /** Whether it is the server Datardo is connected to. */
  readonly self: boolean;
  readonly uptime?: number;
  /** When it last applied an operation, in milliseconds since 1970. */
  readonly lastApplied?: number;
  /** How far it is behind the primary, in seconds (glossary, "replication lag"). */
  readonly lagSeconds?: number;
  readonly lastHeartbeat?: number;
  readonly pingMs?: number;
  readonly syncSource?: string;
  readonly message?: string;
  readonly priority?: number;
  readonly votes?: number;
  readonly hidden: boolean;
  readonly arbiter: boolean;
  /** The delay on purpose, in seconds. */
  readonly delaySeconds?: number;
  /** The tags, as `[name, value]`. */
  readonly tags: readonly (readonly [string, string])[];
  /** `false` when it builds no index; absent otherwise. */
  readonly buildIndexes?: false;
  /** The member's entries of `replSetGetStatus`, `replSetGetConfig` or `hello`, for the inspector island. */
  readonly status?: Json;
  readonly config?: Json;
}

/** Whether an instant is in 1970: a member that never applied anything, a heartbeat never received. */
function isNever(milliseconds: number | undefined): boolean {
  return milliseconds === undefined || new Date(milliseconds).getUTCFullYear() === 1970;
}

/** The time a member last applied an operation, when it ever did. */
function appliedOf(member: Readonly<Record<string, Json>>): number | undefined {
  const time = dateOf(member['optimeDate']);
  return isNever(time) || member['stateStr'] === 'ARBITER' ? undefined : time;
}

/** The reference time: the primary's last applied operation, else the latest among the members (rule 1). */
function referenceOf(members: readonly Readonly<Record<string, Json>>[]): number | undefined {
  const primary = members.find((member) => member['stateStr'] === 'PRIMARY');
  if (primary !== undefined) {
    return appliedOf(primary);
  }
  const times = members.map(appliedOf).filter((time): time is number => time !== undefined);
  return times.length === 0 ? undefined : Math.max(...times);
}

function optional<Name extends string, Value>(name: Name, value: Value | undefined): { [key in Name]?: Value } {
  return (value === undefined ? {} : { [name]: value }) as { [key in Name]?: Value };
}

function tagsOf(value: Json | undefined): readonly (readonly [string, string])[] {
  return Object.entries(recordOf(value)).map(([name, tag]) => [
    name,
    typeof tag === 'string' ? tag : JSON.stringify(tag),
  ]);
}

function configured(config: Readonly<Record<string, Json>>): Partial<ReplicaMember> {
  return {
    ...optional('priority', numberOf(config['priority'])),
    ...optional('votes', numberOf(config['votes'])),
    ...optional('delaySeconds', numberOf(config['secondaryDelaySecs'] ?? config['slaveDelay'])),
    ...(config['buildIndexes'] === false ? { buildIndexes: false as const } : {}),
  };
}

function memberOf(
  raw: Json,
  configs: ReadonlyMap<number, Readonly<Record<string, Json>>>,
  reference: number | undefined,
): ReplicaMember {
  const member = recordOf(raw);
  const id = numberOf(member['_id']) ?? -1;
  const config = configs.get(id);
  const applied = appliedOf(member);
  const heartbeat = dateOf(member['lastHeartbeat']);
  const state = textOf(member['stateStr']) ?? '?';
  const message = textOf(member['infoMessage']) || textOf(member['lastHeartbeatMessage']) || undefined;
  return {
    id,
    name: textOf(member['name']) ?? textOf(config?.['host']) ?? '',
    state,
    healthy: numberOf(member['health']) === 1,
    self: member['self'] === true,
    ...optional('uptime', numberOf(member['uptime'])),
    ...optional('lastApplied', applied),
    ...optional(
      'lagSeconds',
      applied === undefined || reference === undefined ? undefined : Math.max(0, (reference - applied) / 1000),
    ),
    ...optional('lastHeartbeat', isNever(heartbeat) ? undefined : heartbeat),
    ...optional('pingMs', numberOf(member['pingMs'])),
    ...optional('syncSource', textOf(member['syncSourceHost']) || undefined),
    ...optional('message', message),
    ...(config === undefined ? {} : configured(config)),
    hidden: config?.['hidden'] === true,
    arbiter: config?.['arbiterOnly'] === true || state === 'ARBITER',
    tags: tagsOf(config?.['tags']),
    status: member,
    ...optional('config', config),
  };
}

/** Feature: monitor.replication-lag — one member per status member, in the status's order. */
export function members(statusMembers: readonly Json[], configMembers: readonly Json[]): readonly ReplicaMember[] {
  const configs = new Map(
    configMembers.filter(isRecord).map((config) => [numberOf(config['_id']) ?? -1, config] as const),
  );
  const records = statusMembers.map(recordOf);
  const reference = referenceOf(records);
  return statusMembers.map((member) => memberOf(member, configs, reference));
}
