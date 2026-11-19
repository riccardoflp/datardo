/**
 * Feature: monitor.open-slow-query
 *
 * Puts the filter, sort and projection of a slow operation, or its pipeline, in the collection tab, and runs it; with
 * **Explain**, on the Explain section. Started with `{ connection, namespace, kind, query, explain }`, the example of
 * a group or an operation of the Slow queries section. One app step, `monitor.open-query`, which the main process
 * carries out: `{ connection, database, collection, filter?, sort?, projection?, pipeline?, explain }`, opening the
 * tab (`tab.open`) when none is open. It writes nothing: an `update` or a `delete` opens as the filter that chose its
 * documents. Ported from Mongoster's `src/monitor.ts › openOperation`, `src/shared/profile.ts › canOpen`.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appStep } from '../nav/types';
import { formattedValue } from '../query/format';
import { isRecord, listOf, recordOf } from './parts/ejson';
import { splitNamespace } from './parts/requests';
import { text } from './text';
import { isOn, requiredConnection, startArgs, textArg, type QueryParts } from './types';

/** The kinds of operation that open in their collection. */
const openingKinds = new Set(['find', 'aggregate', 'count', 'distinct', 'findAndModify', 'update', 'delete']);

/** Whether an operation opens in its collection: a query on a collection whose name does not start with `$cmd`. */
export function canOpen(kind: string, namespace: string): boolean {
  const { collection } = splitNamespace(namespace);
  return openingKinds.has(kind) && collection !== '' && !collection.startsWith('$cmd');
}

/** The query parts of the arguments. */
function queryOfArgs(value: unknown): QueryParts {
  const fields = recordOf(value);
  const part = (name: string): object => (isRecord(fields[name]) ? { [name]: fields[name] } : {});
  return {
    ...part('filter'),
    ...part('sort'),
    ...part('projection'),
    ...(Array.isArray(fields['pipeline']) ? { pipeline: listOf(fields['pipeline']) } : {}),
  };
}

/** What is put in the query bar: the projection only for a `find`, the sort for a `find` and a `findAndModify`. */
export function openedQuery(kind: string, query: QueryParts): QueryParts {
  if (kind === 'aggregate') {
    return { pipeline: query.pipeline ?? [] };
  }
  const withSort = kind === 'find' || kind === 'findAndModify';
  return {
    filter: query.filter ?? {},
    ...(withSort && query.sort !== undefined ? { sort: query.sort } : {}),
    ...(kind === 'find' && query.projection !== undefined ? { projection: query.projection } : {}),
  };
}

/** Feature: monitor.open-slow-query — the one app step; refused for an operation that does not open. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  const namespace = textArg(args, 'namespace') ?? '';
  const kind = textArg(args, 'kind') ?? '';
  if (!canOpen(kind, namespace)) {
    return refuse('monitor.open-slow-query/unsupported', text.slow.open.cannotOpen);
  }
  const { database, collection } = splitNamespace(namespace);
  const opened = openedQuery(kind, queryOfArgs(args['query']));
  const stepText =
    opened.pipeline === undefined
      ? text.slow.open.filter(namespace, formattedValue(opened.filter ?? {}, 'one-line'))
      : text.slow.open.pipeline(namespace);
  const stepArgs = {
    connection: connection.id,
    database,
    collection,
    ...(opened as Readonly<Record<string, Json>>),
    explain: isOn(args, 'explain'),
  };
  return run({
    title: text.slow.open.title(namespace),
    steps: [appStep(stepText, 'monitor.open-query', stepArgs)],
    danger: { kind: 'none' },
    undo: { cannot: text.slow.open.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.open-slow-query'), plan };
