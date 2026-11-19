import { describe, expect, it } from 'vitest';
import * as itemEditor from '../../../src/features/value/item-editor';
import * as show from '../../../src/features/value/show';
import * as streamGroups from '../../../src/features/value/stream-groups';
import { bytes, keyContext, readCommands, utf8 } from './context';
import { recordedRead } from './replies';

const hashRows: readonly show.ValueRow[] = [
  { cells: { Field: utf8('name'), Value: utf8('Ada Lovelace') } },
  { cells: { Field: utf8('nickname'), Value: utf8('Ada') } },
];

function hashState(overrides: Partial<show.ValueState> = {}): show.ValueState {
  return {
    form: 'full',
    key: 'user:7',
    type: 'hash',
    readOnly: false,
    status: 'ready',
    count: 2,
    rows: hashRows,
    ...overrides,
  };
}

describe('value.show', () => {
  it('shows a hash with 2 fields and the columns Field and Value', () => {
    const view = show.view(hashState());
    expect(view.count).toBe('2 fields');
    expect(view.table?.columns.map((column) => column.name)).toEqual(['Field', 'Value']);
    expect(view.table?.rows).toEqual([
      ['name', 'Ada Lovelace'],
      ['nickname', 'Ada'],
    ]);
  });

  it('shows a string in an editor with Text, JSON, Hex, Save, Revert and Copy', () => {
    const view = show.view({
      form: 'full',
      key: 'orders:42',
      type: 'string',
      readOnly: false,
      status: 'ready',
      string: { length: 5, loaded: utf8('hello') },
    });
    expect(view.toolbar.map((control) => control.label)).toEqual(['Text', 'JSON', 'Hex', 'Save', 'Revert', 'Copy']);
    expect(view.editor?.text).toBe('hello');
    expect(view.editor?.editable).toBe(true);
  });

  it('shows the selected field in full in the inspector, and Nothing selected without one', () => {
    expect(show.view(hashState({ selected: 0 })).inspector).toEqual({ title: 'name', text: 'Ada Lovelace' });
    expect(show.view(hashState()).inspector?.title).toBe('Nothing selected');
  });

  it('shows 20 of 1,204 fields in the compact form, with Open in a tab and no control that writes', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      cells: { Field: utf8(`f${String(index)}`), Value: utf8('v') },
    }));
    const view = show.view(hashState({ form: 'compact', count: 1204, rows }));
    expect(view.table?.rows).toHaveLength(20);
    expect(view.table?.note).toBe('First 20 of 1,204 fields.');
    expect(view.openInTab).toEqual({ label: 'Open in a tab', feature: 'key.open', element: 'key.open@inspector' });
    expect(view.toolbar).toEqual([]);
    expect(view.table?.columns.every((column) => column.cell === undefined)).toBe(true);
  });

  it('opens no editor on a member of a set, with its tooltip', () => {
    const view = show.view({ ...hashState(), key: 'tags', type: 'set', rows: [{ cells: { Member: utf8('red') } }] });
    expect(view.table?.columns[0]).toEqual({
      name: 'Member',
      tooltip: 'A member cannot be changed: remove it and add another.',
    });
  });

  it('shows a key deleted by another client with Close tab', () => {
    expect(show.view(hashState({ status: 'gone' })).message).toEqual({
      text: 'The key user:7 no longer exists: it was deleted or it expired.',
      actions: [{ label: 'Close tab', feature: 'tab.close' }],
    });
  });

  it('shows the list that replaced the hash under its notice', () => {
    const view = show.view({
      ...hashState(),
      type: 'list',
      was: 'hash',
      rows: [{ cells: { Index: '0', Element: utf8('a') } }],
    });
    expect(view.notice).toBe('user:7 is now a list: it was a hash when this tab read it.');
    expect(view.table?.columns.map((column) => column.name)).toEqual(['Index', 'Element']);
  });

  it('has Filter fields only on a read-only connection, and no editor on a value', () => {
    const view = show.view(hashState({ readOnly: true }));
    expect(view.toolbar.map((control) => control.label)).toEqual(['Filter fields']);
    expect(view.table?.columns.every((column) => column.cell === undefined)).toBe(true);
  });

  it('says a type of a module is not shown yet', () => {
    expect(show.view(hashState({ type: 'ReJSON-RL' })).message?.text).toBe(
      'Datardo does not show values of the type ReJSON-RL yet.',
    );
  });

  it('shows a value that is not text as pairs of hexadecimal digits in its cell', () => {
    const view = show.view(hashState({ rows: [{ cells: { Field: utf8('raw'), Value: bytes('00 ff') } }] }));
    expect(view.table?.rows[0]).toEqual(['raw', '00 ff']);
  });

  it('shows No entries. for a stream without entries', () => {
    expect(show.view({ ...hashState(), key: 'events', type: 'stream', rows: [] }).message?.text).toBe('No entries.');
  });

  it('has no Rank column with a range of scores', () => {
    expect(show.columnsOf('zset', { ranged: true })).toEqual(['Member', 'Score']);
    expect(show.columnsOf('zset', {})).toEqual(['Rank', 'Member', 'Score']);
  });
});

