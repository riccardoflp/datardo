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

/** Reads the stream and its groups; the group selected before is read again when it is still there. */
export async function loadGroups(tab: string): Promise<void> {
  setGroups(tab, (groups) => ({ ...groups, status: groups.status === 'ready' ? 'ready' : 'loading' }));
  const found = await read(tab, { part: 'groups' });
  if ('error' in found || found.part !== 'groups') {
    failed(tab, 'error' in found ? found.error : '');
    return;
  }
  const selected = valueTabOf(tab)?.groups?.group;
  const still = found.groups.some((group) => group.name === selected);
  setGroups(tab, () => ({ status: 'ready', stream: found.stream, groups: found.groups }));
  if (selected !== undefined && still) {
    await selectGroup(tab, selected);
  }
}

/** Selects a group: its consumers, how many entries it has pending, and the first page of them. */
export async function selectGroup(tab: string, group: string): Promise<void> {
  setGroups(tab, ({ consumer: _consumer, consumers: _consumers, pending: _pending, ...groups }) => ({
    ...groups,
    group,
  }));
  const found = await read(tab, { part: 'group', group });
  if ('error' in found || found.part !== 'group') {
    failed(tab, 'error' in found ? found.error : '');
    return;
  }
  setGroups(tab, (groups) =>
    groups.group === group
      ? { ...groups, consumers: found.consumers, pending: found.pending, pendingCount: found.pendingCount }
      : groups,
  );
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
  setGroups(tab, ({ pending: _pending, ...now }) => ({ ...now, consumer, pendingCount: count }));
  const found = await read(tab, { part: 'consumer', group, consumer });
  if ('error' in found || found.part !== 'pending') {
    failed(tab, 'error' in found ? found.error : '');
    return;
  }
  setGroups(tab, (now) => (now.consumer === consumer ? { ...now, pending: found.pending } : now));
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
