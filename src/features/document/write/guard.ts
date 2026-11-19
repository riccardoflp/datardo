/**
 * The guard every write of the document area starts with: a write through a read-only connection, or to a view, is
 * refused before anything is asked, with the codes of the card that raises it, written whole at the call (R4.2).
 */
import { refuse, type Outcome } from '../../../shared/feature';
import { text } from '../text';
import type { DocumentPlace } from '../types';

/** The refusal of a write to `place` when its connection is read-only or it is a view; `undefined` when it may write. */
export function refusedWrite(place: DocumentPlace, readOnlyCode: string, viewCode: string): Outcome | undefined {
  if (place.readOnly) {
    return refuse(readOnlyCode, text.refusals.readOnly(place.connectionName));
  }
  return place.view ? refuse(viewCode, text.refusals.view) : undefined;
}
