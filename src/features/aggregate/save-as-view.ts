/**
 * Feature: aggregate.save-as-view
 *
 * Creates a view on the collection (or on the view) of the tab whose definition is the pipeline up to the stage shown,
 * without its disabled stages: `db.createView("paid_orders", "orders", [ … ])`. It asks the name in **Save pipeline as
 * view**, checked as a collection name is (`manage.name-rules`) and against the names of the database, read with
 * `palette.find-collections`. A pipeline that writes cannot be a view.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type EngineStep,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { stepText } from '../runner/step-text';
import { builtPipeline } from './build';
import { stagesOfEditor } from './edit-as-text';
import { text } from './text';
import { collectionTarget, editorOf, editorPlan, makersOf, placeOf, upToIndex, type PipelinePlace } from './types';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The names of the collections and views of a database, from what `palette.find-collections` read. */
export function takenNames(names: unknown, database: string): readonly string[] {
  const list = isRecord(names) && Array.isArray(names['names']) ? (names['names'] as readonly unknown[]) : [];
  return list.filter(isRecord).flatMap((each) => {
    if (each['database'] !== database || typeof each['name'] !== 'string') {
      return [];
    }
    return each['kind'] === 'bucket' ? [`${each['name']}.files`, `${each['name']}.chunks`] : [each['name']];
  });
}

/** The question of the name: **Save pipeline as view**, with the rules of a collection name. */
export function nameQuestion(place: PipelinePlace, stages: number, taken: readonly string[]): Question {
  return {
    title: text.saveAsView.title,
    button: text.saveAsView.button,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.saveAsView.field(place.collection, stages),
        rules: [
          { kind: 'not-empty', message: text.errors.nameEmpty },
          { kind: 'pattern', pattern: '^[^$\\u0000]*$', message: text.errors.nameDollar },
          { kind: 'pattern', pattern: '^(?!\\s*system\\.)', message: text.errors.nameSystem },
          { kind: 'pattern', pattern: '^\\s*[^.\\s](.*[^.\\s])?\\s*$', message: text.errors.nameDot },
          { kind: 'not-one-of', values: taken, message: text.errors.nameTaken },
        ],
      },
    ],
  };
}

/** `db.createView("<name>", "<collection>", [ … ])`. */
export function createViewRequest(place: PipelinePlace, name: string, pipeline: readonly Json[]): MongoRequest {
  return {
    engine: 'mongodb',
    database: place.database,
    method: 'createView',
    arguments: [name, place.collection, pipeline],
  };
}

function viewPlan(place: PipelinePlace, name: string, pipeline: readonly Json[]): Outcome {
  const request = createViewRequest(place, name, pipeline);
  const target = collectionTarget(place);
  const step: EngineStep = {
    kind: 'engine',
    text: stepText({ kind: 'engine', connection: place.connection, request, writes: true }, target),
    connection: place.connection,
    request,
    writes: true,
  };
  const shows = {
    kind: 'collection',
    connection: place.connection,
    database: place.database,
    collection: name,
    view: true,
  };
  const open = { label: text.results.openView, feature: featureId('tab.open'), target, args: { shows } };
  const after: After[] = [
    { kind: 'refresh', connection: place.connection },
    { kind: 'notify', level: 'success', text: text.results.createdView(`${place.database}.${name}`), actions: [open] },
  ];
  return run({
    title: text.saveAsView.plan,
    steps: [step],
    danger: noDanger,
    undo: { cannot: text.saveAsView.cannotUndo },
    publishes: false,
    after,
  });
}

/** Asks the name of the view, then creates it. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    return run(editorPlan(text.saveAsView.plan, []));
  }
  if (place.readOnly) {
    return refuse('aggregate.save-as-view/read-only', text.errors.readOnly(place.connectionName));
  }
  const editor = editorOf(context, answers);
  const read = stagesOfEditor(editor, makersOf(context));
  if (!read.ok) {
    return refuse('aggregate.save-as-view/invalid-text', read.message);
  }
  const upTo = editor.text === undefined ? upToIndex(editor) : read.stages.length - 1;
  const built = builtPipeline(read.stages, upTo, makersOf(context));
  if (!built.ok) {
    return refuse('aggregate.save-as-view/invalid-stage', built.message);
  }
  if (built.writes !== undefined) {
    return refuse('aggregate.save-as-view/writes', text.errors.viewWrites(built.writes.name));
  }
  if (!('names' in answers)) {
    return needRead('names', 'palette.find-collections', { connection: place.connection, databases: [place.database] });
  }
  const name = answers['name'];
  if (typeof name !== 'string') {
    return ask(nameQuestion(place, built.pipeline.length, takenNames(answers['names'], place.database)));
  }
  return viewPlan(place, name.trim(), built.pipeline);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('aggregate.save-as-view'), plan };
