/**
 * The reads of the **Groups** section of a stream's key tab (`value.stream-groups`): the stream and its groups when the
 * section opens and on **Refresh**; a group's consumers and pending entries when it is selected; a consumer's pending
 * entries when it is selected; and the next page of pending entries with **Load more**. Nothing here writes.
 */
import type { GroupsRead, GroupsState, PendingEntry } from '../../../features/value/stream-groups';
import type { Json } from '../../../shared/engine-request';
import { messageOf, readValue } from './value-start';
import { changeValue, valueTabOf } from './value-store';

function read(tab: string, args: Json): Promise<GroupsRead | { readonly error: string }> {
  const state = valueTabOf(tab);
  if (state === undefined) {
    return Promise.resolve({ error: '' });
  }
  return readValue(state.where, 'value.stream-groups', args, 'section-bar').then((result) =>
    result.kind === 'read' ? (result.result as GroupsRead) : { error: messageOf(result) },
  );
}

function setGroups(tab: string, change: (groups: GroupsState) => GroupsState): void {
  changeValue(tab, (now) => ({ ...now, groups: change(now.groups ?? { status: 'loading' }) }));
}

function failed(tab: string, error: string): void {
  setGroups(tab, (groups) => ({ ...groups, status: 'error', error }));
}

/** What the section shows of the selected group: its consumers, and the pending entries of the group or consumer. */
type GroupParts = Pick<GroupsState, 'consumers' | 'consumer' | 'pending' | 'pendingCount'>;

/** Reads the group's consumers and pending entries, and those of `consumer` when the group still has it. */
async function readGroupParts(
  tab: string,
  group: string,
  consumer: string | undefined,
): Promise<GroupParts | { readonly error: string }> {
  const found = await read(tab, { part: 'group', group });
  if ('error' in found || found.part !== 'group') {
    return { error: 'error' in found ? found.error : '' };
  }
  const parts = { consumers: found.consumers, pending: found.pending, pendingCount: found.pendingCount };
  const still = found.consumers.find((each) => each.name === consumer);
  if (consumer === undefined || still === undefined) {
    return parts;
  }
  const own = await read(tab, { part: 'consumer', group, consumer });
  if ('error' in own || own.part !== 'pending') {
    return { error: 'error' in own ? own.error : '' };
  }
  return { ...parts, consumer, pending: own.pending, pendingCount: still.pending };
}

/** The section with the parts of a group read in place of those shown. */
function withParts(groups: GroupsState, parts: GroupParts): GroupsState {
  const { consumer: _consumer, ...rest } = groups;
  return { ...rest, ...parts };
}

/**
 * Reads the stream and its groups; the group selected before is read again when it is still there, with the consumer
 * selected. What was shown stays until all of it has come.
 */
export async function loadGroups(tab: string): Promise<void> {
  setGroups(tab, (groups) => ({ ...groups, status: groups.status === 'ready' ? 'ready' : 'loading' }));
  const found = await read(tab, { part: 'groups' });
  if ('error' in found || found.part !== 'groups') {
    failed(tab, 'error' in found ? found.error : '');
    return;
  }
  const before = valueTabOf(tab)?.groups;
  const selected = found.groups.some((group) => group.name === before?.group) ? before?.group : undefined;
  const parts = selected === undefined ? undefined : await readGroupParts(tab, selected, before?.consumer);
  if (parts !== undefined && 'error' in parts) {
    failed(tab, parts.error);
    return;
  }
  setGroups(tab, (now) => {
    const fresh = { status: 'ready' as const, stream: found.stream, groups: found.groups };
    if (now.group === selected) {
      return parts === undefined ? { ...now, ...fresh } : { ...withParts(now, parts), ...fresh };
    }
    if (now.group !== before?.group) {
      // Another group was selected meanwhile: its own read sets its tables.
      return { ...now, ...fresh };
    }
    const {
      group: _group,
      consumer: _consumer,
      consumers: _consumers,
      pending: _pending,
      pendingCount: _count,
      ...rest
    } = now;
    return { ...rest, ...fresh };
  });
}

/** Selects a group: its consumers, how many entries it has pending, and the first page of them. */
export async function selectGroup(tab: string, group: string): Promise<void> {
  // The tables of the group shown before stay until those of this one come.
  setGroups(tab, ({ consumer: _consumer, ...groups }) => ({ ...groups, group }));
  const parts = await readGroupParts(tab, group, undefined);
  if ('error' in parts) {
    failed(tab, parts.error);
    return;
  }
  setGroups(tab, (groups) => (groups.group === group ? withParts(groups, parts) : groups));
}

/** Selects a consumer of the group, or none (the group's pending entries again): its pending entries. */
export async function selectConsumer(tab: string, consumer: string | undefined): Promise<void> {
  const groups = valueTabOf(tab)?.groups;
  const group = groups?.group;
  if (group === undefined) {
    return;
  }
  if (consumer === undefined) {
    await selectGroup(tab, group);
    return;
  }
  const count = groups?.consumers?.find((each) => each.name === consumer)?.pending ?? 0;
  // The entries shown stay until the consumer's come.
  setGroups(tab, (now) => ({ ...now, consumer }));
  const found = await read(tab, { part: 'consumer', group, consumer });
  if ('error' in found || found.part !== 'pending') {
    failed(tab, 'error' in found ? found.error : '');
    return;
  }
  setGroups(tab, (now) => (now.consumer === consumer ? { ...now, pending: found.pending, pendingCount: count } : now));
}

/** **Load more** of the pending entries: the next page, after the last ID shown. */
export async function morePending(tab: string, after: string): Promise<void> {
  const groups = valueTabOf(tab)?.groups;
  if (groups?.group === undefined) {
    return;
  }
  const args = {
    part: 'pending',
    group: groups.group,
    after,
    ...(groups.consumer === undefined ? {} : { consumer: groups.consumer }),
  };
  const found = await read(tab, args);
  if ('error' in found || found.part !== 'pending') {
    failed(tab, 'error' in found ? found.error : '');
    return;
  }
  const more: readonly PendingEntry[] = found.pending;
  setGroups(tab, (now) => ({ ...now, pending: [...(now.pending ?? []), ...more] }));
}
