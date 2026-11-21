/**
 * The system's dialogs of a file or a folder that an export, an import, a backup and a restore ask with, as app reads
 * the main process answers (`transfer.choose-path`, `backup.choose-path`): the path chosen, or `null` when the dialog
 * was closed. Each dialog starts in the folder last chosen in its area. And the steps of **Open** and **Reveal** in a
 * notification: the file in the system's application for it, or in the system's file manager.
 */
import type { Json } from '../../../shared/engine-request';
import type { AppStep, Plan, ReadFeature } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';

/** What a dialog is: save, open or folder, its title and button, the name it proposes, its filters. */
export interface PathDialog {
  readonly mode: 'save' | 'open' | 'folder';
  readonly title: string;
  readonly button: string;
  /** The name a save dialog proposes. */
  readonly name?: string;
  readonly filters?: readonly { readonly name: string; readonly extensions: readonly string[] }[];
}

/** A dialog as the arguments of its read. */
export function dialogArgs(dialog: PathDialog): Json {
  return {
    mode: dialog.mode,
    title: dialog.title,
    button: dialog.button,
    ...(dialog.name === undefined ? {} : { name: dialog.name }),
    ...(dialog.filters === undefined
      ? {}
      : { filters: dialog.filters.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] })) }),
  };
}

/** A read that shows a dialog through the app action `action`, and gives the path chosen or `null`. */
export function pathRead(id: string, action: string): ReadFeature {
  return {
    kind: 'read',
    id: featureId(id),
    request: (_context, args) => ({ kind: 'app', action, args }),
    parse: (replies) => (typeof replies[0] === 'string' && replies[0] !== '' ? replies[0] : null),
  };
}

/** The answer of a dialog: the path, `null` when it was closed, `undefined` before it was shown. */
export function chosenPath(answer: unknown): string | null | undefined {
  if (answer === null) {
    return null;
  }
  return typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : undefined;
}

/** A plan that does nothing: a dialog closed ends the feature there. */
export function nothing(title: string, cannot: string): Plan {
  return { title, steps: [], danger: { kind: 'none' }, undo: { cannot }, publishes: false, after: [] };
}

/** The step of **Open** (`transfer.open-path`) or **Reveal** (`transfer.reveal-path`) of a file or a folder. */
export function pathStep(what: 'open' | 'reveal', path: string): AppStep {
  return what === 'open'
    ? { kind: 'app', action: 'transfer.open-path', args: { path }, text: `open ${path}` }
    : { kind: 'app', action: 'transfer.reveal-path', args: { path }, text: `reveal ${path}` };
}
