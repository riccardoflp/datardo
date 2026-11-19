import { describe, expect, it } from 'vitest';
import {
  cellLink,
  rowReferences,
  tooltipOf,
  view,
  type FollowState,
  type KnownReferences,
} from '../../../src/features/relation/follow';
import type { Relation } from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import { ada, oid, relation, shopReferences } from './context';

const references: readonly Relation[] = [
  ...shopReferences,
  relation('orders.userId', 'users._id'),
  relation('posts.comments.authorId', 'users._id', { fieldLabel: 'comments[].authorId' }),
];

const known: KnownReferences = { kind: 'known', relations: references };

function state(collection: string, document: Json, more: Partial<FollowState> = {}): FollowState {
  return { database: 'shop', collection, source: 'find', references: known, document, ...more };
}

function lines(shown: ReturnType<typeof view>): { referenced: string[]; referencedBy: string[] } {
  return shown.kind === 'lines'
    ? {
        referenced: shown.referenced.map((line) => line.text),
        referencedBy: shown.referencedBy.map((line) => line.text),
      }
    : { referenced: [], referencedBy: [] };
}

describe('relation.follow', () => {
  it('shows customer → users for an order, and its click opens the filter of that value', () => {
    const shown = view(state('orders', { _id: oid('1'), customer: ada }));
    expect(lines(shown).referenced).toEqual(['customer → users']);
    const [line] = shown.kind === 'lines' ? shown.referenced : [];
    expect(line).toMatchObject({
      feature: 'relation.open-referenced',
      element: 'relation.open-referenced@inspector',
      tooltip: '{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }',
    });
  });

  it('shows tagIds → tags (3) for 3 ObjectIds, and the field reached when it is not _id', () => {
    const document = { _id: oid('1'), customerEmail: 'ada@example.com', tagIds: [oid('01'), oid('02'), oid('03')] };
    expect(lines(view(state('orders', document))).referenced).toEqual([
      'customerEmail → users.email',
      'tagIds → tags (3)',
    ]);
  });

  it('lists orders.userId before posts.comments[].authorId under Referenced by', () => {
    const shown = view(state('users', { _id: ada }));
    expect(lines(shown).referencedBy).toEqual([
      'orders.customer',
      'orders.owner',
      'orders.userId',
      'posts.author',
      'posts.comments[].authorId',
    ]);
    expect(shown.kind === 'lines' ? shown.referencedByTitle : '').toBe('Referenced by');
  });

  it('has no line for a customer that is null', () => {
    expect(view(state('orders', { _id: oid('1'), customer: null }))).toEqual({
      kind: 'message',
      text: 'This document refers to no other, and no collection refers to its collection.',
    });
  });

  it('says Finding the references of shop… while they are found for the first time', () => {
    expect(view(state('orders', { _id: oid('1') }, { references: { kind: 'finding' } }))).toEqual({
      kind: 'message',
      text: 'Finding the references of shop…',
    });
  });

  it('says the references are not found by themselves, with Relationship diagram, and the cells have no links', () => {
    const off = state('orders', { _id: oid('1'), customer: ada }, { references: { kind: 'not-detected' } });
    expect(view(off)).toEqual({
      kind: 'not-detected',
      text: 'References are not found by themselves: the relationship diagram of shop finds them.',
      diagram: { label: 'Relationship diagram', element: 'relation.diagram@inspector' },
    });
    expect(cellLink(off, 'customer', ada)).toBeUndefined();
  });

  it('makes the cell of customer a link to the referenced document', () => {
    const link = cellLink(state('orders', null), 'customer', ada);
    expect(link).toMatchObject({
      tooltip: 'Ctrl+click: open the referenced document in users',
      menu: { label: 'Open referenced document', element: 'relation.open-referenced@cell-menu' },
      element: 'relation.open-referenced@table',
    });
  });

  it('names the 3 referenced documents of a cell, and Open referenced documents in its menu', () => {
    const link = cellLink(state('orders', null), 'tagIds', [oid('01'), oid('02'), oid('03')]);
    expect(link?.tooltip).toBe('Ctrl+click: open the 3 referenced documents in tags');
    expect(link?.menu.label).toBe('Open referenced documents');
  });

  it('offers users._id and admins._id for a field that refers to both', () => {
    const link = cellLink(state('orders', null), 'owner', ada);
    expect(link?.tooltip).toBe('Ctrl+click: open the referenced document (in users, admins)');
    expect(link?.menu.tooltip).toBe('The field references several collections');
    expect(link?.targets.map((target) => target.label)).toEqual(['users._id', 'admins._id']);
  });

  it('makes no link and no Find referencing documents in the results of an aggregation', () => {
    const aggregated = state('users', { _id: ada }, { source: 'aggregate' });
    expect(view(aggregated)).toEqual({ kind: 'none' });
    expect(cellLink(aggregated, 'customer', ada)).toBeUndefined();
    expect(rowReferences(aggregated, { _id: ada })).toBeUndefined();
  });

  it('offers Find referencing documents on a row of users, and not on a collection nothing refers to', () => {
    expect(rowReferences(state('users', null), { _id: ada })).toMatchObject({
      label: 'Find referencing documents',
      element: 'relation.open-referencing@row-menu',
    });
    expect(rowReferences(state('orders', null), { _id: oid('1') })).toBeUndefined();
  });

  it('gives a tab on the view recent the links of orders', () => {
    const onView = state('orders', { _id: oid('1'), customer: ada });
    expect(lines(view(onView)).referenced).toEqual(['customer → users']);
  });

  it('makes the column author.$id of an expanded DBRef a link where the DBRef leads', () => {
    expect(cellLink(state('posts', null), 'author.$id', ada)?.targets[0]?.collection).toBe('users');
  });

  it('cuts a filter longer than 300 characters with …', () => {
    const cut = tooltipOf('x'.repeat(400));
    expect(cut).toBe(`${'x'.repeat(300)}…`);
    expect(tooltipOf('short')).toBe('short');
  });
});
