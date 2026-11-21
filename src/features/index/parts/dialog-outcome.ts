/**
 * What becomes of the index dialog and of the search index dialog once the plan they answered has ended
 * (`index.create`, `index.edit`, `index.create-search`, `index.edit-search`): it closes when the change was made; it
 * opens again, with what was typed, when the confirmation was cancelled (no message), when the change was refused or
 * failed (with the error), and when the new definition of an edited index was refused and the old one created again
 * (with the server's error and *The index status_1 was created again as it was.*).
 *
 * The runner gives no Operation its replies (Q58): the server's errors are read from the lines the Log wrote for the
 * feature while the plan ran, `failed: <message>`, in the order of the steps (`index.edit`'s `recreateSteps`).
 */
import { indexChange, indexName } from '../change-plan';
import { indexCommand } from '../command';
import { text } from '../text';
import type { IndexDefinition } from '../types';

/** How the plan ended, as the bridge says. */
export type PlanEnd =
  { readonly kind: 'done' | 'cancelled' | 'read' } | { readonly kind: 'refused' | 'failed'; readonly message: string };

/** What the dialog does: closes, or opens again with an error or none. */
export type DialogOutcome = { readonly kind: 'closed' } | { readonly kind: 'again'; readonly error?: string };

/** The index an edit changed: as it was, and the definition saved. */
export interface EditedIndex {
  readonly collection: string;
  readonly name: string;
  readonly current: IndexDefinition;
  readonly next: IndexDefinition;
}

/** What the outcome is decided from. */
export interface DialogEnd {
  readonly feature: string;
  readonly end: PlanEnd;
  /** The errors the Log wrote for the feature while the plan ran, in order. */
  readonly failures: readonly string[];
  /** For `index.edit`. */
  readonly edited?: EditedIndex;
}

/** A line of the Log, as the window has it. */
export interface LoggedLine {
  readonly id: number;
  readonly source: string;
  readonly kind: string;
  readonly text: string;
}

const failedPrefix = /^\[[a-z-]+\.[a-z-]+\] failed: /u;

/** The errors of the Log's lines of a feature written after the line numbered `since`. */
export function failuresSince(lines: readonly LoggedLine[], feature: string, since: number): readonly string[] {
  return lines
    .filter(
      (line) => line.id > since && line.source === feature && line.kind === 'error' && failedPrefix.test(line.text),
    )
    .map((line) => line.text.replace(failedPrefix, ''));
}

/**
 * Whether an edit drops the old index before sending the new definition, with a recovery step that creates it again
 * when the server refuses that definition: under the same name, or when only the name changes. Under another name the
 * new index is built first and a refusal leaves the old one in place: the plan fails with the server's error, and the
 * failures met on the way (the two indexes refused side by side) are no refusal of the definition.
 */
function recovers(edited: EditedIndex): boolean {
  const change = indexChange(edited.current, edited.next);
  const renamedOnly = change.kind === 'recreate' && change.changed.length === 1 && change.changed[0] === 'name';
  return indexName(edited.next) === edited.name || renamedOnly;
}

function editOutcome(end: PlanEnd, failures: readonly string[], edited: EditedIndex): DialogOutcome | undefined {
  if (!recovers(edited)) {
    return undefined;
  }
  const [refused, recovery] = failures;
  if ((end.kind === 'done' || end.kind === 'read') && refused !== undefined) {
    return { kind: 'again', error: `${refused}\n${text.edit.restored(edited.name)}` };
  }
  if (end.kind === 'failed' && refused !== undefined && recovery !== undefined) {
    const command = indexCommand(edited.collection, edited.current);
    return { kind: 'again', error: `${refused}\n${text.edit.notRestored(edited.name, recovery)}\n${command}` };
  }
  return undefined;
}

/** What becomes of the dialog once its plan has ended. */
export function dialogOutcome(ended: DialogEnd): DialogOutcome {
  const { end, failures, edited } = ended;
  const forEdit =
    ended.feature === 'index.edit' && edited !== undefined ? editOutcome(end, failures, edited) : undefined;
  if (forEdit !== undefined) {
    return forEdit;
  }
  switch (end.kind) {
    case 'done':
    case 'read':
      return { kind: 'closed' };
    case 'cancelled':
      return { kind: 'again' };
    case 'refused':
      return { kind: 'again', error: end.message };
    case 'failed':
      return { kind: 'again', error: failures.at(-1) ?? end.message };
  }
}
