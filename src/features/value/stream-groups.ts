/**
 * Feature: value.stream-groups — the **Groups** section of a stream's key tab: the stream's lines, its consumer
 * groups, the consumers of the group selected and the entries it has pending, a page at a time. Nothing here writes.
 * Its reads are `XINFO STREAM`, `XINFO GROUPS`, `XINFO CONSUMERS` and `XPENDING`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { groupThousands } from '../../shared/text-units';
import { streamEntries } from './read-stream';
import { viewText } from './text';
import { engineRead, fieldsOf, keyOf, pageSize, replyItems, replyNumber, replyText, textOf, type Word } from './types';

/** What a read of the section is for: the groups, a group, a consumer, or the next page of pending entries. */
export interface GroupsArgs {
  readonly part: 'groups' | 'group' | 'consumer' | 'pending';
  readonly group: string;
  readonly consumer?: string;
  /** The last ID shown, for the next page of pending entries. */
  readonly after?: string;
}

/** The arguments of a read, from JSON. */
export function groupsArgs(args: Json): GroupsArgs {
  const fields = fieldsOf(args);
  const part = (['group', 'consumer', 'pending'] as const).find((each) => each === fields['part']) ?? 'groups';
  const consumer = fields['consumer'];
  const after = fields['after'];
  return {
    part,
    group: textOf(fields['group']),
    ...(typeof consumer === 'string' ? { consumer } : {}),
    ...(typeof after === 'string' ? { after } : {}),
  };
}

function pendingCommand(key: Uint8Array, asked: GroupsArgs): readonly Word[] {
  const start = asked.after === undefined ? '-' : `(${asked.after}`;
  const consumer = asked.consumer === undefined ? [] : [asked.consumer];
  return ['XPENDING', key, asked.group, start, '+', String(pageSize), ...consumer];
}

/** The commands of each part, in the order {@link parse} reads their replies. */
export function groupsCommands(key: Uint8Array, asked: GroupsArgs): readonly (readonly Word[])[] {
  switch (asked.part) {
    case 'groups':
      return [
        ['XINFO', 'STREAM', key],
        ['XINFO', 'GROUPS', key],
      ];
    case 'group':
      return [['XINFO', 'CONSUMERS', key, asked.group], ['XPENDING', key, asked.group], pendingCommand(key, asked)];
    case 'consumer':
    case 'pending':
      return [pendingCommand(key, asked)];
  }
}

/** Feature: value.stream-groups — the reads of the section, by `args.part`. */
export function request(context: Context, args: Json): ReadRequest {
  const at = keyOf(context);
  return engineRead(at, groupsCommands(at.key, groupsArgs(args)));
}

/** The fields of a reply that is a map in RESP3 or a flat list of names and values in RESP2. */
export function mapOf(reply: unknown): ReadonlyMap<string, unknown> {
  const entries = fieldsOf(reply)['entries'];
  const pairs = Array.isArray(entries)
    ? (entries as readonly unknown[]).map((pair) => replyItems(pair))
    : replyItems(reply).flatMap((each, index, all) => (index % 2 === 0 ? [[each, all[index + 1]]] : []));
  return new Map(pairs.map(([name, value]) => [replyText(name) ?? '', value]));
}

/** The lines of the stream, as `XINFO STREAM` answers them. */
export interface StreamInfo {
  readonly entries: number;
  readonly lastGeneratedId: string;
  readonly firstEntry?: string;
  readonly lastEntry?: string;
}

/** A consumer group. `lag` is absent before Redis 7.0, or when the server cannot say. */
export interface ConsumerGroup {
  readonly name: string;
  readonly consumers: number;
  readonly pending: number;
  readonly lastDeliveredId: string;
  readonly lag?: number;
}

/** A consumer of a group. `inactiveMs` is absent before Redis 7.2. */
export interface Consumer {
  readonly name: string;
  readonly pending: number;
  readonly idleMs: number;
  readonly inactiveMs?: number;
}

/** An entry a group has pending. */
export interface PendingEntry {
  readonly id: string;
  readonly consumer: string;
  readonly idleMs: number;
  readonly deliveries: number;
}

