/**
 * What the cards of the aggregate area share: the pipeline of a collection tab (its stages, the stage shown, the text
 * while it is shown, the stage of the last error), where it is (the collection, its connection, its tab), how it is
 * read from the arguments of a feature and from the memory of its tab, and the app step that sets it.
 *
 * The pipeline of a tab is kept in the tab's memory (`TabMemory.pipeline`) as the JSON of {@link PipelineEditor}, so
 * that `tab.restore` brings back its stages, the disabled ones and the stage shown (`aggregate.show`).
 */
import type { Json } from '../../shared/engine-request';
import type { After, AppStep, Answers, Context, Plan } from '../../shared/feature';
import { noDanger } from '../../shared/feature';
import { featureId, tabId, type ConnectionId, type TabId } from '../../shared/ids';
import type { Target } from '../../shared/target';
import type { Tab } from '../../shared/state/tabs';
import type { Makers } from './mongosh/helpers';

/** One stage of a pipeline: its name (`$match`), its body in mongosh syntax, and whether it is enabled. */
export interface Stage {
  readonly name: string;
  readonly body: string;
  readonly enabled: boolean;
}

/** The pipeline of a collection tab, as the pipeline editor shows it. */
export interface PipelineEditor {
  readonly stages: readonly Stage[];
  /** The stage shown, from 0; absent while the whole pipeline is shown. Never the last stage. */
  readonly shown?: number;
  /** While the text is shown: what it holds, and the message while it is marked as invalid. */
  readonly text?: { readonly value: string; readonly invalid?: string };
  /** The stage the last run stopped on, from 0, with its message (`aggregate.stage-marks`). */
  readonly error?: { readonly stage: number; readonly message: string };
}

/** A pipeline with no stages, shown as stages. */
export const emptyEditor: PipelineEditor = { stages: [] };

/** The stages that may write: the last enabled stage only (`aggregate.build`). */
export const writeStageNames: readonly string[] = ['$out', '$merge'];

/** The Atlas Search stages, which the server takes only as the first enabled stage. */
export const firstStageNames: readonly string[] = ['$search', '$searchMeta', '$vectorSearch'];

/** The name of a stage as it is sent: trimmed. */
export function stageName(stage: Stage): string {
  return stage.name.trim();
}

/** The index, from 0, of the last stage the pipeline is sent up to: the stage shown, or the last stage. */
export function upToIndex(editor: PipelineEditor): number {
  return editor.shown ?? editor.stages.length - 1;
}

/** The editor with its stage shown kept only when it is a stage before the last, as the rules of the cards say. */
export function normalized(editor: PipelineEditor): PipelineEditor {
  const { shown, ...rest } = editor;
  return shown !== undefined && shown >= 0 && shown < editor.stages.length - 1 ? { ...rest, shown } : rest;
}

/** What becomes of the mark of error when the stages change: it stays on its stage, or it goes. */
export type ErrorMark = 'keep-error' | 'clear-error';

/** The editor with other stages, and the stage shown given (`undefined` shows the whole pipeline). */
export function withStages(
  editor: PipelineEditor,
  stages: readonly Stage[],
  shown: number | undefined,
  mark: ErrorMark = 'keep-error',
): PipelineEditor {
  const { shown: _shown, error, ...rest } = editor;
  const kept = mark === 'keep-error' && error !== undefined && error.stage < stages.length ? { error } : {};
  return normalized(shown === undefined ? { ...rest, ...kept, stages } : { ...rest, ...kept, stages, shown });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStage(value: unknown): Stage | undefined {
  if (!isRecord(value) || typeof value['name'] !== 'string' || typeof value['body'] !== 'string') {
    return undefined;
  }
  return { name: value['name'], body: value['body'], enabled: value['enabled'] !== false };
}

function readText(value: unknown): PipelineEditor['text'] {
  if (!isRecord(value) || typeof value['value'] !== 'string') {
    return undefined;
  }
  const invalid = value['invalid'];
  return typeof invalid === 'string' ? { value: value['value'], invalid } : { value: value['value'] };
}

function readError(value: unknown): PipelineEditor['error'] {
  return isRecord(value) && typeof value['stage'] === 'number' && typeof value['message'] === 'string'
    ? { stage: value['stage'], message: value['message'] }
    : undefined;
}

/** A pipeline editor read back from JSON (the arguments of a feature, the memory of a tab); `undefined` if not one. */
export function readEditor(value: unknown): PipelineEditor | undefined {
  if (!isRecord(value) || !Array.isArray(value['stages'])) {
    return undefined;
  }
  const stages = (value['stages'] as readonly unknown[]).map(readStage);
  if (stages.some((stage) => stage === undefined)) {
    return undefined;
  }
  const text = readText(value['text']);
  const error = readError(value['error']);
  const shown = value['shown'];
  return normalized({
    stages: stages as Stage[],
    ...(typeof shown === 'number' && Number.isInteger(shown) ? { shown } : {}),
    ...(text === undefined ? {} : { text }),
    ...(error === undefined ? {} : { error }),
  });
}

/** The editor as JSON, for the arguments of a step and for the memory of a tab. */
export function editorJson(editor: PipelineEditor): Json {
  return JSON.parse(JSON.stringify(editor)) as Json;
}

/** Where a pipeline is: the collection or view of a tab, on a saved connection. */
export interface PipelinePlace {
  readonly connection: ConnectionId;
  readonly connectionName: string;
  readonly readOnly: boolean;
  readonly database: string;
  readonly collection: string;
  /** Whether the tab is of a view. */
  readonly view: boolean;
  readonly tab?: TabId;
}

/** The arguments a feature was started with, as an object; empty when there are none. */
export function startArgs(answers: Answers): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return isRecord(args) ? args : {};
}

