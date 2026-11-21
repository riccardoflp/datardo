/**
 * What the window keeps of the index dialog and the search index dialog between the question the runner asks and the
 * end of its plan (`index.dialog`, `index.search-dialog`): the dialog answered stays drawn, locked, with **Creating…**
 * or **Saving…** and **Close**, while its plan runs; once it has ended, the dialog closes, or opens again with what was
 * typed and the error (`dialogOutcome`). **Close** leaves the plan running: its notification says how it ended.
 */
import { useSyncExternalStore } from 'react';
import type { IndexDialogState } from '../../../features/index/dialog';
import { dialogDefinition } from '../../../features/index/dialog';
import { dialogOutcome, failuresSince, type EditedIndex } from '../../../features/index/parts/dialog-outcome';
import type { SearchDialogState } from '../../../features/index/search-dialog';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { currentAppState } from '../../state/store';
import { change, type IndexPlace } from './index-actions';

/** A dialog answered, as it was when its main button was pressed. */
export type AnsweredDialog = { readonly key: string; readonly where: DialogWhere } & (
  | { readonly kind: 'index'; readonly state: IndexDialogState }
  | { readonly kind: 'search'; readonly state: SearchDialogState }
);

/** The state of each dialog. */
interface DialogStates {
  readonly index: IndexDialogState;
  readonly search: SearchDialogState;
}

/** The collection of a dialog. */
export interface DialogWhere {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
}

let answered: AnsweredDialog | undefined;
let reopening: AnsweredDialog | undefined;
/** How many starts `runWithDialog` follows: a dialog answered outside them is not kept. */
let following = 0;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** The key of a dialog: its collection, and the index being changed. */
export function dialogKey(about: {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly editing?: string;
}): string {
  return JSON.stringify([about.connection, about.database, about.collection, about.editing ?? null]);
}

/** The main button was pressed: the dialog stays drawn, locked, until its plan ends. */
export function dialogAnswered(dialog: AnsweredDialog): void {
  reopening = undefined;
  if (following > 0) {
    answered = dialog;
    changed();
  }
}

/** **Close** while the plan runs: the dialog goes, the plan goes on. */
export function closeAnswered(): void {
  answered = undefined;
  changed();
}

/** The dialog answered whose plan is running, drawn again when it changes. */
export function useAnswered(): AnsweredDialog | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => answered,
  );
}

/**
 * What a dialog opening again on `key` starts from; `undefined` for a dialog opened afresh. It is kept until the
 * dialog is answered or cancelled, so that drawing the dialog twice reads the same.
 */
export function reopeningOf<K extends AnsweredDialog['kind']>(kind: K, key: string): DialogStates[K] | undefined {
  const kept = reopening;
  const state = kept?.kind === kind && kept.key === key ? kept.state : undefined;
  return state as DialogStates[K] | undefined;
}

function editedOf(dialog: AnsweredDialog): EditedIndex | undefined {
  if (dialog.kind !== 'index' || dialog.state.editing === undefined) {
    return undefined;
  }
  const read = dialogDefinition(dialog.state);
  return read.kind === 'definition'
    ? {
        collection: dialog.state.collection,
        name: dialog.state.editing.name,
        current: dialog.state.editing.definition,
        next: read.definition,
      }
    : undefined;
}

function unlocked(dialog: AnsweredDialog, error: string | undefined): AnsweredDialog {
  const { error: _error, ...rest } = dialog.state;
  const state = { ...rest, busy: false, ...(error === undefined ? {} : { error }) };
  return dialog.kind === 'index'
    ? { ...dialog, state: state as IndexDialogState }
    : { ...dialog, state: state as SearchDialogState };
}

/** The dialog answered, which is no longer drawn. */
function takeAnswered(): AnsweredDialog | undefined {
  const kept = answered;
  answered = undefined;
  changed();
  return kept;
}

/**
 * Starts a feature that asks through one of the dialogs, and follows it: once its plan has ended, the dialog answered
 * closes or the feature starts again, its dialog opening on what was typed with the error.
 */
export async function runWithDialog(place: IndexPlace, feature: string, args: Json, from?: Place): Promise<void> {
  const since = currentAppState().runner.logged;
  takeAnswered();
  following += 1;
  const result = await change(place, feature, args, from).finally(() => {
    following -= 1;
  });
  const kept = takeAnswered();
  if (kept === undefined) {
    // Cancelled in the dialog itself, or closed while the plan ran.
    reopening = undefined;
    return;
  }
  const failures = failuresSince(currentAppState().runner.log, feature, since);
  const edited = editedOf(kept);
  const outcome = dialogOutcome({ feature, end: result, failures, ...(edited ? { edited } : {}) });
  if (outcome.kind === 'closed') {
    return;
  }
  reopening = unlocked(kept, outcome.error);
  await runWithDialog(place, feature, args, from);
}
