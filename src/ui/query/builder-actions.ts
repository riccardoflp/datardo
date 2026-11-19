/**
 * The rows of the query builder (`query.builder`) and **Filter** follow each other: the rows are read from the text of
 * **Filter** (`query.builder-rows`), and a row changed writes the text again (`query.builder-filter`). While the text
 * is the one the rows last wrote, the rows are shown as typed, so that a value being typed is not rewritten under the
 * cursor.
 */
import { edited } from '../../features/query/bar';
import { cleared, emptyRow, rowsOfText, textOfRows, type BuilderRows } from '../../features/query/builder';
import type { BuilderRow, Combine } from '../../features/query/builder-filter';
import type { TabId } from '../../shared/ids';
import { changeCollection, collectionOf, type CollectionTab } from './collection-store';

/** The text of **Filter** each tab's rows last wrote, or left as it was with a note. */
const written = new Map<TabId, string>();

/** The rows the builder of a tab shows; `ISODate()` in the filter is read as the time the query last ran. */
export function builderRowsOf(tab: TabId, collection: CollectionTab): BuilderRows {
  const filter = collection.query.texts.filter;
  if (written.get(tab) === filter) {
    const { rows, combine } = collection.builder;
    return { combine, rows: rows.length === 0 ? [emptyRow] : rows, locked: false };
  }
  return rowsOfText(filter, collection.builder.rows, collection.ranAt);
}

/** Rows changed in the builder: the text of **Filter** they write, or the note of a value that does not fit. */
export function changeRows(tab: TabId, rows: readonly BuilderRow[], combine: Combine): string | undefined {
  const result = textOfRows(rows, combine, Date.now());
  const filter = 'text' in result ? result.text : collectionOf(tab).query.texts.filter;
  written.set(tab, filter);
  changeCollection(tab, (before) => ({
    ...before,
    builder: { rows, combine },
    query: 'text' in result ? edited(before.query, 'filter', result.text) : before.query,
  }));
  return 'note' in result ? result.note : undefined;
}

/** **Clear**: every row removed, one empty row left, **Filter** emptied; nothing is run. */
export function clearRows(tab: TabId): void {
  const after = cleared();
  written.set(tab, after.text);
  changeCollection(tab, (before) => ({
    ...before,
    builder: { rows: after.rows, combine: 'all' },
    query: edited(before.query, 'filter', after.text),
  }));
}
