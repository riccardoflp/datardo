/**
 * The modes of the data folder, set again at each start (platform.md, "Per system"; R14.11, T25): on macOS and Linux
 * the folder and Datardo's folders in it `0700`, Datardo's files `0600`, so that what an older version made with the
 * `umask`'s modes is closed too. `chromium/` is Electron's and is left as it is; a link is never followed. A mode that
 * cannot be set is said once and stops nothing.
 */
import { chmod, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { privateModes } from './store';

/** The folders of the data folder that are Datardo's own (data.md, "The data folder"). */
export const ownFolders: readonly string[] = ['state', 'saved-queries', 'undo', 'tasks'];

/** What was changed, and the first path whose mode could not be set. */
export interface ModesSet {
  readonly changed: number;
  readonly failed: number;
  readonly firstFailure?: string;
}

interface Tally {
  changed: number;
  failed: number;
  firstFailure?: string;
  readonly change: (path: string, mode: number) => Promise<void>;
}

/**
 * Sets the modes of the data folder `folder` and of what it holds of Datardo's own: its files, and the folders
 * {@link ownFolders} with all they hold. Nothing is done on Windows. `said` is told once when a mode could not be set;
 * `change` sets one mode (`chmod`, replaced by the tests).
 */
export async function closeDataFolder(
  folder: string,
  said: (text: string) => void = () => undefined,
  change: (path: string, mode: number) => Promise<void> = chmod,
): Promise<ModesSet> {
  const tally: Tally = { changed: 0, failed: 0, change };
  if (privateModes === undefined) {
    return counted(tally);
  }
  const modes = privateModes;
  const found = await lstat(folder).catch(() => undefined);
  if (found === undefined || !found.isDirectory()) {
    return counted(tally);
  }
  await setMode(folder, found.mode, modes.folder, tally);
  for (const name of await namesIn(folder, tally)) {
    const path = join(folder, name);
    const entry = await lstat(path).catch(() => undefined);
    if (entry?.isFile() === true) {
      await setMode(path, entry.mode, modes.file, tally);
    } else if (entry?.isDirectory() === true && ownFolders.includes(name)) {
      await closeFolder(path, entry.mode, tally);
    }
  }
  if (tally.failed > 0) {
    said(
      `The data folder could not be made readable only by you: ${String(tally.failed)} ${tally.failed === 1 ? 'mode' : 'modes'} not set, the first of ${tally.firstFailure ?? folder}.`,
    );
  }
  return counted(tally);
}

function counted({ changed, failed, firstFailure }: Tally): ModesSet {
  return { changed, failed, ...(firstFailure === undefined ? {} : { firstFailure }) };
}

async function closeFolder(folder: string, mode: number, tally: Tally): Promise<void> {
  const modes = privateModes;
  if (modes === undefined) {
    return;
  }
  await setMode(folder, mode, modes.folder, tally);
  for (const name of await namesIn(folder, tally)) {
    const path = join(folder, name);
    const entry = await lstat(path).catch(() => undefined);
    if (entry?.isFile() === true) {
      await setMode(path, entry.mode, modes.file, tally);
    } else if (entry?.isDirectory() === true) {
      await closeFolder(path, entry.mode, tally);
    }
  }
}

async function namesIn(folder: string, tally: Tally): Promise<readonly string[]> {
  try {
    return await readdir(folder);
  } catch {
    failed(folder, tally);
    return [];
  }
}

async function setMode(path: string, mode: number, wanted: number, tally: Tally): Promise<void> {
  if ((mode & 0o777) === wanted) {
    return;
  }
  try {
    await tally.change(path, wanted);
    tally.changed += 1;
  } catch {
    failed(path, tally);
  }
}

function failed(path: string, tally: Tally): void {
  tally.failed += 1;
  tally.firstFailure ??= path;
}
