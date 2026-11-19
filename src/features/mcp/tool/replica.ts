/**
 * The text of `replica_set_status` (`mcp.deployment-tools`): each member from `replSetGetStatus` and
 * `replSetGetConfig`, and the oplog window and size from the first and last entries of `local.oplog.rs` and its
 * `$collStats`. Hosts and replica set names only, never a connection string.
 */
import { counted } from '../output-limits';
import { dateIn, listOf, numberIn, recordOf, shellText, textIn } from './mongo';
import { timeOf, timestampSeconds } from './changes';
import { countText, percentText } from './server-status';
import { shortDuration, sizeText } from './units';

type Entry = Readonly<Record<string, unknown>>;

function seconds(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

function configOf(config: readonly Entry[], name: string): Entry {
  return config.find((each) => each['host'] === name) ?? {};
}

function memberParts(member: Entry, config: Entry, primaryAt: number | undefined): readonly string[] {
  const state = textIn(member['stateStr']) ?? '?';
  const uptime = numberIn(member['uptime']);
  const applied = dateIn(member['optimeDate']);
  const heartbeat = dateIn(member['lastHeartbeat']);
  const ping = numberIn(member['pingMs']);
  const sync = textIn(member['syncSourceHost']);
  const priority = numberIn(config['priority']);
  const votes = numberIn(config['votes']);
  const delay = numberIn(config['secondaryDelaySecs'] ?? config['slaveDelay']);
  const message = textIn(member['lastHeartbeatMessage']) ?? textIn(member['infoMessage']);
  const lag = applied === undefined || primaryAt === undefined ? undefined : (primaryAt - applied) / 1000;
  return [
    ...(numberIn(member['health']) === 0 ? ['NOT REACHABLE'] : []),
    ...(uptime === undefined ? [] : [`up ${shortDuration(uptime)}`]),
    ...(applied === undefined ? [] : [`last applied ${new Date(applied).toISOString()}`]),
    ...(lag === undefined || state === 'PRIMARY' ? [] : [`lag ${seconds(lag)} s behind the primary`]),
    ...(heartbeat === undefined ? [] : [`last heartbeat ${new Date(heartbeat).toISOString()}`]),
    ...(ping === undefined ? [] : [`ping ${String(ping)} ms`]),
    ...(sync === undefined || sync === '' ? [] : [`syncs from ${sync}`]),
    ...(priority === undefined ? [] : [`priority ${String(priority)}`]),
    ...(votes === undefined ? [] : [`${String(votes)} vote${votes === 1 ? '' : 's'}`]),
    ...(config['hidden'] === true ? ['hidden'] : []),
    ...(config['arbiterOnly'] === true && state !== 'ARBITER' ? ['arbiter'] : []),
    ...(delay ? [`delayed ${String(delay)} s`] : []),
    ...(config['buildIndexes'] === false ? ['builds no indexes'] : []),
    ...(config['tags'] === undefined || Object.keys(recordOf(config['tags'])).length === 0
      ? []
      : [`tags ${shellText(config['tags'])}`]),
    ...(message === undefined || message === '' ? [] : [JSON.stringify(message)]),
  ];
}

/** The members as lines, from `replSetGetStatus` and, when it could be read, `replSetGetConfig`. */
export function memberLines(status: Entry, config: Entry | undefined): readonly string[] {
  const members = listOf(status['members']).map(recordOf);
  const configured = listOf(config?.['members']).map(recordOf);
  const primary = members.find((each) => each['stateStr'] === 'PRIMARY');
  const primaryAt = dateIn(primary?.['optimeDate']);
  return members.map((member) => {
    const name = textIn(member['name']) ?? '?';
    const parts = memberParts(member, configOf(configured, name), primaryAt);
    return `- ${name} ${textIn(member['stateStr']) ?? '?'}${member['self'] === true ? ' (connected)' : ''}${parts.length === 0 ? '' : `: ${parts.join(', ')}`}`;
  });
}

/** The members from `hello` alone: their names and which one is the primary. */
export function helloMemberLines(hello: Entry): readonly string[] {
  const primary = textIn(hello['primary']);
  const me = textIn(hello['me']);
  return [...listOf(hello['hosts']), ...listOf(hello['passives']), ...listOf(hello['arbiters'])]
    .map(String)
    .map((name) => {
      const state = name === primary ? 'PRIMARY' : listOf(hello['arbiters']).includes(name) ? 'ARBITER' : 'SECONDARY';
      return `- ${name} ${state}${name === me ? ' (connected)' : ''}`;
    });
}

/** `Settings: election timeout 10,000 ms, heartbeat every 2,000 ms, chaining allowed, protocol version 1.` */
export function settingsLine(config: Entry | undefined): readonly string[] {
  const settings = recordOf(config?.['settings']);
  const chaining = settings['chainingAllowed'];
  const parts = [
    ...(settings['electionTimeoutMillis'] === undefined
      ? []
      : [`election timeout ${countText(settings['electionTimeoutMillis'])} ms`]),
    ...(settings['heartbeatIntervalMillis'] === undefined
      ? []
      : [`heartbeat every ${countText(settings['heartbeatIntervalMillis'])} ms`]),
    ...(typeof chaining === 'boolean' ? [`chaining ${chaining ? 'allowed' : 'not allowed'}`] : []),
    ...(config?.['protocolVersion'] === undefined ? [] : [`protocol version ${countText(config['protocolVersion'])}`]),
  ];
  return parts.length === 0 ? [] : [`Settings: ${parts.join(', ')}.`];
}

/** The oplog window and size: `Oplog: first entry …, last entry …: a window of 3.20 hours (…). 1.2 GB used of …`. */
export function oplogLine(stats: unknown, first: unknown, last: unknown): string {
  const one = recordOf(listOf(first)[0]);
  const other = recordOf(listOf(last)[0]);
  if (one['ts'] === undefined || other['ts'] === undefined) {
    return 'Oplog: empty.';
  }
  const storage = recordOf(recordOf(listOf(stats)[0])['storageStats']);
  const span = Math.max(0, (timestampSeconds(other['ts']) ?? 0) - (timestampSeconds(one['ts']) ?? 0));
  const size = numberIn(storage['size']);
  const most = numberIn(storage['maxSize']);
  const entries = numberIn(storage['count']) ?? 0;
  return `Oplog: first entry ${timeOf(one['wall'], one['ts'])}, last entry ${timeOf(other['wall'], other['ts'])}: a window of ${(span / 3600).toFixed(span < 36_000 ? 2 : 1)} hours (a member that falls further behind needs a full resync). ${size === undefined ? '?' : sizeText(size)} used${most ? ` of ${sizeText(most)} configured (${percentText(size ?? 0, most)})` : ''}, ${counted(entries, 'entry', 'entries')}.`;
}
