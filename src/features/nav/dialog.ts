/**
 * Feature: nav.dialog
 *
 * How every dialog behaves, whatever feature opened it: one at a time, the window behind does not answer, where the
 * focus goes, what `Esc`, `Enter` and a click outside do. The component of `src/ui/shell/dialog.tsx` draws it.
 */
import type { Question } from '../../shared/question';
import type { OpenDialog } from '../../shared/state/runner';

/** At most 560 px wide (Datardo's choice). */
export const dialogWidthPx = 560;

/** At most 80% of the window's height (Datardo's choice). */
export const dialogHeightShare = 0.8;

/**
 * The kinds of dialog, which decide their behavior: a form (several fields, or a View such as About), a list to pick
 * from, a confirmation, and a destructive confirmation where a name is typed.
 */
export type DialogKind = 'form' | 'pick' | 'confirm' | 'destructive';

/** Where the focus goes when a dialog opens. */
export type DialogFocus = 'first-field' | 'cancel' | 'name-field';

/** How a dialog of a kind behaves (nav.dialog, "Rules"). */
export interface DialogBehavior {
  readonly kind: DialogKind;
  readonly focus: DialogFocus;
  /** A click outside cancels it, as `Esc` does: only a list to pick from. */
  readonly closesOnClickOutside: boolean;
  /** `Enter` in a field presses the button that goes on, when what is typed is valid. */
  readonly enterInFieldConfirms: boolean;
}

/** What the dialogs of the window show now. */
export interface DialogView {
  /** The dialog shown: the first asked; the others wait. */
  readonly shown?: OpenDialog;
  readonly behavior?: DialogBehavior;
  /** How many wait behind it. */
  readonly waiting: number;
}

/** What the view is computed from: the dialogs the runner has opened, in the order they were asked for. */
export interface DialogState {
  readonly dialogs: readonly OpenDialog[];
}

/** Feature: nav.dialog. The dialog shown, how it behaves, and how many wait. */
export function view(state: DialogState): DialogView {
  const [shown, ...rest] = state.dialogs;
  if (shown === undefined) {
    return { waiting: 0 };
  }
  return { shown, behavior: dialogBehavior(dialogKind(shown)), waiting: rest.length };
}

/** The kind of a dialog the runner opened. */
export function dialogKind(dialog: OpenDialog): DialogKind {
  if (dialog.kind === 'confirmation') {
    return dialog.confirmation.danger.kind === 'destructive' ? 'destructive' : 'confirm';
  }
  return isPick(dialog.question) ? 'pick' : 'form';
}

/** How a dialog of a kind behaves. */
export function dialogBehavior(kind: DialogKind): DialogBehavior {
  switch (kind) {
    case 'form':
      return { kind, focus: 'first-field', closesOnClickOutside: false, enterInFieldConfirms: true };
    case 'pick':
      return { kind, focus: 'first-field', closesOnClickOutside: true, enterInFieldConfirms: true };
    case 'confirm':
      return { kind, focus: 'cancel', closesOnClickOutside: false, enterInFieldConfirms: true };
    case 'destructive':
      return { kind, focus: 'name-field', closesOnClickOutside: false, enterInFieldConfirms: false };
  }
}

/** Whether a dialog is open, so that the window behind takes no key of a command and no `F6`. */
export function isDialogOpen(state: DialogState): boolean {
  return state.dialogs.length > 0;
}

/** A question that is one list to pick from. */
function isPick(question: Question): boolean {
  const [only, ...others] = question.fields;
  return others.length === 0 && only !== undefined && only.kind !== 'text';
}
