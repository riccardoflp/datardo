/**
 * What the Indexes section starts through the bridge (`index.show`): the indexes (`index.list`) and the search
 * indexes (`index.list-search`) when the section is shown, on **Refresh**, after every change and while something is
 * being built; and the changes of its toolbar, its rows and the inspector, each read again once it has ended.
 */
import { isBuilding } from '../../../features/index/list';
import type { IndexList, SearchIndexList } from '../../../features/index/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId, type Place, type TabId } from '../../../shared/ids';
import { changeIndexMemory, indexMemoryOf } from './index-store';

/** The collection of a tab whose Indexes section is shown. */
export interface IndexPlace {
  readonly tab: TabId;
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
}

/** The arguments every feature of the area is started with: `{ connection, database, collection }`. */
export function placeArgs(place: IndexPlace): { connection: string; database: string; collection: string } {
  return { connection: place.connection, database: place.database, collection: place.collection };
}

/** Starts a feature of the area on the collection of a place, with what it is given; its result once it ends. */
export function startOn(place: IndexPlace, feature: string, args: Json = {}, from?: Place): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'collection', ...placeArgs(place), connection: place.connection },
    ...(from === undefined ? {} : { place: from }),
    args: { ...placeArgs(place), ...(args as object) },
  });
}

function messageOf(result: IntentResult): string {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
}

/** Reads the indexes again, with `currentOp` while the last list showed a build. */
export async function readIndexes(place: IndexPlace): Promise<void> {
  const before = indexMemoryOf(place.tab).indexes;
  const building = before?.kind === 'list' && isBuilding(before.list);
  changeIndexMemory(place.tab, (memory) => ({ ...memory, loading: true, asked: true }));
  const result = await startOn(place, 'index.list', building ? { building: true } : {});
  changeIndexMemory(place.tab, (memory) => ({
    ...memory,
    loading: false,
    indexes:
      result.kind === 'read'
        ? { kind: 'list', list: result.result as IndexList }
        : { kind: 'error', message: messageOf(result) },
  }));
}

/** Reads the search indexes again; a server without search says so and is not asked again until **Refresh**. */
export async function readSearchIndexes(place: IndexPlace): Promise<void> {
  const result = await startOn(place, 'index.list-search');
  changeIndexMemory(place.tab, (memory) => ({
    ...memory,
    searchIndexes:
      result.kind === 'read' ? (result.result as SearchIndexList) : { kind: 'error', message: messageOf(result) },
  }));
}

/** **Refresh** of the indexes, or of the search indexes. */
export function refresh(place: IndexPlace, which: 'indexes' | 'search'): void {
  void (which === 'indexes' ? readIndexes(place) : readSearchIndexes(place));
}

/** Both lists, when the section is shown. */
export function readBoth(place: IndexPlace): void {
  void readIndexes(place);
  const search = indexMemoryOf(place.tab).searchIndexes;
  if (search?.kind !== 'unsupported') {
    void readSearchIndexes(place);
  }
}

/** The search index features: the list of search indexes follows them. */
const searchFeatures = new Set(['index.create-search', 'index.edit-search', 'index.drop-search']);

/**
 * Starts a change of the area: the list is read every second while it runs, and both lists once it has ended; after a
 * change to a search index, its list is followed for a while.
 */
export async function change(place: IndexPlace, feature: string, args: Json, from?: Place): Promise<IntentResult> {
  changeIndexMemory(place.tab, (memory) => ({ ...memory, changing: memory.changing + 1 }));
  try {
    return await startOn(place, feature, args, from);
  } finally {
    changeIndexMemory(place.tab, (memory) => ({
      ...memory,
      changing: Math.max(0, memory.changing - 1),
      ...(searchFeatures.has(feature) ? { searchChangedAt: Date.now() } : {}),
    }));
    void readIndexes(place);
    if (searchFeatures.has(feature)) {
      void readSearchIndexes(place);
    }
  }
}

/** Selects a row of either table, or none. */
export function selectIndex(tab: TabId, selected: { kind: 'index' | 'search'; name: string } | undefined): void {
  changeIndexMemory(tab, (memory) => {
    const { selected: _selected, ...rest } = memory;
    return selected === undefined ? rest : { ...rest, selected };
  });
}
