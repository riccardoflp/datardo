/**
 * Feature: server.read-info
 *
 * What the server reports about itself (`INFO`, or `INFO replication` for that one section), as named values the
 * Overview and the Replication sections show. Every value is kept as text and read as a number only where a card says
 * so; fields and sections that are not known are kept, for the inspector island.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { partOf } from './unavailable';
import { numberOfText, serverCommand, textArg, textOf, type NamedValue, type PartRead } from './types';

/** A section of `INFO`, `# Memory`, with its fields in the order the server wrote them. */
export interface InfoSection {
  readonly name: string;
  readonly fields: readonly NamedValue[];
}

/** A line of `# Keyspace`: `db0:keys=1204,expires=310,avg_ttl=86400000`. A number the line lacks is missing. */
export interface KeyspaceDatabase {
  readonly database: number;
  /** As the server names it: `db0`. */
  readonly name: string;
  readonly keys?: number;
  readonly expires?: number;
  readonly averageTtlMs?: number;
  /** Every pair of the line, `subexpiry` and those not known included. */
  readonly pairs: readonly NamedValue[];
}

/** A line `slave0:ip=10.0.0.6,port=6379,state=online,offset=1234,lag=0` of `# Replication`: a replica. */
export interface ReplicaLine {
  /** As the server names it: `slave0`. */
  readonly name: string;
  readonly ip?: string;
  readonly port?: string;
  readonly state?: string;
  readonly offset?: number;
  readonly lag?: number;
  readonly pairs: readonly NamedValue[];
}

/** What `INFO` gave: its sections, the databases of `# Keyspace` and the replicas of `# Replication`. */
export interface InfoReport {
  readonly sections: readonly InfoSection[];
  readonly databases: readonly KeyspaceDatabase[];
  readonly replicas: readonly ReplicaLine[];
}

/**
 * What is read: every default section, `# Replication` alone, or `# Keyspace` alone (the **Database** menu of the
 * largest keys, and the number after *about*).
 */
export type InfoPart = 'all' | 'replication' | 'keyspace';

function partOfArgs(args: Json): InfoPart {
  const part = textArg(args, 'part');
  return part === 'replication' || part === 'keyspace' ? part : 'all';
}

/** The command as `server.unavailable` names it: `INFO`, whose section is an argument, not a subcommand. */
export const infoCommand = 'INFO';

/** Feature: server.read-info — `INFO`, or `INFO replication` with `{ connection, part: 'replication' }`. */
export function request(_context: Context, args: Json): ReadRequest {
  const part = partOfArgs(args);
  const words = part === 'all' ? ['INFO'] : ['INFO', part];
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(textArg(args, 'connection')), request: serverCommand(...words) }],
    failedRequests: 'are-replies',
  };
}

/** The pairs of a line, `keys=1204,expires=310`, each split at its first `=`. */
function pairsOfLine(value: string): readonly NamedValue[] {
  return value
    .split(',')
    .filter((part) => part !== '')
    .map((part) => {
      const equals = part.indexOf('=');
      return equals < 0 ? ([part, ''] as const) : ([part.slice(0, equals), part.slice(equals + 1)] as const);
    });
}

function pairValue(pairs: readonly NamedValue[], name: string): string | undefined {
  return pairs.findLast(([each]) => each === name)?.[1];
}

function keyspaceOf(fields: readonly NamedValue[]): readonly KeyspaceDatabase[] {
  return fields.flatMap(([name, value]): KeyspaceDatabase[] => {
    const match = /^db(\d+)$/u.exec(name);
    if (match === null) {
      return [];
    }
    const pairs = pairsOfLine(value);
    const keys = numberOfText(pairValue(pairs, 'keys'));
    const expires = numberOfText(pairValue(pairs, 'expires'));
    const averageTtlMs = numberOfText(pairValue(pairs, 'avg_ttl'));
    return [
      {
        database: Number(match[1]),
        name,
        pairs,
        ...(keys === undefined ? {} : { keys }),
        ...(expires === undefined ? {} : { expires }),
        ...(averageTtlMs === undefined ? {} : { averageTtlMs }),
      },
    ];
  });
}

function replicasOf(fields: readonly NamedValue[]): readonly ReplicaLine[] {
  return fields.flatMap(([name, value]): ReplicaLine[] => {
    if (!/^slave\d+$/u.test(name)) {
      return [];
    }
    const pairs = pairsOfLine(value);
    const texts = { ip: pairValue(pairs, 'ip'), port: pairValue(pairs, 'port'), state: pairValue(pairs, 'state') };
    const offset = numberOfText(pairValue(pairs, 'offset'));
    const lag = numberOfText(pairValue(pairs, 'lag'));
    return [
      {
        name,
        pairs,
        ...Object.fromEntries(Object.entries(texts).filter(([, each]) => each !== undefined)),
        ...(offset === undefined ? {} : { offset }),
        ...(lag === undefined ? {} : { lag }),
      },
    ];
  });
}

/** The sections of the text of `INFO`: `# Name` opens one, `field:value` is split at its first `:`. */
export function infoSections(info: string): readonly InfoSection[] {
  const sections: { name: string; fields: Map<string, string> }[] = [];
  for (const line of info.split(/\r?\n/u)) {
    if (line.trim() === '') {
      continue;
    }
    if (line.startsWith('# ')) {
      sections.push({ name: line.slice(2).trim(), fields: new Map() });
      continue;
    }
    const colon = line.indexOf(':');
    if (sections.length === 0) {
      sections.push({ name: '', fields: new Map() });
    }
    const fields = sections.at(-1)?.fields;
    fields?.set(colon < 0 ? line : line.slice(0, colon), colon < 0 ? '' : line.slice(colon + 1));
  }
  return sections.map((section) => ({ name: section.name, fields: [...section.fields] }));
}

/** The report of the text of `INFO`. */
export function infoReport(info: string): InfoReport {
  const sections = infoSections(info);
  const fieldsOf = (name: string): readonly NamedValue[] =>
    sections.filter((section) => section.name === name).flatMap((section) => section.fields);
  return { sections, databases: keyspaceOf(fieldsOf('Keyspace')), replicas: replicasOf(fieldsOf('Replication')) };
}

/** Feature: server.read-info — the report, or the sentence of `server.unavailable` when `INFO` was refused. */
export function parse(replies: readonly unknown[]): PartRead<InfoReport> {
  return partOf(infoCommand, replies[0], (reply) => infoReport(textOf(reply)));
}

/** The value of a field, from the last section that has it; `undefined` when no section does. */
export function infoField(report: InfoReport, name: string): string | undefined {
  for (const section of report.sections.toReversed()) {
    const found = section.fields.findLast(([each]) => each === name);
    if (found !== undefined) {
      return found[1];
    }
  }
  return undefined;
}

/** The value of a field read as a number; `undefined` when it is missing or is not a number (shown as `—`). */
export function infoNumber(report: InfoReport, name: string): number | undefined {
  return numberOfText(infoField(report, name));
}

/** The fields of a section, for the inspector island; none when the server did not give it. */
export function sectionFields(report: InfoReport, name: string): readonly NamedValue[] {
  return report.sections.filter((section) => section.name === name).flatMap((section) => section.fields);
}
