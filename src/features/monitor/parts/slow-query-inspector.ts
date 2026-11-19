/**
 * What the inspector island shows for a selected row of the Slow queries section (`monitor.slow-queries`): why an
 * index could help and which one, **Create index…**, **Open in collection** and **Explain**, **Copy query**, **Show
 * operations** and the example line of a group, the query and the whole record.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import { examinedPerReturned, type SlowQueryGroup } from '../group-slow-queries';
import { canOpen } from '../open-slow-query';
import { indexKeyDocument, indexKeyText, type QueryParts, type SlowQuery } from '../types';
import { slowText } from './slow-text';
import type { SectionControl } from './tiles';
import { countText, dateTimeText } from './units';
import { examinedRatio } from './slow-query-rows';

/** What the controls of the inspector island are given. */
export interface InspectorInput {
  readonly connection: string;
  /** *The connection Production is read-only.* when it is: **Create index…** is disabled. */
  readonly readOnly?: string;
  /** The namespaces that are views: their suggestion cannot be created. */
  readonly views: readonly string[];
  /** The arguments of the read of the slow operations, sent again once the index is created. */
  readonly reread: Json;
}

/** What the inspector island shows. */
export interface SlowQueryInspector {
  /** Why an index could help, and which one: empty when the group has no suggestion. */
  readonly why: readonly string[];
  readonly createIndex?: SectionControl;
  readonly open?: SectionControl;
  readonly explain?: SectionControl;
  /** **Copy query**, and the text it copies. */
  readonly copyQuery: { readonly label: string; readonly text: string };
  /** **Show operations**, for a group: the filter it puts under **All**. */
  readonly showOperations?: { readonly label: string; readonly filter: string };
  /** The example line of a group. */
  readonly example?: string;
  /** The query's parts in mongosh syntax. */
  readonly query: string;
  readonly record: { readonly title: string; readonly value: Json };
}

/** The query's parts in mongosh syntax, as **Copy query** copies them: the pipeline of an `aggregate`. */
export function copiedQuery(kind: string, query: QueryParts): string {
  if (kind === 'aggregate') {
    return formattedValue(query.pipeline ?? [], 'pretty');
  }
  const parts = Object.fromEntries(
    (['filter', 'sort', 'projection', 'update'] as const).flatMap((name) => {
      const value = query[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return formattedValue(parts, 'pretty');
}

/** Why the group could use an index: a collection scan, a sort in memory, many documents examined. */
export function whyLines(group: SlowQueryGroup): readonly string[] {
  if (group.suggestion === undefined) {
    return [];
  }
  const ratio = examinedRatio(group.docsExamined, group.returned);
  return [
    ...(group.collectionScan ? [slowText.why.collectionScan] : []),
    ...(group.inMemorySort ? [slowText.why.inMemorySort] : []),
    ...(ratio >= examinedPerReturned ? [slowText.why.examined(countText(ratio))] : []),
    slowText.why.index(indexKeyText(group.suggestion)),
  ];
}

function createIndexControl(group: SlowQueryGroup, input: InspectorInput): SectionControl | undefined {
  if (group.suggestion === undefined) {
    return undefined;
  }
  return {
    label: slowText.createIndex,
    element: 'monitor.create-suggested-index@inspector',
    feature: 'monitor.create-suggested-index',
    args: {
      connection: input.connection,
      namespace: group.namespace,
      keys: indexKeyDocument(group.suggestion),
      view: input.views.includes(group.namespace),
      reread: input.reread,
    },
    ...(input.readOnly === undefined ? {} : { disabledBecause: input.readOnly }),
  };
}

function openControl(operation: SlowQuery, input: InspectorInput, explain: boolean): SectionControl {
  return {
    label: explain ? slowText.explain : slowText.openInCollection,
    element: 'monitor.open-slow-query@inspector',
    feature: 'monitor.open-slow-query',
    args: {
      connection: input.connection,
      namespace: operation.namespace,
      kind: operation.kind,
      query: operation.query as Json,
      explain,
    },
  };
}

/** The example line of a group: *example: the slowest, 1,840 ms at 17/11/2026, 14:02:11 · 3 getMore batches · …* */
export function exampleLine(group: SlowQueryGroup): string {
  const example = group.example;
  return slowText.example(
    countText(Math.round(example.millis)),
    dateTimeText(example.time),
    group.getMores === 0 ? '' : ` · ${slowText.getMores(group.getMores)}`,
    group.applications.length === 0 ? '' : slowText.apps(group.applications.join(', ')),
  );
}

/**
 * The inspector island of an operation, with the group it belongs to: the group's suggestion, and for a selected
 * group (`asGroup`) its **Show operations** and example line.
 */
export function inspectorOf(
  operation: SlowQuery,
  group: SlowQueryGroup | undefined,
  asGroup: boolean,
  input: InspectorInput,
): SlowQueryInspector {
  const opens = canOpen(operation.kind, operation.namespace);
  const createIndex = group === undefined ? undefined : createIndexControl(group, input);
  const query = copiedQuery(operation.kind, operation.query);
  return {
    why: group === undefined ? [] : whyLines(group),
    ...(createIndex === undefined ? {} : { createIndex }),
    ...(opens ? { open: openControl(operation, input, false), explain: openControl(operation, input, true) } : {}),
    copyQuery: { label: slowText.copyQuery, text: query },
    ...(asGroup && group !== undefined
      ? {
          showOperations: { label: slowText.showOperations, filter: group.shape },
          example: exampleLine(group),
        }
      : {}),
    query,
    record: {
      title: operation.source === 'profiler' ? slowText.profilerDocument : slowText.logEntry,
      value: operation.record,
    },
  };
}
