/**
 * Feature: schema.filter-from-value
 *
 * A click on a value, a bar of a histogram or a type in the Schema section adds a condition on that field to the
 * filter of the query bar, and the sample is read again: the value itself (`status: "paid"`), the range of the bar
 * (`age: { $gte: 15, $lt: 20 }`) or the type (`total: { $type: "double" }`), on the path of the field. It writes nothing
 * to a deployment.
 *
 * Started with `{ tab?, filter, size?, path, click }`: the collection tab, the text of the filter as typed, the size of
 * **Sample**, the path of the field (`schema.analyze`), and what was clicked.
 *
 * The merging is the query bar's for a value dropped on it (`query.add-condition`, M9): until that card is built, a
 * stand-in here merges the condition into the parsed filter and writes it in the filter layout of `query.format`.
 */
import type { Json } from '../../shared/engine-request';
import {
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type Plan,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { formattedValue, isTypedValue } from '../aggregate/mongosh/format';
import { collectionTarget, placeOf, startArgs, type PipelinePlace } from '../aggregate/types';
import { readFilter, sampleSize } from './sample';
import { text } from './text';
import { isJsonDocument, type BsonType, type JsonDocument } from './types';

/** The app action that puts a filter in the query bar of a collection tab and makes it blink once. */
export const setFilterAction = 'query.set-filter';

/** What was clicked: a value, a bar of a histogram (its bounds, as values of the type), or a type. */
export type SchemaClick =
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'range'; readonly from: Json; readonly to: Json }
  | { readonly kind: 'type'; readonly type: BsonType };

/** The condition a click adds on its field. */
export function conditionOf(click: SchemaClick): Json {
  switch (click.kind) {
    case 'value':
      return click.value;
    case 'range':
      return { $gte: click.from, $lt: click.to };
    case 'type':
      return { $type: click.type };
  }
}

/** A document of operators only: `{ $gte: 15 }`, not a value of a BSON type such as `{ $date: … }`. */
function isOperators(value: Json | undefined): value is JsonDocument {
  if (!isJsonDocument(value) || isTypedValue(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

/**
 * A condition merged into a filter: operators join the operators the field already has, the new one replacing the
 * same one; a value replaces what the field had. A field already there keeps its place; a new one goes last.
 */
export function mergedCondition(filter: JsonDocument, path: string, condition: Json): JsonDocument {
  const before = filter[path];
  const merged = isOperators(condition) && isOperators(before) ? { ...before, ...condition } : condition;
  return { ...filter, [path]: merged };
}

function emptyPlan(): Plan {
  return {
    title: text.filter.title,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.filter.tabOnly },
    publishes: false,
    after: [],
  };
}

function isClick(value: unknown): value is SchemaClick {
  const kind = typeof value === 'object' && value !== null ? (value as { kind?: unknown }).kind : undefined;
  return kind === 'value' || kind === 'range' || kind === 'type';
}

/** The step that sets the filter, and the read that analyzes what is left. */
function filterPlan(place: PipelinePlace, after: JsonDocument, added: JsonDocument, size: number): Plan {
  const filterText = formattedValue(after, { kind: 'filter' });
  const condition = formattedValue(added, { kind: 'one-line' }).replace(/^\{ /u, '').replace(/ \}$/u, '');
  const where = { connection: place.connection, database: place.database, collection: place.collection };
  const tab = place.tab === undefined ? {} : { tab: place.tab };
  return {
    ...emptyPlan(),
    steps: [
      {
        kind: 'app',
        text: text.filter.step(condition, place.collection),
        action: setFilterAction,
        args: { ...where, ...tab, filter: filterText, filterJson: after },
      },
    ],
    after: [
      {
        kind: 'start',
        feature: featureId('schema.sample'),
        target: collectionTarget(place),
        args: { ...tab, filter: filterText, size },
      },
    ],
  };
}

/** Feature: schema.filter-from-value — the plan of a click in the table of the Schema section. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const place = placeOf(context, answers);
  const { path, click } = args;
  if (place === undefined || typeof path !== 'string' || path === '' || !isClick(click)) {
    return run(emptyPlan());
  }
  const read = readFilter(args['filter'], context);
  if (!read.ok) {
    return refuse('schema.filter-from-value/invalid-filter', text.refusals.fixFilter(read.message));
  }
  const condition = conditionOf(click);
  const after = mergedCondition(read.filter, path, condition);
  return run(filterPlan(place, after, { [path]: condition }, sampleSize(args['size'])));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('schema.filter-from-value'), plan };
