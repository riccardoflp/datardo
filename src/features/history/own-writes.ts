/**
 * Feature: history.own-writes
 *
 * Tells which writes found in the oplog were made from Datardo, by matching them with the operations of the undo
 * history that wrote the same document. The undo history (`undo.record`) gives the operations it recorded on one
 * document between two times ({@link recordedSpan}), each with its title, its time and what it did to the document:
 * that is {@link RecordedOperation}, the input this card takes from it.
 */
import type { DocumentVersion, WriteKind } from './types';

/** How long before a write's wall clock time an operation may have been recorded: the clocks differ. */
export const beforeMs = 60_000;

/** How long after a write's wall clock time an operation may have been recorded: it is recorded when it starts. */
export const afterMs = 300_000;

/** What an operation of the undo history did to the document. */
export type RecordedChange = 'inserted' | 'updated' | 'deleted';

/** An operation of the undo history on one document, as the undo history gives it. */
export interface RecordedOperation {
  /** Its title in the undo history: *Edit qty of 1*. */
  readonly title: string;
  /** When it was recorded, in milliseconds since 1970. */
  readonly time: number;
  readonly did: RecordedChange;
}

/** What an operation must have done to match a write of each kind; drops and renames never match. */
const expected: Readonly<Record<WriteKind, RecordedChange | undefined>> = {
  insert: 'inserted',
  update: 'updated',
  replace: 'updated',
  delete: 'deleted',
  drop: undefined,
  renamed: undefined,
};

/** The versions that can be Datardo's: with a wall clock time, and not a drop or a rename. */
function timedVersions(versions: readonly DocumentVersion[]): readonly DocumentVersion[] {
  return versions.filter((version) => version.write.wall !== undefined && expected[version.kind] !== undefined);
}

/**
 * The times to ask the undo history for: from 60 seconds before the oldest wall clock time of the versions to 300
 * seconds after the newest; `undefined` when no version can be Datardo's.
 */
export function recordedSpan(
  versions: readonly DocumentVersion[],
): { readonly from: number; readonly to: number } | undefined {
  const times = timedVersions(versions).map((version) => version.write.wall ?? 0);
  return times.length === 0 ? undefined : { from: Math.min(...times) - beforeMs, to: Math.max(...times) + afterMs };
}

/** The nearest operation in time that did what the version's write did, within its bounds; -1 when none. */
function nearest(version: DocumentVersion, left: readonly RecordedOperation[]): number {
  const wall = version.write.wall ?? 0;
  let best = -1;
  left.forEach((operation, index) => {
    const fits =
      operation.did === expected[version.kind] && operation.time >= wall - beforeMs && operation.time <= wall + afterMs;
    const closer = best < 0 || Math.abs(operation.time - wall) < Math.abs((left[best]?.time ?? 0) - wall);
    if (fits && closer) {
      best = index;
    }
  });
  return best;
}

/**
 * Feature: history.own-writes — the title of the operation of the undo history that made each write, by the key of
 * its version (`history.versions`). The writes are taken oldest first; each takes the nearest operation in time among
 * those left, and an operation is used once. A write without a match is not Datardo's, as far as it can tell.
 */
export function ownWrites(
  versions: readonly DocumentVersion[],
  recorded: readonly RecordedOperation[],
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  const left = [...recorded];
  const oldestFirst = [...timedVersions(versions)].sort((a, b) => (a.write.wall ?? 0) - (b.write.wall ?? 0));
  for (const version of oldestFirst) {
    const index = nearest(version, left);
    const operation = left[index];
    if (operation !== undefined) {
      titles.set(version.key, operation.title);
      left.splice(index, 1);
    }
  }
  return titles;
}