/** What the reads of the section give. */
export type GroupsRead =
  | { readonly part: 'groups'; readonly stream: StreamInfo; readonly groups: readonly ConsumerGroup[] }
  | {
      readonly part: 'group';
      readonly consumers: readonly Consumer[];
      readonly pendingCount: number;
      readonly pending: readonly PendingEntry[];
    }
  | { readonly part: 'pending'; readonly pending: readonly PendingEntry[] };

function entryId(reply: unknown): string | undefined {
  return reply === null || reply === undefined ? undefined : streamEntries([reply])[0]?.id;
}

function streamInfo(reply: unknown): StreamInfo {
  const map = mapOf(reply);
  const first = entryId(map.get('first-entry'));
  const last = entryId(map.get('last-entry'));
  return {
    entries: replyNumber(map.get('length')) ?? 0,
    lastGeneratedId: replyText(map.get('last-generated-id')) ?? '',
    ...(first === undefined ? {} : { firstEntry: first }),
    ...(last === undefined ? {} : { lastEntry: last }),
  };
}

function groupOf(reply: unknown): ConsumerGroup {
  const map = mapOf(reply);
  const lag = replyNumber(map.get('lag'));
  return {
    name: replyText(map.get('name')) ?? '',
    consumers: replyNumber(map.get('consumers')) ?? 0,
    pending: replyNumber(map.get('pending')) ?? 0,
    lastDeliveredId: replyText(map.get('last-delivered-id')) ?? '',
    ...(lag === undefined ? {} : { lag }),
  };
}

function consumerOf(reply: unknown): Consumer {
  const map = mapOf(reply);
  const inactive = replyNumber(map.get('inactive'));
  return {
    name: replyText(map.get('name')) ?? '',
    pending: replyNumber(map.get('pending')) ?? 0,
    idleMs: replyNumber(map.get('idle')) ?? 0,
    ...(inactive === undefined ? {} : { inactiveMs: inactive }),
  };
}

function pendingOf(reply: unknown): readonly PendingEntry[] {
  return replyItems(reply).map((each) => {
    const [id, consumer, idle, deliveries] = replyItems(each);
    return {
      id: replyText(id) ?? '',
      consumer: replyText(consumer) ?? '',
      idleMs: replyNumber(idle) ?? 0,
      deliveries: replyNumber(deliveries) ?? 0,
    };
  });
}

/** Feature: value.stream-groups — the stream and its groups, a group's consumers and pending entries, or a page of them. */
export function parse(replies: readonly unknown[], args: Json = null): GroupsRead {
  const asked = groupsArgs(args);
  switch (asked.part) {
    case 'groups':
      return { part: 'groups', stream: streamInfo(replies[0]), groups: replyItems(replies[1]).map(groupOf) };
    case 'group':
      return {
        part: 'group',
        consumers: replyItems(replies[0]).map(consumerOf),
        pendingCount: replyNumber(replyItems(replies[1])[0]) ?? 0,
        pending: pendingOf(replies[2]),
      };
    case 'consumer':
    case 'pending':
      return { part: 'pending', pending: pendingOf(replies[0]) };
  }
}

/** A time as a time left is written: `850 ms`, `12 s`, `5 min 12 s`, `3 h 2 min`, `2 d 3 h`. */
export function durationText(ms: number): string {
  if (ms < 1000) {
    return `${String(Math.max(0, Math.round(ms)))} ms`;
  }
  const seconds = Math.floor(ms / 1000);
  const steps: readonly (readonly [number, string, number, string])[] = [
    [86_400, 'd', 3600, 'h'],
    [3600, 'h', 60, 'min'],
    [60, 'min', 1, 's'],
  ];
  const step = steps.find(([size]) => seconds >= size);
  if (step === undefined) {
    return `${String(seconds)} s`;
  }
  const [size, unit, smaller, smallerUnit] = step;
  const rest = Math.floor((seconds % size) / smaller);
  return rest === 0
    ? `${String(Math.floor(seconds / size))} ${unit}`
    : `${String(Math.floor(seconds / size))} ${unit} ${String(rest)} ${smallerUnit}`;
}

