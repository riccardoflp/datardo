/**
 * Feature: field.path-rules
 *
 * Decides whether a field path can be changed by a column action, and whether a new name is acceptable for a rename.
 * A name typed with spaces around it is checked without them.
 */
import { text } from './text';

/** Feature: field.path-rules — why the dotted `path` cannot be changed by a column action; nothing when it can. */
export function fieldPathError(path: string): string | undefined {
  const trimmed = path.trim();
  if (trimmed === '') {
    return text.paths.enterName;
  }
  const parts = trimmed.split('.');
  if (parts.some((part) => part === '')) {
    return text.paths.emptyPart(trimmed);
  }
  if (parts.some((part) => part.startsWith('$'))) {
    return text.paths.dollar;
  }
  return parts[0] === '_id' ? text.paths.id : undefined;
}

/** Feature: field.path-rules — why `from` cannot be renamed to `to`; nothing when it can. */
export function renameError(from: string, to: string): string | undefined {
  const source = from.trim();
  const target = to.trim();
  const invalid = fieldPathError(target);
  if (invalid !== undefined) {
    return invalid;
  }
  if (target === source) {
    return text.paths.different;
  }
  return target.startsWith(`${source}.`) || source.startsWith(`${target}.`)
    ? text.paths.samePath(source, target)
    : undefined;
}
