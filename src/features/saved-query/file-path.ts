/**
 * Feature: saved-query.file-path
 *
 * The path of a new file inside the queries folder, `<database>/<collection>/<file>.json`, from the database, the
 * collection and the name of the query, as Mongoster writes it, so that one folder serves both. The same names give
 * the same path on every system, and no path leaves the queries folder.
 */

/** How many characters of the name a file name keeps (Mongoster's). */
export const fileNameLength = 60;

/** The file name of a query whose name leaves nothing. */
const fallbackName = 'query';

/**
 * The file name of a query, without `.json`: the name decomposed (NFKD) without its combining marks, in lower case,
 * each run of characters other than `a` to `z` and `0` to `9` written `-`, without `-` at its ends, cut to 60
 * characters and without a `-` left at the end; `query` when nothing is left.
 */
export function queryFileBase(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u{0300}-\u{036F}]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, fileNameLength)
    .replace(/-+$/u, '');
  return slug === '' ? fallbackName : slug;
}

/** The file name of a query: {@link queryFileBase} and `.json`. */
export function queryFileName(name: string): string {
  return `${queryFileBase(name)}.json`;
}

const reservedName = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/iu;

/**
 * A database or collection name as a folder name every system accepts: each of `< > : " / \ | ? *` and the control
 * characters written `_`, the dots and spaces at its end written one `_`, `_` put before a name Windows reserves, and
 * `_` for an empty name.
 */
export function folderName(name: string): string {
  // eslint-disable-next-line no-control-regex -- the control characters are what is replaced.
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').replace(/[. ]+$/u, '_');
  if (safe === '') {
    return '_';
  }
  return reservedName.test(safe) ? `_${safe}` : safe;
}

/** Whether a path is among those taken, ignoring case, so that the same path is chosen on every system. */
function isTaken(path: string, taken: ReadonlySet<string>): boolean {
  return taken.has(path.toLowerCase());
}

function takenSet(taken: readonly string[]): ReadonlySet<string> {
  return new Set(taken.map((path) => path.toLowerCase()));
}

/**
 * Feature: saved-query.file-path — where a new query goes, relative to the queries folder:
 * `database/collection/name.json`, with `-2`, `-3`… when `taken`, the paths of the files on disk (relative, with
 * `/`), already has it.
 */
export function queryFilePath(database: string, collection: string, name: string, taken: readonly string[]): string {
  const folder = `${folderName(database)}/${folderName(collection)}`;
  const base = queryFileBase(name);
  const paths = takenSet(taken);
  for (let number = 1; ; number += 1) {
    const candidate = `${folder}/${number === 1 ? base : `${base}-${String(number)}`}.json`;
    if (!isTaken(candidate, paths)) {
      return candidate;
    }
  }
}

/**
 * The path a file takes when its query is renamed (`saved-query.rename`): in its own folder, with the file name of the
 * new name, `-2`, `-3`… when another file has it; the path it has when that is already the one it would take.
 */
export function renamedFilePath(file: string, name: string, taken: readonly string[]): string {
  const slash = file.lastIndexOf('/');
  const folder = slash < 0 ? '' : file.slice(0, slash + 1);
  const base = queryFileBase(name);
  const paths = takenSet(taken);
  for (let number = 1; ; number += 1) {
    const candidate = `${folder}${number === 1 ? base : `${base}-${String(number)}`}.json`;
    if (candidate.toLowerCase() === file.toLowerCase()) {
      return file;
    }
    if (!isTaken(candidate, paths)) {
      return candidate;
    }
  }
}