/** What the section has read so far, and what is selected. */
export interface GroupsState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly error?: string;
  readonly stream?: StreamInfo;
  readonly groups?: readonly ConsumerGroup[];
  readonly group?: string;
  readonly consumers?: readonly Consumer[];
  readonly consumer?: string;
  readonly pending?: readonly PendingEntry[];
  /** How many entries the selection has pending: the group's count, or the consumer's. */
  readonly pendingCount?: number;
}

/** A table of the section: its columns and its rows of text. */
export interface GroupsTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly empty?: string;
}

/** What the section shows, from the top. */
export interface GroupsView {
  readonly status: GroupsState['status'];
  readonly error?: string;
  readonly retry?: { readonly label: string; readonly feature: string };
  readonly lines: readonly (readonly [string, string])[];
  readonly groups?: GroupsTable;
  readonly consumers?: GroupsTable;
  readonly pending?: GroupsTable;
  readonly loadMore?: { readonly label: string; readonly feature: string; readonly after: string };
  readonly readOnlyLine: string;
  readonly openConsole: { readonly label: string; readonly feature: string };
}

function streamLines(stream: StreamInfo | undefined): readonly (readonly [string, string])[] {
  if (stream === undefined) {
    return [];
  }
  return [
    ['Entries', groupThousands(stream.entries)],
    ['Last generated ID', stream.lastGeneratedId],
    ['First entry', stream.firstEntry ?? '—'],
    ['Last entry', stream.lastEntry ?? '—'],
  ];
}

function tables(state: GroupsState): Pick<GroupsView, 'groups' | 'consumers' | 'pending' | 'loadMore'> {
  const groups: GroupsTable = {
    columns: ['Group', 'Consumers', 'Pending', 'Last delivered ID', 'Lag'],
    rows: (state.groups ?? []).map((group) => [
      group.name,
      groupThousands(group.consumers),
      groupThousands(group.pending),
      group.lastDeliveredId,
      group.lag === undefined ? '—' : groupThousands(group.lag),
    ]),
    ...((state.groups ?? []).length === 0 ? { empty: viewText.noGroups } : {}),
  };
  if (state.group === undefined) {
    return { groups };
  }
  const inactive = (state.consumers ?? []).some((each) => each.inactiveMs !== undefined);
  const consumers: GroupsTable = {
    columns: inactive ? ['Consumer', 'Pending', 'Idle', 'Inactive'] : ['Consumer', 'Pending', 'Idle'],
    rows: (state.consumers ?? []).map((each) => [
      each.name,
      groupThousands(each.pending),
      durationText(each.idleMs),
      ...(inactive ? [each.inactiveMs === undefined || each.inactiveMs < 0 ? '—' : durationText(each.inactiveMs)] : []),
    ]),
  };
  const entries = state.pending ?? [];
  const pending: GroupsTable = {
    columns: ['ID', 'Consumer', 'Idle', 'Deliveries'],
    rows: entries.map((each) => [each.id, each.consumer, durationText(each.idleMs), groupThousands(each.deliveries)]),
    ...(entries.length === 0 ? { empty: viewText.nothingPending } : {}),
  };
  const last = entries.at(-1);
  const more = last !== undefined && entries.length < (state.pendingCount ?? 0);
  return {
    groups,
    consumers,
    pending,
    ...(more ? { loadMore: { label: viewText.loadMore, feature: 'value.stream-groups', after: last.id } } : {}),
  };
}

/** Feature: value.stream-groups — what the section shows; the same on a read-only connection. */
export function view(state: GroupsState): GroupsView {
  const base = {
    status: state.status,
    lines: streamLines(state.stream),
    readOnlyLine: viewText.groupsReadOnly,
    openConsole: { label: viewText.openConsole, feature: 'console.show' },
  };
  if (state.status === 'error') {
    return { ...base, error: state.error ?? '', retry: { label: viewText.retry, feature: 'value.stream-groups' } };
  }
  return state.status === 'loading' ? base : { ...base, ...tables(state) };
}
