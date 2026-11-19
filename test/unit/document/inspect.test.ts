/**
 * What the inspector shows for the selection of the table of `shop.orders`.
 */
import { describe, expect, it } from 'vitest';
import { headerId, lineControls, view, type InspectState } from '../../../src/features/document/inspect';
import type { JsonRecord } from '../../../src/features/document/types';
import { int, objectId } from './context';

const document: JsonRecord = {
  _id: objectId('65f1c0de9a7b4e00012f3a2c'),
  at: { $date: { $numberLong: '1710496800000' } },
  a: { b: { c: { d: { e: int(1) } } } },
  items: [int(1), int(2)],
};

const state: InspectState = {
  selection: { kind: 'one', document, page: 2, pageSize: 50, row: 2, first: false, last: false },
  collection: 'orders',
  source: 'find',
  readOnly: false,
  view: false,
  mode: 'tree',
  folding: 'levels',
  toggled: [],
  references: false,
};

/** The view of a document, which the state must give. */
function shown(changed: Partial<InspectState> = {}): Extract<ReturnType<typeof view>, { kind: 'document' }> {
  const result = view({ ...state, ...changed });
  if (result.kind !== 'document') {
    throw new Error(`Expected a document, got ${result.kind}`);
  }
  return result;
}

function labels(controls: readonly { readonly label: string }[]): readonly string[] {
  return controls.map((control) => control.label);
}

describe('document.inspect', () => {
  it('shows the third row of the second page of 50 as Document 53 · <_id>, with the header orders · 65f1…a2c', () => {
    expect(shown().tooltip).toBe('Document 53 · ObjectId("65f1c0de9a7b4e00012f3a2c")');
    expect(shown().header).toBe('orders · 65f1…a2c');
    expect(headerId(int(7))).toBe('7');
  });

  it('disables Next document on the last row of the page, and Previous document on the first', () => {
    const last = shown({
      selection: { kind: 'one', document, page: 1, pageSize: 50, row: 49, first: false, last: true },
    });
    expect(last.buttons.find((button) => button.label === 'Next document')?.enabled).toBe(false);
    expect(last.buttons.find((button) => button.label === 'Previous document')?.enabled).toBe(true);
    const first = shown({
      selection: { kind: 'one', document, page: 1, pageSize: 50, row: 0, first: true, last: false },
    });
    expect(first.buttons.find((button) => button.label === 'Previous document')?.enabled).toBe(false);
  });

  it('folds sub-documents deeper than three levels, showing <n> fields; Expand all unfolds them', () => {
    const folded = shown().lines.find((line) => line.path === 'a.b.c.d');
    expect(folded).toMatchObject({ depth: 3, value: '1 field', open: false });
    expect(shown().lines.some((line) => line.path === 'a.b.c.d.e')).toBe(false);
    expect(shown({ folding: 'all-open' }).lines.find((line) => line.path === 'a.b.c.d.e')).toMatchObject({
      value: '1',
    });
    expect(shown({ toggled: ['a.b.c.d'] }).lines.some((line) => line.path === 'a.b.c.d.e')).toBe(true);
    expect(shown().lines.find((line) => line.path === 'items')).toMatchObject({ value: '2 items', open: true });
  });

  it('shows the same document as text in mongosh syntax with ObjectId and ISODate, indented by two spaces', () => {
    const text = shown({ mode: 'text' }).text;
    expect(
      text.startsWith('{\n  _id: ObjectId("65f1c0de9a7b4e00012f3a2c"),\n  at: ISODate("2024-03-15T10:00:00.000Z"),'),
    ).toBe(true);
  });

  it('disables Open in a tab, Delete document and History without _id, saying why', () => {
    const noId = shown({
      selection: { kind: 'one', document: { name: 'Ada' }, page: 1, pageSize: 50, row: 0, first: true, last: true },
    });
    const why = 'Not available: the document has no _id (excluded by the projection?)';
    expect(noId.buttons.find((button) => button.label === 'Open in a tab')).toMatchObject({
      enabled: false,
      tooltip: why,
    });
    expect(noId.menu.find((entry) => entry.label === 'Delete document')).toMatchObject({
      enabled: false,
      tooltip: why,
    });
    expect(noId.history).toMatchObject({ enabled: false, tooltip: why });
    expect(noId.header).toBe('orders');
    expect(noId.lines.every((line) => !line.editable)).toBe(true);
  });

  it('has no Duplicate… and no Delete document on a read-only connection, edits nothing, and opens the tab read-only', () => {
    const readOnly = shown({ readOnly: true });
    expect(readOnly.menu).toEqual([]);
    expect(readOnly.lines.every((line) => !line.editable)).toBe(true);
    expect(readOnly.buttons.find((button) => button.label === 'Open in a tab')).toMatchObject({
      enabled: true,
      readOnly: true,
      element: 'document.open@inspector',
    });
  });

  it('edits every value but _id with a double click on a collection that can be changed', () => {
    const lines = shown().lines;
    expect(lines.find((line) => line.path === '_id')?.editable).toBe(false);
    expect(lines.find((line) => line.path === 'at')?.editable).toBe(true);
    expect(labels(shown().menu)).toEqual(['Duplicate…', 'Delete document']);
    expect(lineControls.edit.element).toBe('document.inline-edit@inspector');
  });

  it('has the document and Copy as only in Aggregate', () => {
    const aggregate = shown({ source: 'aggregate', references: true });
    expect(labels(aggregate.buttons)).toEqual(['Copy as']);
    expect(aggregate.menu).toEqual([]);
    expect(aggregate.history).toBeUndefined();
    expect(aggregate.goFromHere).toBeUndefined();
    expect(aggregate.lines.every((line) => !line.editable)).toBe(true);
  });

  it('says 3 documents selected with three rows selected, and what to do with none', () => {
    expect(view({ ...state, selection: { kind: 'several', count: 3 } })).toEqual({
      kind: 'several',
      text: '3 documents selected',
    });
    expect(view({ ...state, selection: { kind: 'none' } })).toEqual({
      kind: 'nothing',
      text: 'Select a document to inspect it.',
    });
  });

  it('offers Go from here when the document has references to follow', () => {
    expect(shown({ references: true }).goFromHere).toMatchObject({ element: 'relation.follow@inspector' });
    expect(shown().goFromHere).toBeUndefined();
  });
});
