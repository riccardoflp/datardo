/**
 * The entries of a menu of the table that are drawn: an entry is shown only when the feature it starts is built
 * (roadmap, M8), a submenu left empty goes with it, and no separator is left at an end or next to another.
 */
import type { MenuEntry } from '../../features/table/types';

/** The entries of a menu whose feature is built, its separators kept only between two entries. */
export function shownEntries(
  entries: readonly MenuEntry[],
  isBuilt: (element: string) => boolean,
): readonly MenuEntry[] {
  const kept = entries.flatMap((entry): MenuEntry[] => {
    if (entry.kind === 'separator') {
      return [entry];
    }
    if (!isBuilt(entry.element)) {
      return [];
    }
    if (entry.submenu === undefined) {
      return [entry];
    }
    const submenu = shownEntries(entry.submenu, isBuilt);
    return submenu.length === 0 ? [] : [{ ...entry, submenu }];
  });
  return kept.filter(
    (entry, index) =>
      entry.kind === 'entry' || (index > 0 && index < kept.length - 1 && kept[index - 1]?.kind === 'entry'),
  );
}
