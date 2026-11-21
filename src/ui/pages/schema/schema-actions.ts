/**
 * What the Schema section starts through the bridge (`schema.show`): the sample (`schema.sample`) with the filter of
 * the query bar as typed and the size of **Sample**, when the section is shown, on **Analyze**, `Ctrl+Enter` in the
 * bar, a change of **Sample** and **Run again**; a click on a value, a bar or a type (`schema.filter-from-value`);
 * **Generate…** (`transfer.generate`) and **Validation rules…**. A filter that is refused is marked in the bar; the
 * sample's progress and result reach the section through the app's state.
 */
import { edited } from '../../../features/query/bar';
import type { FilterControl } from '../../../features/schema/show';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place } from '../../../shared/ids';
import type { CollectionRef } from '../../query/collection-reads';
import { changeCollection, changeQuery, collectionOf } from '../../query/collection-store';
import { currentAppState } from '../../state/store';
import { changeSchemaMemory, schemaMemoryOf } from './schema-store';

function start(ref: CollectionRef, feature: string, args: Json, place?: Place): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(place === undefined ? {} : { place }),
    args,
  });
}

function filterText(ref: CollectionRef): string {
  return collectionOf(ref.tab).query.texts.filter;
}

/** Reads and analyzes the sample of the filter as typed; a filter that is not valid is marked, and nothing is sent. */
export async function analyze(ref: CollectionRef, place?: Place): Promise<void> {
  const { size } = schemaMemoryOf(ref.tab);
  changeSchemaMemory(ref.tab, (memory) => ({ ...memory, invalidFilter: false }));
  const result = await start(ref, 'schema.sample', { tab: ref.tab, filter: filterText(ref), size }, place);
  if (result.kind === 'refused') {
    changeSchemaMemory(ref.tab, (memory) => ({ ...memory, invalidFilter: true }));
    changeQuery(ref.tab, (query) => ({ ...query, invalid: ['filter'] }));
  }
}

/** **Sample** changed: the size is kept with the tab and the sample read again. */
export function chooseSize(ref: CollectionRef, size: number): void {
  changeSchemaMemory(ref.tab, (memory) => ({ ...memory, size }));
  void analyze(ref, 'toolbar');
}

/** A click on the name of a field, **Expand all** or **Collapse all**: the fields expanded it leads to. */
export function expandFields(ref: CollectionRef, expanded: readonly string[]): void {
  changeSchemaMemory(ref.tab, (memory) => ({ ...memory, expanded }));
}

/** A value, a bar or a type clicked: its condition joins the filter, which is analyzed again. */
export async function filterOn(ref: CollectionRef, control: FilterControl): Promise<void> {
  const { size } = schemaMemoryOf(ref.tab);
  const args = { tab: ref.tab, filter: filterText(ref), size, path: control.path, click: control.click as Json };
  const result = await start(ref, 'schema.filter-from-value', args, 'table');
  if (result.kind === 'refused') {
    changeQuery(ref.tab, (query) => ({
      ...query,
      invalid: ['filter'],
      error: { message: result.message, runAgain: false },
    }));
  }
}

/** **Generate…**: test documents like those of the collection (`transfer.generate`). */
export function generate(ref: CollectionRef): void {
  void start(ref, 'transfer.generate', {}, 'toolbar');
}

/** The number of the last filter set in each tab that the window showed. */
const shownFilters = new Map<string, number>();

/**
 * A filter put in the bar of a tab by a feature (`query.set-filter`): it is shown in **Filter**, which blinks once.
 * The query of the Documents section is not run: it runs when that section is shown and run again.
 */
export function showSetFilter(ref: CollectionRef): void {
  const set = currentAppState().schema.filters[ref.tab];
  if (set === undefined || shownFilters.get(ref.tab) === set.number) {
    return;
  }
  shownFilters.set(ref.tab, set.number);
  changeCollection(ref.tab, (before) => ({
    ...before,
    query: edited(before.query, 'filter', set.filter),
    flash: { field: 'filter', at: Date.now() },
  }));
}
