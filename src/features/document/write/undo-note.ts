/**
 * Whether a write of the document area will be recorded in the undo history, known before its confirmation, and the
 * `undo` of its plan. The rules are those of `undo.note` (M11), which is written beside this area: until the two are
 * merged this module applies them itself, and is then replaced by a call to `undoNote`.
 *
 * A write that will not be recorded says why in its `undo` (`{ cannot: <the line> }`), so that its confirmation carries
 * the line of `undo.note` and nothing is kept for it; one that will be recorded names what to keep.
 */
import type { Json } from '../../../shared/engine-request';
import type { Undo } from '../../../shared/feature';
import type { SettingsState } from '../../../shared/state/settings';
import { setting } from '../../settings/read';
import { text } from '../text';
import type { DocumentPlace, KeptDocuments } from '../types';

/** Why a write will not be recorded, as `undo.note` names it. */
export type NotRecordedReason = 'off' | 'off-for-connection' | 'over-limit';

/** Whether a write will be recorded, why not, and the line its confirmation shows. */
export interface UndoNote {
  readonly recorded: boolean;
  readonly why?: NotRecordedReason;
  readonly line: string;
}

/** The note of a write that keeps `kept`, through the connection of `place`, with the settings as they are. */
export function undoNoteOf(place: DocumentPlace, settings: SettingsState, kept: KeptDocuments): UndoNote {
  if (!setting(settings, 'datardo.undo.enabled')) {
    return { recorded: false, why: 'off', line: text.undo.off };
  }
  if (!place.keepsUndo) {
    return { recorded: false, why: 'off-for-connection', line: text.undo.off };
  }
  const most = setting(settings, 'datardo.undo.maxDocumentsPerOperation');
  if (kept.count > most) {
    return { recorded: false, why: 'over-limit', line: text.undo.overLimit(most) };
  }
  return { recorded: true, line: text.undo.recorded };
}

/** The `undo` of a plan: what to keep when the write will be recorded, otherwise the line that says why not. */
export function undoOf(note: UndoNote, kept: KeptDocuments): Undo {
  return note.recorded ? { keeps: JSON.parse(JSON.stringify(kept)) as Json } : { cannot: note.line };
}