function tabOf(context: Context, answers: Answers): Tab | undefined {
  const named = startArgs(answers)['tab'];
  const id = typeof named === 'string' ? tabId(named) : context.state.tabs.active;
  return context.state.tabs.tabs.find((tab) => tab.id === id);
}

/** The collection of the pipeline: the collection tab named by `args.tab` or active, else the target. */
export function placeOf(context: Context, answers: Answers): PipelinePlace | undefined {
  const tab = tabOf(context, answers);
  const shows = tab?.shows.kind === 'collection' ? tab.shows : undefined;
  const target = context.target.kind === 'collection' ? context.target : undefined;
  const where = shows ?? target;
  if (where === undefined) {
    return undefined;
  }
  const saved = context.state.connections.saved.find((each) => each.id === where.connection);
  return {
    connection: where.connection,
    connectionName: saved?.name ?? where.connection,
    readOnly: saved?.readOnly ?? false,
    database: where.database,
    collection: where.collection,
    view: shows?.view === true,
    ...(shows === undefined || tab === undefined ? {} : { tab: tab.id }),
  };
}

/**
 * The pipeline as a tab keeps it (`TabMemory.pipeline`): the JSON of the editor read back, so that the window and the
 * main process write the same text for the same pipeline, as `tab.restore` saves it.
 */
export function keptPipeline(editor: PipelineEditor): string {
  return JSON.stringify(editorJson(readEditor(editorJson(editor)) ?? editor));
}

/** The pipeline a tab kept, read back; `undefined` when nothing usable is kept. */
export function restoredPipeline(kept: string | undefined): PipelineEditor | undefined {
  if (kept === undefined) {
    return undefined;
  }
  try {
    return readEditor(JSON.parse(kept));
  } catch {
    // A memory that is not the JSON of an editor (an older text) is read as no pipeline: the editor shows it empty.
    return undefined;
  }
}

function memoryEditor(tab: Tab | undefined): PipelineEditor | undefined {
  return restoredPipeline(tab?.memory?.pipeline);
}

/** The pipeline a feature works on: `args.pipeline` as the window sent it, or the one kept in the tab's memory. */
export function editorOf(context: Context, answers: Answers): PipelineEditor {
  return readEditor(startArgs(answers)['pipeline']) ?? memoryEditor(tabOf(context, answers)) ?? emptyEditor;
}

/** The target of the collection of a pipeline. */
export function collectionTarget(place: PipelinePlace): Target {
  return { kind: 'collection', connection: place.connection, database: place.database, collection: place.collection };
}

/** Why the Operations of the pipeline cannot be undone from the undo history. */
export const tabOnly = 'It changes the pipeline of the tab, not a deployment, so nothing is recorded.';

/** The app step that sets the pipeline of a tab (the main process keeps it in the tab's memory). */
export function editorStep(stepText: string, place: PipelinePlace, editor: PipelineEditor): AppStep {
  const where = { connection: place.connection, database: place.database, collection: place.collection };
  return {
    kind: 'app',
    text: stepText,
    action: 'aggregate.set-pipeline',
    args: { ...where, ...(place.tab === undefined ? {} : { tab: place.tab }), pipeline: editorJson(editor) },
  };
}

/** A plan of app steps that runs at once and writes nothing to a deployment. */
export function editorPlan(title: string, steps: readonly AppStep[], after: readonly After[] = []): Plan {
  return { title, steps, danger: noDanger, undo: { cannot: tabOnly }, publishes: false, after };
}

/** Runs the pipeline of the editor again from its first page (`aggregate.run`). */
export function runAfter(place: PipelinePlace, editor: PipelineEditor): After {
  const args = { ...(place.tab === undefined ? {} : { tab: place.tab }), pipeline: editorJson(editor), page: 1 };
  return { kind: 'start', feature: featureId('aggregate.run'), target: collectionTarget(place), args };
}

/**
 * What reading mongosh syntax needs in a feature: the time of the context, and new ids made from it with a counter, so
 * that `ObjectId()` in a stage draws no random value.
 */
export function makersOf(context: Context): Makers {
  let counter = 0;
  const seconds = Math.floor(context.now / 1000)
    .toString(16)
    .padStart(8, '0')
    .slice(-8);
  return {
    now: context.now,
    newId: () => {
      counter += 1;
      return `${seconds}0000000000${counter.toString(16).padStart(6, '0')}`;
    },
  };
}

/** The stage a feature was started on, `args.stage`, from 0; `undefined` when none is named or it is not a stage. */
export function stageArg(answers: Answers, editor: PipelineEditor): number | undefined {
  const named = startArgs(answers)['stage'];
  return typeof named === 'number' && Number.isInteger(named) && named >= 0 && named < editor.stages.length
    ? named
    : undefined;
}
