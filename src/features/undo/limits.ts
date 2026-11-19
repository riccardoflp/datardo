/**
 * Feature: undo.limits — the undo history keeps at most a size, an age and a number of operations, deleting the
 * oldest first, so that its folder stays small. It runs when Datardo starts, after each operation is saved and when a
 * `datardo.undo` setting changes.
 */
import type { Answers, Context, Outcome, Step } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { dayMs, keptOperations } from './prune-order';
import { entryFileName } from './record';
import { undoOf } from './state/history';
import { removeText } from './text';
import type { UndoEntry } from './types';
import { appStep, fieldsOf, undoSettings } from './types';

/** How `undo/index.json` was found at start, as the storage tells it. */
export type IndexFound = 'missing' | 'current' | 'older' | 'newer' | 'damaged';

/** A file of the folder of the undo history, as the main process lists it at start. */
export interface FolderFile {
  readonly name: string;
  /** When it was last written, in milliseconds since 1970. */
  readonly time: number;
}

/**
 * What the main process looked up at start, given as `answers.start`: how the index was found, the files of the
 * folder, and whether an index set aside as damaged is still in the folder.
 */
export interface StartFacts {
  readonly index: IndexFound;
  readonly files: readonly FolderFile[];
  readonly damagedBefore: boolean;
}

const indexStates: readonly IndexFound[] = ['missing', 'current', 'older', 'newer', 'damaged'];

/** The facts at start from what the main process gave; none when it is not the start. */
export function startFactsOf(value: unknown): StartFacts | undefined {
  const fields = fieldsOf(value);
  const index = indexStates.find((each) => each === fields['index']);
  if (index === undefined) {
    return undefined;
  }
  const files = Array.isArray(fields['files'])
    ? (fields['files'] as readonly unknown[]).flatMap((each) => {
        const file = fieldsOf(each);
        return typeof file['name'] === 'string' && typeof file['time'] === 'number'
          ? [{ name: file['name'], time: file['time'] }]
          : [];
      })
    : [];
  return { index, files, damagedBefore: fields['damagedBefore'] === true };
}

/** Whether an operation has a file: one not undone, with a size. */
function hasFile(entry: UndoEntry): boolean {
  return entry.undone === undefined && entry.size > 0;
}

/** The operations whose file is missing at start; undone ones have no file and stay. */
export function missingFiles(entries: readonly UndoEntry[], files: readonly FolderFile[]): readonly UndoEntry[] {
  const names = new Set(files.map((each) => each.name));
  return entries.filter((entry) => hasFile(entry) && !names.has(entryFileName(entry.id)));
}

/**
 * The files of the folder that belong to no operation. After an index was set aside as damaged, only those older than
 * `datardo.undo.maxDays` are, so that an index put back by hand finds its files (data.md, "Versions"; RS4).
 */
export function orphanFiles(
  entries: readonly UndoEntry[],
  start: StartFacts,
  now: number,
  maxDays: number,
): readonly FolderFile[] {
  const known = new Set(entries.map((each) => entryFileName(each.id)));
  const cutoff = now - maxDays * dayMs;
  return start.files.filter(
    (file) => file.name.endsWith('.json.gz') && !known.has(file.name) && (!start.damagedBefore || file.time < cutoff),
  );
}

/**
 * Feature: undo.limits — the operations beyond the limits, and at start those whose file is missing and the files that
 * belong to no operation. An index that could not be read, or was written by a newer Datardo, deletes nothing (RS4).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const undo = undoOf(context.state);
  const start = startFactsOf(answers['start']);
  const settings = undoSettings(context.state.settings);
  const steps: Step[] = [];
  if (!undo.writable || start?.index === 'damaged' || start?.index === 'newer') {
    return run(limitsPlan(steps));
  }
  const missing = start === undefined ? [] : missingFiles(undo.entries, start.files);
  if (missing.length > 0) {
    const ids = missing.map((each) => each.id);
    steps.push(appStep('undo.prune', { operations: ids }, removeText.missingFileStep(ids.length)));
  }
  const gone = new Set<string>(missing.map((each) => each.id));
  const left = undo.entries.filter((each) => !gone.has(each.id));
  const kept = new Set<string>(keptOperations(left, context.now, settings).map((each) => each.id));
  const beyond = left.filter((each) => !kept.has(each.id)).map((each) => each.id);
  if (beyond.length > 0) {
    steps.push(appStep('undo.prune', { operations: beyond }, removeText.pruneStep(beyond.length)));
  }
  const orphans = start === undefined ? [] : orphanFiles(undo.entries, start, context.now, settings.maxDays);
  if (orphans.length > 0) {
    const files = orphans.map((each) => each.name);
    steps.push(appStep('undo.delete-files', { files }, removeText.orphanStep(files.length)));
  }
  return run(limitsPlan(steps));
}

function limitsPlan(steps: readonly Step[]): Parameters<typeof run>[0] {
  return {
    title: removeText.limitsTitle,
    steps,
    danger: noDanger,
    undo: { cannot: removeText.cannotUndoClear },
    publishes: false,
    after: [],
  };
}
