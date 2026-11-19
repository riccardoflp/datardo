/**
 * Feature: aggregate.write-output
 *
 * Runs a pipeline whose last enabled stage, up to the stage shown, is `$out` or `$merge`: the server writes its output
 * into a collection instead of returning it. One step, the whole pipeline without paging, given up after 600 seconds.
 *
 * The danger follows D39: `$out` onto a collection that exists replaces it whole, so the plan is destructive and the
 * name of that collection is typed (`reports.archive` when the stage names another database); `$out` to a collection
 * that does not exist yet, and `$merge` in every form, are confirmed with one button. Whether the collection exists is
 * read each time the confirmation opens, with the names of its database (`palette.find-collections`); a view of that
 * name is not a collection, and a read that gives nothing usable takes the collection as existing. The server writes
 * the documents itself, so nothing is recorded for undo and nothing is published for redis-oplog.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type Danger,
  type EngineStep,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { stepText } from '../runner/step-text';
import { builtPipeline, type WriteStage } from './build';
import { stagesOfEditor } from './edit-as-text';
import { formattedValue } from './mongosh/format';
import { aggregateRequest } from './run';
import { text } from './text';
import {
  collectionTarget,
  editorOf,
  editorPlan,
  makersOf,
  placeOf,
  runAfter,
  upToIndex,
  type PipelinePlace,
} from './types';

/** How long the server may write, in milliseconds (`maxTimeMS`). */
export const writeTimeLimitMs = 600_000;

/** The collection a stage that writes names: its database and its name. */
export interface WriteTarget {
  readonly database: string;
  readonly collection: string;
}

function textField(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The collection `$out` or `$merge` writes to: a name, or `{ db, coll }` (`into` for `$merge`). */
export function writeTarget(stage: WriteStage, database: string): WriteTarget | undefined {
  const named =
    stage.name === '$merge' && typeof stage.body === 'object' && stage.body !== null && !Array.isArray(stage.body)
      ? (stage.body as Readonly<Record<string, Json>>)['into']
      : stage.body;
  if (typeof named === 'string') {
    return { database, collection: named };
  }
  if (typeof named !== 'object' || named === null || Array.isArray(named)) {
    return undefined;
  }
  const fields = named as Readonly<Record<string, Json>>;
  const collection = textField(fields['coll']);
  return collection === undefined ? undefined : { database: textField(fields['db']) ?? database, collection };
}

/** The name the user types: the collection, with its database before it when it is not the pipeline's database. */
export function typedName(target: WriteTarget, place: PipelinePlace): string {
  return target.database === place.database ? target.collection : `${target.database}.${target.collection}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether the names read hold the collection: a collection or a bucket's files, not a view. Unknown: it exists. */
export function collectionExists(names: unknown, target: WriteTarget): boolean {
  const list = isRecord(names) && Array.isArray(names['names']) ? (names['names'] as readonly unknown[]) : undefined;
  if (list === undefined) {
    return true;
  }
  return list.filter(isRecord).some((each) => {
    if (each['database'] !== target.database || typeof each['name'] !== 'string') {
      return false;
    }
    if (each['kind'] === 'bucket') {
      return target.collection === `${each['name']}.files` || target.collection === `${each['name']}.chunks`;
    }
    return each['kind'] !== 'view' && each['name'] === target.collection;
  });
}

/** The danger of the plan: destructive for `$out` onto a collection that exists, confirm otherwise. */
export function writeDanger(stage: WriteStage, exists: boolean, name: string): Danger {
  const question = text.writeOutput.question(stage.name, formattedValue(stage.body, { kind: 'one-line' }));
  if (stage.name === '$out' && exists) {
    return {
      kind: 'destructive',
      text: `${question}\n${text.writeOutput.replaces(name)}`,
      button: text.writeOutput.button,
      name,
    };
  }
  return { kind: 'confirm', text: `${question}\n${text.writeOutput.modifies}`, button: text.writeOutput.button };
}

function writePlan(place: PipelinePlace, pipeline: readonly Json[], stage: WriteStage, danger: Danger): Outcome {
  const request = aggregateRequest(place, pipeline, writeTimeLimitMs);
  const step: EngineStep = {
    kind: 'engine',
    text: stepText({ kind: 'engine', connection: place.connection, request, writes: true }, collectionTarget(place)),
    connection: place.connection,
    request,
    writes: true,
  };
  const written = text.results.written(stage.name, formattedValue(stage.body, { kind: 'one-line' }));
  const after: After[] = [
    { kind: 'notify', level: 'success', text: written },
    { kind: 'refresh', connection: place.connection },
  ];
  return run({
    title: text.writeOutput.title,
    steps: [step],
    danger,
    undo: { cannot: text.writeOutput.cannotUndo },
    publishes: false,
    after,
  });
}

/** Runs a pipeline that writes, after its confirmation; a pipeline that does not write is run as a read. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.writeOutput.title, []));
  }
  const editor = editorOf(context, answers);
  const read = stagesOfEditor(editor, makersOf(context));
  if (!read.ok) {
    return refuse('aggregate.write-output/invalid-stage', read.message);
  }
  const upTo = editor.text === undefined ? upToIndex(editor) : read.stages.length - 1;
  const built = builtPipeline(read.stages, upTo, makersOf(context));
  if (!built.ok) {
    return refuse('aggregate.write-output/invalid-stage', built.message);
  }
  const stage = built.writes;
  if (stage === undefined) {
    return run(editorPlan(text.plans.run, [], [runAfter(place, editor)]));
  }
  if (place.readOnly) {
    return refuse('aggregate.write-output/read-only', text.errors.readOnlyWrites(place.connectionName, stage.name));
  }
  const target = writeTarget(stage, place.database) ?? { database: place.database, collection: '' };
  if (stage.name === '$out' && !('names' in answers)) {
    return needRead('names', 'palette.find-collections', {
      connection: place.connection,
      databases: [target.database],
    });
  }
  const exists = stage.name === '$out' && collectionExists(answers['names'], target);
  return writePlan(place, built.pipeline, stage, writeDanger(stage, exists, typedName(target, place)));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.write-output'), plan };
