import { history, undo } from '@codemirror/commands';
import { EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { FieldHint } from '../../../src/features/query/field-hints';
import {
  closeList,
  insertSuggestion,
  listOf,
  openList,
  pressListKey,
  setSource,
  suggestionList,
} from '../../../src/ui/components/editor/completion-state';

const fields: readonly FieldHint[] = [
  { path: '_id', types: ['objectId'], ratio: 1, values: [] },
  {
    path: 'status',
    types: ['string'],
    ratio: 1,
    values: [
      { value: 'paid', count: 310 },
      { value: 'new', count: 120 },
    ],
  },
  { path: 'total', types: ['double', 'int'], ratio: 0.98, values: [] },
];

function editor(doc = '', known: readonly FieldHint[] = fields): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [history(), suggestionList({ kind: 'filter', fields: known })],
  });
}

function typed(state: EditorState, characters: string): EditorState {
  let next = state;
  for (const character of characters) {
    const at = next.selection.main.head;
    next = next.update({
      changes: { from: at, insert: character },
      selection: { anchor: at + character.length },
      userEvent: 'input.type',
    }).state;
  }
  return next;
}

/** Runs a command; gives what it returned, the state after it and how many transactions it made. */
function ran(state: EditorState, command: StateCommand) {
  const transactions: Transaction[] = [];
  let next = state;
  const handled = command({
    state,
    dispatch: (tr) => {
      transactions.push(tr);
      next = tr.state;
    },
  });
  return { handled, state: next, transactions };
}

function labels(state: EditorState): readonly string[] {
  const list = listOf(state);
  return list.open ? (list.suggestions?.items.map((item) => item.label) ?? []) : [];
}

describe('query.autocomplete in the editor', () => {
  it('opens by itself while typing, only right after { [ : , with nothing typed', () => {
    expect(listOf(typed(editor(), '{')).open).toBe(true);
    expect(labels(typed(editor(), '{ st'))[0]).toBe('status');
    const closed = ran(typed(editor(), '{ '), closeList).state;
    expect(listOf(typed(closed, ' ')).open).toBe(false);
  });

  it('writes the suggestion with Enter in one step, and opens again at once on the values of the field', () => {
    const state = typed(editor(), '{ st');
    const result = ran(state, pressListKey('Enter'));
    expect(result.handled).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(result.state.doc.toString()).toBe('{ status: ');
    expect(result.state.selection.main.head).toBe('{ status: '.length);
    expect(labels(result.state)).toEqual(['"paid"', '"new"']);
    const undone = ran(result.state, undo).state;
    expect(undone.doc.toString()).toBe('{ st');
  });

  it('puts the cursor where the suggestion says: inside the brackets of $in', () => {
    const state = typed(editor(), '{ total: { $i');
    const index = listOf(state).suggestions?.items.findIndex((item) => item.label === '$in') ?? -1;
    const result = ran(state, insertSuggestion(index)).state;
    expect(result.doc.toString()).toBe('{ total: { $in: []');
    expect(result.selection.main.head).toBe('{ total: { $in: ['.length);
  });

  it('moves round the list with the arrows, closes with Esc leaving the text, and opens with Ctrl+Space', () => {
    const state = typed(editor(), '{ ');
    const count = listOf(state).suggestions?.items.length ?? 0;
    const up = ran(state, pressListKey('ArrowUp')).state;
    expect(listOf(up).selected).toBe(count - 1);
    const escaped = ran(up, pressListKey('Escape'));
    expect(escaped.handled).toBe(true);
    expect(listOf(escaped.state).open).toBe(false);
    expect(escaped.state.doc.toString()).toBe('{ ');
    expect(ran(escaped.state, pressListKey('Enter')).handled).toBe(false);
    expect(listOf(ran(escaped.state, openList).state).open).toBe(true);
  });

  it('closes when the cursor moves without an edit, and lets ← move the cursor', () => {
    const state = typed(editor(), '{ st');
    const left = ran(state, pressListKey('ArrowLeft'));
    expect(left.handled).toBe(false);
    expect(listOf(left.state).open).toBe(false);
    expect(listOf(state.update({ selection: { anchor: 1 } }).state).open).toBe(false);
  });

  it('adds the fields to the open list when they arrive', () => {
    const state = typed(editor('', []), '{ ');
    expect(labels(state)).not.toContain('status');
    const later = state.update({ effects: setSource.of({ kind: 'filter', fields }) }).state;
    expect(labels(later).slice(0, 3)).toEqual(['_id', 'status', 'total']);
  });
});
