/**
 * Feature: advisor.show
 *
 * The Index advisor page: for a scope (a connection, a database or a collection), the indexes to create, the
 * redundant ones and the unused ones, with what they were computed from, and the buttons that act on an advice.
 * `view` says what the page shows from its state; `plan` is what the tree and Go to start: the tab of the scope, one
 * per scope; `parts/reading.ts` says which reads follow each other. Nothing is read on a timer. Ported from
 * Mongoster's `src/webview/advisor.ts`.
 */
import type { Answers, Context, OperationFeature, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { appPlan } from '../nav/types';
import { clockText } from '../monitor/parts/units';
import { planOf } from '../tab/open';
import { advice } from './analyze';
import { createItem, redundantItem, unusedItem, type CreateItem, type IndexItem } from './parts/advice-items';
import type { AnalysisRead } from './parts/reading';
import { sourcesView, summaryText, type SourcesView } from './parts/sources';
import type { ScopeIndexes } from './read-indexes';
import type { ScopeSlowOperations } from './read-slow-operations';
import { text } from './text';
import {
  advisorConnection,
  scopeOf,
  startArgs,
  type AdvisorConnection,
  type CreateAdvice,
  type RedundantAdvice,
  type Scope,
  type UnusedAdvice,
} from './types';

/** The page's name in its path. */
export const advisorPage = 'advisor';

/** What the page is drawn from. */
export interface AdvisorPageState {
  readonly connection: AdvisorConnection;
  readonly scope: Scope;
  /** The time it is drawn at, in milliseconds since 1970. */
  readonly now: number;
  /** Whether the reads run. */
  readonly analyzing: boolean;
  /** When the last analysis was made. */
  readonly analyzedAt?: number;
  /** The last analysis (`parts/reading.ts › analysisOf`); absent the first time, while it is read. */
  readonly read?: AnalysisRead;
  /** The advices whose queries are all shown. */
  readonly expanded: readonly string[];
}

/** One of the three lists, with the number of its advices and what it says when it is empty. */
export interface AdviceList<T> {
  readonly heading: string;
  readonly count: number;
  readonly items: readonly T[];
  readonly empty?: string;
}

/** What the page shows. */
export interface AdvisorPageView {
  readonly title: string;
  readonly toolbar: {
    readonly scope: string;
    readonly analyzedAt?: string;
    readonly refresh: { readonly label: string; readonly tooltip: string; readonly enabled: boolean };
  };
  /** The summary, or *Reading the indexes and the slow operations…* the first time. */
  readonly summary: string;
  readonly sources?: SourcesView;
  /** The server's message, in place of the lists, when the databases or the collections cannot be listed. */
  readonly error?: string;
  readonly lists?: {
    readonly create: AdviceList<CreateItem>;
    readonly redundant: AdviceList<IndexItem>;
    readonly unused: AdviceList<IndexItem> & { readonly note: string };
  };
  /** **Read-only** in the status line. */
  readonly status?: string;
}

/** The scope as the page writes it: *every database*, `shop`, `shop.orders`. */
export function scopeText(scope: Scope): string {
  switch (scope.kind) {
    case 'connection':
      return text.toolbar.everyDatabase;
    case 'database':
      return scope.database;
    case 'collection':
      return `${scope.database}.${scope.collection}`;
  }
}

/** The name of the tab of a scope: `Index advisor`, `Index advisor · shop`, `Index advisor · shop.orders`. */
export function tabTitle(scope: Scope): string {
  return text.tab(scope.kind === 'connection' ? undefined : scopeText(scope));
}

function listOf<T>(heading: string, items: readonly T[], empty: string): AdviceList<T> {
  return { heading, count: items.length, items, ...(items.length === 0 ? { empty } : {}) };
}

function listsOf(state: AdvisorPageState, indexes: ScopeIndexes, slow: ScopeSlowOperations): AdvisorPageView['lists'] {
  const result = advice(indexes.collections, slow.operations, state.now);
  const input = { ...state, connection: state.connection.id, readOnly: state.connection.readOnly };
  const create = result.advices.filter((each): each is CreateAdvice => each.kind === 'create');
  const redundant = result.advices.filter((each): each is RedundantAdvice => each.kind === 'redundant');
  const unused = result.advices.filter(
    (each): each is UnusedAdvice => each.kind === 'unused' || each.kind === 'hidden',
  );
  const unusedNote =
    result.tooRecent === 0 ? text.unused.note : `${text.unused.note} ${text.unused.tooRecent(result.tooRecent)}`;
  return {
    create: listOf(
      text.lists.create,
      create.map((each) => createItem(input, each)),
      slow.operations.length === 0 ? text.empty.noSlowOperations : text.empty.create,
    ),
    redundant: listOf(
      text.lists.redundant,
      redundant.map((each) => redundantItem(input, each)),
      text.empty.redundant,
    ),
    unused: {
      ...listOf(
        text.lists.unused,
        unused.map((each) => unusedItem(input, each)),
        result.tooRecent > 0 ? text.empty.unusedTooRecent : text.empty.unused,
      ),
      note: unusedNote,
    },
  };
}

function analyzedParts(state: AdvisorPageState): Pick<AdvisorPageView, 'summary' | 'sources' | 'error' | 'lists'> {
  const read = state.read;
  if (read === undefined) {
    return { summary: text.summary.loading };
  }
  if (read.kind === 'failed') {
    return { summary: '', error: read.message };
  }
  const lists = listsOf(state, read.indexes, read.slow);
  const suggestions = (lists?.create.count ?? 0) + (lists?.redundant.count ?? 0) + (lists?.unused.count ?? 0);
  const sources = sourcesView(
    { connection: state.connection.id, readOnly: state.connection.readOnly, now: state.now },
    read.indexes,
    read.slow,
  );
  return { summary: summaryText(read.indexes, suggestions), sources, ...(lists === undefined ? {} : { lists }) };
}

/** Feature: advisor.show — what the page shows. */
export function view(state: AdvisorPageState): AdvisorPageView {
  return {
    title: tabTitle(state.scope),
    toolbar: {
      scope: scopeText(state.scope),
      ...(state.analyzedAt === undefined ? {} : { analyzedAt: text.toolbar.analyzedAt(clockText(state.analyzedAt)) }),
      refresh: {
        label: state.analyzing ? text.toolbar.analyzing : text.toolbar.refresh,
        tooltip: text.toolbar.refreshTooltip,
        enabled: !state.analyzing,
      },
    },
    ...analyzedParts(state),
    ...(state.connection.readOnly ? { status: text.readOnlyStatus } : {}),
  };
}

/** Feature: advisor.show — the tree's **Index advisor** and Go to's: the tab of the scope, opened or made active. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = advisorConnection(context, args);
  const saved = connection === undefined ? undefined : savedConnection(context.state.connections, connection.id);
  if (connection === undefined || saved?.engine !== 'mongodb') {
    return run(appPlan(text.openPlan, []));
  }
  const scope = scopeOf(context, args);
  return planOf(context.state, {
    shows: {
      kind: 'page',
      connection: connection.id,
      page: advisorPage,
      title: tabTitle(scope),
      ...(scope.kind === 'connection' ? {} : { database: scope.database }),
      ...(scope.kind === 'collection' ? { of: [scope.collection] } : {}),
    },
    background: false,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('advisor.show'), plan };
