/**
 * Feature: history.update-changes
 *
 * Reads from the `o` of an update's oplog entry the field paths it set, those it unset and the arrays it resized, for
 * the **changes** column: from the `$v: 2` diff, or from `$set` and `$unset` of the older format. A replacement has
 * none.
 */
import { changesText } from './text';
import { hasOperators, isRecord, numberOf, objectOf, type JsonObject, type UpdateChanges } from './types';

interface Collected {
  readonly set: string[];
  readonly unset: string[];
  readonly truncated: string[];
}

/** Walks one section of a `$v: 2` diff, its field paths after `prefix`. */
function walk(diff: JsonObject, prefix: string, into: Collected): void {
  for (const [key, value] of Object.entries(diff)) {
    if (key === 'u' || key === 'i') {
      into.set.push(...Object.keys(objectOf(value)).map((field) => prefix + field));
    } else if (key === 'd') {
      into.unset.push(...Object.keys(objectOf(value)).map((field) => prefix + field));
    } else if (key === 'l') {
      into.truncated.push(changesText.resizedTo(prefix.slice(0, -1), String(numberOf(value) ?? JSON.stringify(value))));
    } else if (/^u\d+$/u.test(key)) {
      into.set.push(prefix + key.slice(1));
    } else if (key.startsWith('s') && key !== 's') {
      walk(objectOf(value), `${prefix}${key.slice(1)}.`, into);
    }
  }
}

/** Feature: history.update-changes — what an update set, unset and resized; `undefined` for a replacement. */
export function updateChanges(o: JsonObject): UpdateChanges | undefined {
  const into: Collected = { set: [], unset: [], truncated: [] };
  const diff = o['diff'];
  if (isRecord(diff)) {
    walk(diff, '', into);
  } else if (hasOperators(o)) {
    into.set.push(...Object.keys(objectOf(o['$set'])));
    into.unset.push(...Object.keys(objectOf(o['$unset'])));
  } else {
    return undefined;
  }
  return into;
}

/** The text of the **changes** column of an update: *set a, b · unset c · resized items to 2*, or *no change*. */
export function updateChangesText(changes: UpdateChanges): string {
  const parts = [
    changes.set.length > 0 ? changesText.set(changes.set.join(', ')) : '',
    changes.unset.length > 0 ? changesText.unset(changes.unset.join(', ')) : '',
    changes.truncated.length > 0 ? changesText.resized(changes.truncated.join(', ')) : '',
  ].filter((part) => part !== '');
  return parts.length === 0 ? changesText.noChange : parts.join(' · ');
}
