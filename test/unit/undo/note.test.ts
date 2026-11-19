import { describe, expect, it } from 'vitest';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Undo } from '../../../src/shared/feature';
import { undoNote } from '../../../src/features/undo/note';
import { recordText } from '../../../src/features/undo/text';
import type { UndoSettings } from '../../../src/features/undo/types';
import { cacheConnection, defaultUndo, localConnection } from './harness';

const keeps: Undo = { keeps: { kind: 'ids', database: 'shop', collection: 'orders', ids: [] } };
const offLine = "The undo history is off for this connection: this can't be undone.";

describe('undo.note', () => {
  interface Row {
    readonly name: string;
    readonly connection: ConnectionView;
    readonly undo: Undo;
    readonly count: number;
    readonly settings: UndoSettings;
    readonly why?: string;
    readonly line: string;
  }

  const rows: readonly Row[] = [
    {
      name: '3 documents',
      connection: localConnection,
      undo: keeps,
      count: 3,
      settings: defaultUndo,
      line: 'It can be undone from the Undo history.',
    },
    {
      name: '20,000 documents',
      connection: localConnection,
      undo: keeps,
      count: 20_000,
      settings: defaultUndo,
      why: 'over-limit',
      line: "This can't be undone: the undo history keeps operations of up to 10,000 documents.",
    },
    {
      name: '501 keys with the limit set to 500',
      connection: cacheConnection,
      undo: keeps,
      count: 501,
      settings: { ...defaultUndo, maxDocumentsPerOperation: 500 },
      why: 'over-limit',
      line: "This can't be undone: the undo history keeps operations of up to 500 keys.",
    },
    {
      name: 'Stop keeping undo history on',
      connection: { ...localConnection, keepsUndo: false },
      undo: keeps,
      count: 1,
      settings: defaultUndo,
      why: 'off-for-connection',
      line: offLine,
    },
    {
      name: 'datardo.undo.enabled off',
      connection: localConnection,
      undo: keeps,
      count: 1,
      settings: { ...defaultUndo, enabled: false },
      why: 'off',
      line: offLine,
    },
    {
      name: 'a plan that cannot be undone',
      connection: localConnection,
      undo: { cannot: "Dropping the destination can't be undone." },
      count: 1,
      settings: defaultUndo,
      why: 'cannot',
      line: "Dropping the destination can't be undone.",
    },
  ];

  it.each(rows)('$name', (row) => {
    const note = undoNote(row.connection, row.undo, row.count, row.settings);
    expect(note.recorded).toBe(row.why === undefined);
    expect(note.why).toBe(row.why);
    expect(note.line).toBe(row.line);
    expect(note.recorded).toBe(note.line === recordText.canBeUndone);
  });

  it('says the undo history is off in every confirmation that keeps something when it is off', () => {
    for (const connection of [localConnection, cacheConnection]) {
      expect(undoNote(connection, keeps, 1, { ...defaultUndo, enabled: false }).line).toBe(offLine);
    }
  });

  it('says a limit of 1 in the singular', () => {
    expect(undoNote(localConnection, keeps, 2, { ...defaultUndo, maxDocumentsPerOperation: 1 }).line).toBe(
      "This can't be undone: the undo history keeps operations of up to 1 document.",
    );
  });

  it('records nothing through a read-only connection', () => {
    expect(undoNote({ ...localConnection, readOnly: true }, keeps, 1, defaultUndo).recorded).toBe(false);
  });
});
