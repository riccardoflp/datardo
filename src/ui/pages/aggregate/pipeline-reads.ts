/**
 * Running the pipeline of a collection tab from the window (`aggregate.run`, `aggregate.write-output`): the page and
 * the count of its output, kept in the window's memory of the tab as `query.run` keeps the documents of a query, so
 * that the table, its paging and the status line show them. A pipeline that does not build is refused before anything
 * is sent, with its stage marked; one that writes starts `aggregate.write-output`, which asks its confirmation. A newer
 * run of a tab drops the result of an older one.
 */
import { builtPipeline, type WriteStage } from '../../../features/aggregate/build';
import { stagesOfEditor } from '../../../features/aggregate/edit-as-text';
import { formattedValue } from '../../../features/aggregate/mongosh/format';
import type { PipelineOutput } from '../../../features/aggregate/run';
import { errorMark } from '../../../features/aggregate/stage-marks';
import { text } from '../../../features/aggregate/text';
import { editorJson, makersOf, upToIndex, type PipelineEditor } from '../../../features/aggregate/types';
import { keptQuery, keptText } from '../../../features/query/restore';
import { cancelledLine } from '../../../features/query/run';
import type { ErrorLine } from '../../../features/query/types';
import { countAgain } from '../../../features/table/paging';
import type { Document } from '../../../features/table/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { Context } from '../../../shared/feature';
import { featureId, type Place } from '../../../shared/ids';
import type { CollectionRef, RunHow } from '../../query/collection-reads';
import {
  changeCollection,
  changeQuery,
  collectionOf,
  shownBefore,
  type CollectionTab,
} from '../../query/collection-store';
import { changeDraft, changePipeline, expectKept, pipelineOf } from './pipeline-store';
import { queryJson } from '../../../features/saved-query/types';
import { recordRecent } from '../saved-query/queries-store';

/** The run of each tab: a newer run makes an older one's result be dropped. */
const runs = new Map<string, number>();

/** What reading mongosh syntax needs in the window: the time of the run, and new ids made from it. */
function makersNow(now: number): ReturnType<typeof makersOf> {
  return makersOf({ now } as Context);
}

/** Starts a feature of the aggregate area on the collection of a tab. */
export function startOnTab(ref: CollectionRef, feature: string, args: Json, place?: Place): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(place === undefined ? {} : { place }),
    args,
  });
}

/** Shows a message above the table: the error line of the tab. */
export function showError(ref: CollectionRef, line: ErrorLine): void {
  changeQuery(ref.tab, (query) => ({ ...query, error: line }));
}

/** The error line of a result that is not a page: a refusal, a failure, a cancellation; none for the others. */
function lineOf(result: IntentResult): ErrorLine | undefined {
  switch (result.kind) {
    case 'refused':
      return { message: result.message, runAgain: false };
    case 'failed':
      return {
        message: result.message,
        ...(result.details === undefined ? {} : { details: result.details }),
        runAgain: true,
      };
    case 'cancelled':
      return cancelledLine;
    case 'read':
    case 'done':
      return undefined;
  }
}

/**
 * Refuses a pipeline that does not build before anything is sent, as `aggregate.run` would: a text that does not parse
 * is marked as invalid, a stage that does not build is marked with its error. The stage that writes, when it writes.
 */
function checked(
  ref: CollectionRef,
  editor: PipelineEditor,
  now: number,
): { readonly writes?: WriteStage } | undefined {
  const makers = makersNow(now);
  const read = stagesOfEditor(editor, makers);
  if (!read.ok) {
    changeDraft(ref.tab, (draft) =>
      draft.text === undefined ? draft : { ...draft, text: { ...draft.text, invalid: read.message } },
    );
    showError(ref, { message: read.message, runAgain: false });
    return undefined;
  }
  const upTo = editor.text === undefined ? upToIndex(editor) : read.stages.length - 1;
  const built = builtPipeline(read.stages, upTo, makers);
  if (!built.ok) {
    const error = errorMark(editor, makers);
    changeDraft(ref.tab, (draft) => (error === undefined ? draft : { ...draft, error }));
    showError(ref, { message: built.message, runAgain: false });
    return undefined;
  }
  return built.writes === undefined ? {} : { writes: built.writes };
}

/** The tab as a run begins: its page, the error line emptied, the rows dimmed, the count pending. */
function beginning(before: CollectionTab, how: RunHow, now: number): CollectionTab {
  const { error: _gone, ...query } = before.query;
  const { ranLimit: _limit, ...tab } = before;
  return {
    ...tab,
    started: true,
    query: {
      ...query,
      page: how.page ?? before.query.page,
      pageSize: how.pageSize ?? before.query.pageSize,
      invalid: [],
      selection: how.page === undefined && how.texts === 'ran' ? before.query.selection : { keys: [] },
    },
    phase: shownBefore(before) ? { kind: 'running' } : { kind: 'loading' },
    ranAt: now,
    ranSkip: 0,
    running: true,
    count: countAgain(before.count),
  };
}

