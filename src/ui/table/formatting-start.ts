/**
 * What opens a new rule in the Formatting view from outside it (`table.add-format-rule`): **Format cells…** in the
 * menu of a column header and on the column of the selected cell, and Go to's **Add formatting rule…**. The view is
 * shown, with the island when it is hidden (`nav.toggle-inspector`), and the new rule open with the focus in its
 * condition; with 100 rules already, the view reads *A collection keeps at most 100 formatting rules.* instead.
 */
import { isFull, newConditionRule, type FormatCells } from '../../features/table/add-format-rule';
import { newFieldRule } from '../../features/table/color-by-field';
import { collectionRules } from '../../features/table/format-scopes';
import { text } from '../../features/table/text';
import { shownView } from '../../features/nav/inspector';
import { navInput } from '../../features/nav/types';
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import type { Place } from '../../shared/ids';
import { changeInspect } from '../pages/document/inspect-store';
import { collectionRefOf } from '../query/collection-reads';
import type { CollectionRef } from '../query/collection-reads';
import type { Json } from '../../shared/engine-request';
import { collectionOf } from '../query/collection-store';
import { startFeature } from '../shell/intent';
import { currentAppState } from '../state/store';
import { addFieldRule, addRule, focusFormatting, memoryKey, showNote } from './formatting-store';

/** Shows the Formatting view of the active tab, with the island. */
export function showFormattingView(place?: Place): void {
  startFeature('nav.toggle-inspector', { ...(place === undefined ? {} : { place }), args: { view: 'formatting' } });
}

/** Opens a new condition rule of the collection: a row rule, or the cells of a field with **Format cells…**. */
export function openNewRule(ref: CollectionRef, cells: FormatCells | undefined, place?: Place): void {
  const { connection, database, collection } = ref;
  const saved = collectionRules(currentAppState().table.formatting, { connection, database, collection });
  const key = memoryKey(ref);
  showFormattingView(place);
  if (isFull(saved)) {
    showNote(key, text.formatting.tooMany);
    focusFormatting(key);
    return;
  }
  showNote(key, undefined);
  addRule(ref, newConditionRule(crypto.randomUUID(), saved, cells), collectionOf(ref.tab).ranAt);
}

/**
 * **Color by this field**, in the menu of a column header and on the column of the selected cell: a new field rule of
 * the field, saved at once and shown open in the Formatting view; with 100 rules already, the view reads *A collection
 * keeps at most 100 formatting rules.* instead.
 */
export function colorByField(ref: CollectionRef, field: string, place?: Place): void {
  const { connection, database, collection } = ref;
  const saved = collectionRules(currentAppState().table.formatting, { connection, database, collection });
  const key = memoryKey(ref);
  showFormattingView(place);
  if (isFull(saved)) {
    showNote(key, text.formatting.tooMany);
    focusFormatting(key);
    return;
  }
  showNote(key, undefined);
  const rule = newFieldRule(crypto.randomUUID(), saved, field, collectionOf(ref.tab).documents);
  addFieldRule(ref, rule, place === 'column-menu' ? 'table.color-by-field@column-menu' : 'table.color-by-field');
}

/**
 * After **Formatting rules** or **Inspect the selection** (Go to, `Ctrl+Shift+F`), the focus goes into the view
 * shown: on the rules of the Formatting view, or into the Selection view.
 */
export function focusViewAsked(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return;
  }
  const input = navInput(state);
  const showing = !state.nav.inspectorHidden && shownView(input) === 'formatting';
  const formatting = id === 'nav.toggle-inspector:formatting' && !showing;
  if (formatting) {
    focusFormatting(memoryKey(ref));
  } else {
    changeInspect(ref.tab, (before) => ({ ...before, focus: before.focus + 1 }));
  }
}

/** Go to's **Add formatting rule…** and **Format cells…**, on the active collection tab. */
export function addRuleCommand(ref: CollectionRef, field: string | undefined, value: Json | undefined): void {
  if (field === undefined) {
    openNewRule(ref, undefined);
    return;
  }
  openNewRule(ref, { field, ...(value === undefined ? {} : { value }) });
}