describe('value.item-editor', () => {
  const base: itemEditor.ItemEditorState = { cell: 'value', bytes: utf8('Ada'), name: 'nickname', readOnly: false };

  it('opens on Ada with Ada selected and the hint of the keys', () => {
    const view = itemEditor.view(base);
    expect(view.open && view.text).toBe('Ada');
    expect(view.open && view.as).toBe('cell');
    expect(view.open && view.line).toEqual({
      kind: 'hint',
      text: 'Enter to save · Shift+Enter new line · Esc to cancel',
    });
    expect(view.open && view.save.element).toBe('value.edit-field@editor');
  });

  it('opens 00 ff in Hex', () => {
    const view = itemEditor.view({ ...base, bytes: bytes('00 ff') });
    expect(view.open && [view.format, view.text]).toEqual(['hex', '00 ff']);
  });

  it('shows the problem of 0 ff in Hex in the place of the hint', () => {
    const view = itemEditor.view({ ...base, bytes: bytes('00 ff'), typed: '0 ff' });
    expect(view.open && view.line).toEqual({
      kind: 'problem',
      text: 'Hexadecimal needs two digits a byte: 3 digits found.',
    });
  });

  it('opens a value of 5,000 characters in the dialog Edit the value of name', () => {
    const view = itemEditor.view({ ...base, name: 'name', bytes: utf8('x'.repeat(5000)) });
    expect(view.open && [view.as, view.title]).toEqual(['dialog', 'Edit the value of name']);
  });

  it('opens no editor on a read-only connection', () => {
    expect(itemEditor.view({ ...base, readOnly: true })).toEqual({ open: false });
  });
});

describe('value.stream-groups', () => {
  const context = keyContext('value.stream-groups', { key: 'events' });

  it('opens with XINFO STREAM events and XINFO GROUPS events, and nothing else', () => {
    const groups = recordedRead('groups');
    expect(readCommands(streamGroups.request(context, groups.args))).toEqual([
      'XINFO STREAM events',
      'XINFO GROUPS events',
    ]);
    const read = streamGroups.parse(groups.replies, groups.args);
    expect(read.part === 'groups' && read.stream.entries).toBe(3);
    expect(read.part === 'groups' && read.groups.map((group) => [group.name, group.pending, group.lag])).toEqual([
      ['idle', 0, 0],
      ['mailers', 2, 1],
    ]);
  });

  it('reads the consumers and the pending entries of mailers', () => {
    const group = recordedRead('group');
    expect(readCommands(streamGroups.request(context, group.args))).toEqual([
      'XINFO CONSUMERS events mailers',
      'XPENDING events mailers',
      'XPENDING events mailers - + 200',
    ]);
    const read = streamGroups.parse(group.replies, group.args);
    expect(read.part === 'group' && read.consumers.map((each) => each.name)).toEqual(['worker-1']);
    expect(read.part === 'group' && read.pendingCount).toBe(2);
    expect(read.part === 'group' && read.pending.map((each) => each.id)).toEqual([
      '1763400000000-0',
      '1763400000001-0',
    ]);
  });

  it('reads the pending entries of worker-1', () => {
    const consumer = recordedRead('consumer');
    expect(readCommands(streamGroups.request(context, consumer.args))).toEqual([
      'XPENDING events mailers - + 200 worker-1',
    ]);
    const read = streamGroups.parse(consumer.replies, consumer.args);
    expect(read.part === 'pending' && read.pending).toHaveLength(2);
  });

  it('shows — for the lag and no Inactive column on Redis 6.2', () => {
    const view = streamGroups.view({
      status: 'ready',
      groups: [{ name: 'mailers', consumers: 1, pending: 2, lastDeliveredId: '1-0' }],
      group: 'mailers',
      consumers: [{ name: 'worker-1', pending: 2, idleMs: 5000 }],
      pending: [],
    });
    expect(view.groups?.rows[0]?.[4]).toBe('—');
    expect(view.consumers?.columns).toEqual(['Consumer', 'Pending', 'Idle']);
  });

  it('shows 200 of 450 pending entries and Load more after the last ID', () => {
    const pending = Array.from({ length: 200 }, (_, index) => ({
      id: `${String(index + 1)}-0`,
      consumer: 'worker-1',
      idleMs: 10,
      deliveries: 1,
    }));
    const view = streamGroups.view({
      status: 'ready',
      groups: [],
      group: 'mailers',
      consumers: [],
      pending,
      pendingCount: 450,
    });
    expect(view.pending?.rows).toHaveLength(200);
    expect(view.loadMore?.after).toBe('200-0');
    expect(readCommands(streamGroups.request(context, { part: 'pending', group: 'mailers', after: '200-0' }))).toEqual([
      'XPENDING events mailers (200-0 + 200',
    ]);
  });

  it('shows No consumer groups. for a stream without groups, and no control that writes', () => {
    const view = streamGroups.view({ status: 'ready', groups: [] });
    expect(view.groups?.empty).toBe('No consumer groups.');
    expect(Object.keys(view).sort()).toEqual(['groups', 'lines', 'openConsole', 'readOnlyLine', 'status']);
  });
});