/** The tab after a page of the output, or the error line with the rows shown before kept. */
function afterRead(before: CollectionTab, result: IntentResult, milliseconds: number): CollectionTab {
  const output = result.kind === 'read' ? (result.result as PipelineOutput) : undefined;
  const base = { ...before, running: false };
  if (output === undefined || output.failure !== undefined) {
    const line =
      output?.failure === undefined
        ? lineOf(result)
        : { message: output.failure, details: output.failure, runAgain: true };
    const kept = result.kind === 'cancelled' && before.hasRows;
    return {
      ...base,
      phase: kept || before.hasRows ? { kind: 'shown' } : { kind: 'failed', notConnected: false },
      count: { kind: 'failed' },
      query: line === undefined ? before.query : { ...before.query, error: line },
    };
  }
  const documents = output.documents as readonly Document[];
  return {
    ...base,
    documents,
    hasRows: documents.length > 0,
    phase: { kind: 'shown' },
    milliseconds,
    count: output.count === undefined ? { kind: 'failed' } : { kind: 'counted', count: output.count, estimated: false },
  };
}

/** The pipeline a run sends: the draft run from the editor, its mark of error gone; or the one last run. */
function editorToRun(ref: CollectionRef, how: RunHow): PipelineEditor {
  const kept = pipelineOf(ref.tab);
  if (how.texts === 'ran' && kept.ran !== undefined) {
    return kept.ran;
  }
  const { error: _gone, ...draft } = kept.draft;
  return draft;
}

/**
 * `aggregate.run`: runs the pipeline of a tab up to the stage shown, for a page, with its count; or refuses it, or
 * starts `aggregate.write-output` when it writes.
 */
export async function runPipeline(ref: CollectionRef, how: RunHow): Promise<void> {
  const now = Date.now();
  const editor = editorToRun(ref, how);
  if (how.texts === 'bar') {
    changeDraft(ref.tab, (draft) => (draft.error === undefined ? draft : editor));
  }
  const check = checked(ref, editor, now);
  if (check === undefined) {
    return;
  }
  if (check.writes !== undefined) {
    await writePipeline(ref, editor, check.writes);
    return;
  }
  const run = (runs.get(ref.tab) ?? 0) + 1;
  runs.set(ref.tab, run);
  changeCollection(ref.tab, (tab) => beginning(tab, how, now));
  const { note: _note, ...rest } = pipelineOf(ref.tab);
  changePipeline(ref.tab, () => ({ ...rest, ran: editor }));
  expectKept(ref.tab, editor);
  const query = collectionOf(ref.tab).query;
  const args = {
    tab: ref.tab,
    pipeline: editorJson(editor),
    page: query.page,
    pageSize: query.pageSize,
    keep: keptText({ ...keptQuery(query), mode: 'aggregate' }),
  };
  const result = await startOnTab(ref, 'aggregate.run', args);
  if (runs.get(ref.tab) !== run) {
    return;
  }
  changeCollection(ref.tab, (tab) => afterRead(tab, result, Date.now() - now));
  const output = result.kind === 'read' ? (result.result as PipelineOutput) : undefined;
  if (how.texts === 'bar' && output !== undefined && output.failure === undefined) {
    // A pipeline that ran without an error is added to the recent queries of its collection (`saved-query.recent`).
    recordRecent(ref, queryJson({ kind: 'pipeline', stages: editor.stages }));
  }
}

/** The text of the stage that writes, as the messages name its target: `"paid_orders"`, `{ into: "totals" }`. */
function writesTo(stage: WriteStage): string {
  return formattedValue(stage.body, { kind: 'one-line' });
}

/**
 * `aggregate.write-output`: a pipeline that writes, run after its confirmation. Once written, the table shows no rows
 * and says where the output went; a confirmation cancelled sends nothing and says so above the table.
 */
async function writePipeline(ref: CollectionRef, editor: PipelineEditor, stage: WriteStage): Promise<void> {
  const result = await startOnTab(ref, 'aggregate.write-output', { tab: ref.tab, pipeline: editorJson(editor) });
  if (result.kind === 'cancelled') {
    showError(ref, { message: text.results.cancelled(stage.name), runAgain: false });
    return;
  }
  const line = lineOf(result);
  if (line !== undefined) {
    showError(ref, line);
    return;
  }
  changePipeline(ref.tab, (before) => ({
    ...before,
    ran: editor,
    note: text.results.written(stage.name, writesTo(stage)),
  }));
  recordRecent(ref, queryJson({ kind: 'pipeline', stages: editor.stages }));
  changeCollection(ref.tab, (tab) => {
    const { error: _gone, ...query } = tab.query;
    return {
      ...tab,
      documents: [],
      hasRows: false,
      phase: { kind: 'shown' },
      count: { kind: 'counted', count: 0, estimated: false },
      query,
    };
  });
}
