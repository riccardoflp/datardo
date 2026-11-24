/**
 * What the main process lets the window have opened with the system's program (R14.10, T24): only a file a step of
 * this session wrote, and only when its type is one programs open as data; otherwise the file is shown in its folder,
 * which runs nothing. A path the window names is never opened as it is: a path no step of this session wrote is
 * refused. The steps' files are recorded here as the runner writes them (`src/main/files.ts`).
 */
import { extname, resolve } from 'node:path';

/** The files the steps of this session wrote, by their resolved path, with the writer of each. */
const written = new Map<string, string>();

function keyOf(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** A file a step of this session wrote with the writer named (`transfer.export`, `relation.svg`, `gridfs.download`). */
export function recordWritten(path: string, writer: string): void {
  if (path !== '') {
    written.set(keyOf(path), writer);
  }
}

/** Whether a step of this session wrote the file with one of the writers named. */
export function wroteThisSession(path: string, writers: readonly string[]): boolean {
  const writer = written.get(keyOf(path));
  return writer !== undefined && writers.includes(writer);
}

/** Forgets every file written: for the tests, which run several sessions in one process. */
export function forgetWritten(): void {
  written.clear();
}

/** What is done with a path the window asks to open: opened by its program, shown in its folder, or refused. */
export type OpenedAs = 'open' | 'show' | 'refuse';

/**
 * What is done with a path the window asks to open: refused when no step of this session wrote it with one of the
 * `writers`; opened when its extension, in any case, is one of `opens` (without the dot); otherwise shown in its folder.
 */
export function openedAs(
  path: string,
  rules: { readonly writers: readonly string[]; readonly opens: ReadonlySet<string> },
): OpenedAs {
  if (path === '' || !wroteThisSession(path, rules.writers)) {
    return 'refuse';
  }
  const extension = extname(path).slice(1).toLowerCase();
  return rules.opens.has(extension) ? 'open' : 'show';
}
