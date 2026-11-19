/**
 * Feature: undo.note — whether a write will be recorded in the undo history, and why not, known before its
 * confirmation: the line every confirmation of a write carries about undo.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Undo } from '../../shared/feature';
import { recordText } from './text';
import type { UndoSettings } from './types';
import { unitOf, whyNotRecording } from './types';

/** Why a write will not be recorded. */
export type NotRecorded = 'cannot' | 'off' | 'off-for-connection' | 'over-limit';

/** Whether a write will be recorded, why not, and the line its confirmation shows. */
export interface UndoNote {
  readonly recorded: boolean;
  readonly why?: NotRecorded;
  readonly line: string;
}

/**
 * Feature: undo.note. `count` is the number of documents or keys the plan announces; a read-only connection records
 * nothing, as one that does not keep its undo history.
 */
export function undoNote(connection: ConnectionView, undo: Undo, count: number, settings: UndoSettings): UndoNote {
  if ('cannot' in undo) {
    return { recorded: false, why: 'cannot', line: undo.cannot };
  }
  const off = whyNotRecording(connection, settings);
  if (off !== undefined) {
    return { recorded: false, why: off, line: recordText.off };
  }
  if (count > settings.maxDocumentsPerOperation) {
    return {
      recorded: false,
      why: 'over-limit',
      line: recordText.overLimit(settings.maxDocumentsPerOperation, unitOf(connection.engine)),
    };
  }
  return { recorded: true, line: recordText.canBeUndone };
}
