/**
 * What the controls of the query bar do to the tab the window keeps: a field edited (`query.bar`), the run button,
 * **Reset** (`query.reset`), the mode switch (`query.mode`), **Builder**, and a drop on a zone (`query.drag`).
 */
import { edited, typedIn } from '../../features/query/bar';
import { dropped, type Dragged, type Zone } from '../../features/query/drag';
import { readAfterSwitch, switchedMode } from '../../features/query/mode';
import { resetQuery } from '../../features/query/reset';
import type { QueryField, QueryMode } from '../../features/query/types';
import { cancelQuery, runQuery, type CollectionRef } from './collection-reads';
import { changeCollection, changeQuery, collectionOf } from './collection-store';

/** A field of the bar typed in: its new text (digits only in **Skip** and **Limit**), its outline gone. */
export function editField(ref: CollectionRef, field: QueryField, written: string): void {
  changeQuery(ref.tab, (query) => {
    const kept = typedIn(field, written);
    return kept === query.texts[field] && !query.invalid.includes(field) ? query : edited(query, field, kept);
  });
}

/** Runs the query of the bar from its first page, with its count. */
export function runFromBar(ref: CollectionRef): void {
  void runQuery(ref, { texts: 'bar', page: 1, count: true });
}

/** The run button: **Find** runs the query, **Cancel** stops the one that runs. */
export function pressRun(ref: CollectionRef): void {
  if (collectionOf(ref.tab).running) {
    cancelQuery(ref.tab);
  } else {
    runFromBar(ref);
  }
}

/** **Reset**: the five fields emptied, the builder's rows too, and the empty query run. */
export function resetBar(ref: CollectionRef): void {
  changeCollection(ref.tab, (before) => ({
    ...before,
    query: resetQuery(before.query),
    builder: { rows: [], combine: 'all' },
  }));
  runFromBar(ref);
}

/** The mode switch: the other mode and its query run; the mode the tab is in does nothing. */
export function switchMode(ref: CollectionRef, mode: QueryMode): void {
  const before = collectionOf(ref.tab).query;
  const next = readAfterSwitch(before, mode);
  changeQuery(ref.tab, (query) => switchedMode(query, mode));
  // `aggregate.run` once the tab is in Aggregate: the run of the tab follows its mode.
  if (next !== undefined) {
    runFromBar(ref);
  }
}

/** **Builder**: shows or hides the builder under the bar. */
export function toggleBuilder(ref: CollectionRef): void {
  changeQuery(ref.tab, (query) => ({ ...query, builderOpen: !query.builderOpen }));
}

/** A drop on a zone: the condition or the field written in its field of the bar, which flashes, and the query run. */
export function dropOnZone(ref: CollectionRef, zone: Zone, dragged: Dragged): void {
  const now = Date.now();
  const result = dropped(zone, dragged, collectionOf(ref.tab).query.texts, now);
  if ('error' in result) {
    changeQuery(ref.tab, (query) => ({ ...query, error: { message: result.error, runAgain: false } }));
    return;
  }
  changeCollection(ref.tab, (before) => ({
    ...before,
    query: edited(before.query, result.field, result.text),
    flash: { field: result.field, at: now },
  }));
  runFromBar(ref);
}
