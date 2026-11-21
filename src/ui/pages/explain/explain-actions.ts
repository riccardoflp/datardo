/**
 * What the Explain section starts through the bridge (`explain.show`): the explain (`explain.run`) of the query of the
 * bar as typed, or of the pipeline of the editor, when the section is shown, on **Explain** and on **Run again**; and
 * **Create…** of the suggested index, which opens the index dialog with its keys (`index.create`). Only the last explain
 * of a tab is shown; a query refused before anything is sent marks its field in the bar.
 */
import { readQuery, type ExplainResult, type QueryField } from '../../../features/explain/run';
import { indexKeysDocument } from '../../../features/explain/show';
import type { IndexKey } from '../../../features/explain/types';
import { editorJson } from '../../../features/aggregate/types';
import type { QueryField as BarField } from '../../../features/query/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place } from '../../../shared/ids';
import type { CollectionRef } from '../../query/collection-reads';
import { changeQuery, collectionOf } from '../../query/collection-store';
import { pipelineOf } from '../aggregate/pipeline-store';
import { createIndex } from '../index/row-actions';
import { changeExplainMemory, explainMemoryOf } from './explain-store';

/** The field of the bar of a field of the query: the projection is **Project**. */
const barFields: Readonly<Record<QueryField, BarField>> = { filter: 'filter', sort: 'sort', projection: 'project' };

function argsOf(ref: CollectionRef): Json {
  const { query } = collectionOf(ref.tab);
  const texts = { filter: query.texts.filter, sort: query.texts.sort, projection: query.texts.project };
  return { tab: ref.tab, mode: query.mode, query: texts, pipeline: editorJson(pipelineOf(ref.tab).draft) };
}

/** Marks the field of the bar that is not valid, as the run of the query would. */
function markInvalid(ref: CollectionRef): void {
  const { texts } = collectionOf(ref.tab).query;
  const read = readQuery({ filter: texts.filter, sort: texts.sort, projection: texts.project }, { now: Date.now() });
  if (!read.ok) {
    const field = barFields[read.field];
    changeQuery(ref.tab, (query) => ({ ...query, invalid: [field] }));
  }
}

function ended(ref: CollectionRef, number: number, result: IntentResult): void {
  if (explainMemoryOf(ref.tab).number !== number) {
    return;
  }
  changeExplainMemory(ref.tab, (memory) => {
    const { result: _before, error: _error, ...rest } = memory;
    const base = { ...rest, running: false, cancelled: result.kind === 'cancelled' };
    switch (result.kind) {
      case 'read':
        return { ...base, result: result.result as ExplainResult };
      case 'refused':
      case 'failed':
        return { ...base, error: result.message };
      case 'cancelled':
      case 'done':
        return base;
    }
  });
  if (result.kind === 'refused' && result.code === 'explain.run/invalid-query') {
    markInvalid(ref);
  }
}

/** Asks the server for the explain of what the bar or the editor holds now. */
export async function runExplain(ref: CollectionRef, place?: Place): Promise<void> {
  const number = explainMemoryOf(ref.tab).number + 1;
  changeExplainMemory(ref.tab, (memory) => ({ ...memory, number, running: true, cancelled: false }));
  const result = await window.datardo.start({
    feature: featureId('explain.run'),
    target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(place === undefined ? {} : { place }),
    args: argsOf(ref),
  });
  ended(ref, number, result);
}

/** **Raw** and **Summary**: the choice stays while the section shows other explains. */
export function toggleRaw(ref: CollectionRef): void {
  changeExplainMemory(ref.tab, (memory) => ({ ...memory, raw: !memory.raw }));
}

/** A row of the raw output folded or unfolded. */
export function toggleRows(ref: CollectionRef, toggled: readonly string[]): void {
  changeExplainMemory(ref.tab, (memory) => ({ ...memory, toggled }));
}

/** **Create…**: the index dialog with the suggested keys, in their order and directions (`index.create`). */
export function createSuggested(ref: CollectionRef, keys: readonly IndexKey[]): void {
  createIndex(
    { tab: ref.tab, connection: ref.connection, database: ref.database, collection: ref.collection },
    undefined,
    indexKeysDocument(keys),
  );
}
