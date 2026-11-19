/**
 * Feature: field.layout-follows
 *
 * After a rename the column keeps its layout under the new name; after a removal its layout is dropped. The expanded
 * columns are renamed the same way and saved with the layout.
 */

/** What Datardo remembers of the columns of a collection (`table.columns`): hidden, order, pinned, widths. */
export interface ColumnsLayout {
  readonly hidden?: readonly string[];
  /** Keys in the order the user put them. */
  readonly order?: readonly string[];
  /** Top-level columns kept at the left while the others scroll sideways. */
  readonly pinned?: readonly string[];
  /** Widths set by hand, in px, by key. */
  readonly widths?: Readonly<Record<string, number>>;
  /** The columns of sub-documents and arrays shown as groups of child columns. */
  readonly expanded?: readonly string[];
}

/**
 * Feature: field.layout-follows — `key` after the field `from` was renamed to `to`: the field itself and the columns
 * below it follow; `undefined` when it was removed (no `to`). A key that only starts with the same letters stays.
 */
export function renamedKey(key: string, from: string, to?: string): string | undefined {
  if (key !== from && !key.startsWith(`${from}.`)) {
    return key;
  }
  return to === undefined ? undefined : `${to}${key.slice(from.length)}`;
}

/** The keys renamed, one of each, in their order. */
function renamedKeys(keys: readonly string[], from: string, to?: string): readonly string[] {
  return [...new Set(keys.map((key) => renamedKey(key, from, to)).filter((key) => key !== undefined))];
}

function renamedWidths(
  widths: Readonly<Record<string, number>>,
  from: string,
  to?: string,
): Readonly<Record<string, number>> {
  const entries = Object.entries(widths).flatMap(([key, width]): [string, number][] => {
    const next = renamedKey(key, from, to);
    return next === undefined ? [] : [[next, width]];
  });
  return Object.fromEntries(entries);
}

/**
 * Feature: field.layout-follows — the layout after the field `from` was renamed to `to`, or removed without `to`. The
 * hidden columns, the order and the expanded columns are renamed and keep one of each key; the pinned columns are
 * renamed and keep only top-level keys; the widths move to the new keys. What else the layout holds is kept.
 */
export function renamedLayout<Layout extends ColumnsLayout>(layout: Layout, from: string, to?: string): Layout {
  return {
    ...layout,
    ...(layout.hidden === undefined ? {} : { hidden: renamedKeys(layout.hidden, from, to) }),
    ...(layout.order === undefined ? {} : { order: renamedKeys(layout.order, from, to) }),
    ...(layout.pinned === undefined
      ? {}
      : { pinned: renamedKeys(layout.pinned, from, to).filter((key) => !key.includes('.')) }),
    ...(layout.widths === undefined ? {} : { widths: renamedWidths(layout.widths, from, to) }),
    ...(layout.expanded === undefined ? {} : { expanded: renamedKeys(layout.expanded, from, to) }),
  };
}
