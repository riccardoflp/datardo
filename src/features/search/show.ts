/**
 * Feature: search.show
 *
 * The Search documents page: one page tab per MongoDB connection where the user types a text, chooses where to look
 * for it, and gets the documents that contain it, grouped by collection, while the collections are still being read.
 * `view` says what the page shows from its state; `plan` is what the rail, the tree, Go to and the tool `open_search`
 * start: the tab of the page, with the scope of the node it was started on, and the search the tool asks for.
 *
 * The text, the mode, the scope and the options (`SearchInput`) are kept with the tab and restored with it; the
 * results are not.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { appPlan, appStep, startArgs } from '../nav/types';
import { connectionPageShows } from '../palette/sources';
import { planOf } from '../tab/open';
import { databaseOfAddress } from '../tree/list-databases';
import { groupsOf, type GroupView } from './model/groups';
import { inputChoices, inputJson, inputOf } from './model/page';
import { isRunning } from './model/run';
import { emptyText, summaryText } from './model/summary';
import { text, wanted } from './text';
import { firstInput, readLimits, type ReadLimit, type SearchInput, type SearchMode, type SearchRun } from './types';

/** The page's name in its tab: **Search documents**. */
export const searchPage = 'search';

/** The app action that sets the scope of the open page to a node of the tree, without starting a search. */
export const setScopeAction = 'search.set-scope';

/** The app action that fills the page and starts its search (the tool `open_search`). */
export const startAction = 'search.start';

/** The app action that starts a search of a tab with what the page shows, stopping the one that runs. */
export const runAction = 'search.run';

/** The app action that stops the search of a tab: **Stop**, `Esc`. */
export const stopAction = 'search.stop';

/** A collection or a view of the database chosen in **In**, as the tree island last read it. */
export interface ListedName {
  readonly name: string;
  readonly view: boolean;
}

/** What the page is drawn from. */
export interface SearchPageState {
  readonly connection: ConnectionId;
  readonly input: SearchInput;
  /** The databases of the connection, as the tree island last read them. */
  readonly databases: readonly string[];
  /** The collections and views of the database of **In**, as the tree island last read them. */
  readonly collections: readonly ListedName[];
  readonly readOnly: boolean;
  /** The last search, or the one that runs. */
  readonly run?: SearchRun;
  /** Why the last **Search** could not start: a blank text, a regular expression that is not valid. */
  readonly error?: string;
  /** The groups folded, by `database.collection`. */
  readonly folded: readonly string[];
  readonly selected?: { readonly key: string; readonly idText: string };
}

/** A choice of a list. */
export interface Choice<Value> {
  readonly value: Value;
  readonly label: string;
}

/** What the page shows, from the top. */
export interface SearchPageView {
  readonly searchRow: {
    readonly text: { readonly value: string; readonly placeholder: string; readonly focused: boolean };
    readonly mode: {
      readonly value: SearchMode;
      readonly tooltip: string;
      readonly choices: readonly Choice<SearchMode>[];
    };
    /** **Search**, which is **Stop** while a search runs. */
    readonly button: { readonly label: string; readonly stops: boolean };
  };
  readonly scopeRow: {
    /** **In**: `''` is **Every database**. */
    readonly in: { readonly label: string; readonly value: string; readonly choices: readonly Choice<string>[] };
    /** **Collections**, when a database is chosen: `''` is **All collections**. */
    readonly collections?: {
      readonly label: string;
      readonly choices: readonly (Choice<string> & { readonly ticked: boolean; readonly view: boolean })[];
    };
  };
  readonly optionsRow: {
    readonly matchCase: { readonly label: string; readonly checked: boolean };
    readonly fieldNames: { readonly label: string; readonly tooltip: string; readonly checked: boolean };
    readonly views: {
      readonly label: string;
      readonly tooltip: string;
      readonly checked: boolean;
      readonly enabled: boolean;
    };
    readonly read: {
      readonly label: string;
      readonly after: string;
      readonly value: ReadLimit;
      readonly choices: readonly Choice<ReadLimit>[];
    };
    readonly summary?: string;
  };
  readonly error?: string;
  readonly empty?: string;
  readonly groups: readonly GroupView[];
  readonly readOnly: boolean;
}

function scopeRow(state: SearchPageState): SearchPageView['scopeRow'] {
  const { database, collections } = state.input;
  const databases = [
    { value: '', label: text.scope.everyDatabase },
    ...state.databases.map((name) => ({ value: name, label: name })),
  ];
  const inList = { label: text.scope.in, value: database ?? '', choices: databases };
  if (database === undefined) {
    return { in: inList };
  }
  const all = { value: '', label: text.scope.allCollections, ticked: collections.length === 0, view: false };
  const each = state.collections.map((listed) => ({
    value: listed.name,
    label: listed.name,
    ticked: collections.includes(listed.name),
    view: listed.view,
  }));
  return { in: inList, collections: { label: text.scope.collections, choices: [all, ...each] } };
}

function optionsRow(state: SearchPageState): SearchPageView['optionsRow'] {
  const { input, run: last } = state;
  return {
    matchCase: { label: text.options.matchCase, checked: input.matchCase },
    fieldNames: { label: text.options.fieldNames, tooltip: text.options.fieldNamesTooltip, checked: input.fieldNames },
    views: {
      label: text.options.views,
      tooltip: text.options.viewsTooltip,
      checked: input.views,
      // A ticked view is always read: **Views** says nothing while collections are ticked.
      enabled: input.database === undefined || input.collections.length === 0,
    },
    read: {
      label: text.options.read,
      after: text.options.perCollection,
      value: input.read,
      choices: readLimits.map((limit) => ({ value: limit, label: text.options.limits[limit] })),
    },
    ...(last === undefined ? {} : { summary: summaryText(last) }),
  };
}

/** Feature: search.show — what the page shows. */
export function view(state: SearchPageState): SearchPageView {
  const { input, run: last } = state;
  const running = last !== undefined && isRunning(last);
  const failed = state.error ?? last?.error;
  const empty = last === undefined ? undefined : emptyText(last);
  return {
    searchRow: {
      text: { value: input.text, placeholder: text.placeholder[input.mode], focused: last === undefined },
      mode: {
        value: input.mode,
        tooltip: text.mode.tooltip,
        choices: [
          { value: 'contains', label: text.mode.contains },
          { value: 'regex', label: text.mode.regex },
        ],
      },
      button: { label: running ? text.stop : text.search, stops: running },
    },
    scopeRow: scopeRow(state),
    optionsRow: optionsRow(state),
    ...(failed === undefined ? {} : { error: failed }),
    ...(empty === undefined ? {} : { empty }),
    groups: last === undefined ? [] : groupsOf(state, last),
    readOnly: state.readOnly,
  };
}

/** What `Enter` and **Search** start with: the search, or the message of the error line, and nothing read. */
export function searchStart(
  input: SearchInput,
): { readonly kind: 'start' } | { readonly kind: 'error'; readonly message: string } {
  const looking = wanted(input.text, input.mode, input.matchCase);
  return looking.kind === 'error' ? looking : { kind: 'start' };
}

/** The work in progress on the status line: *Searching “mario” in Local*. */
export function progressText(input: SearchInput, connectionName: string): string {
  return text.progress(input.text.trim(), connectionName);
}

function connectionOf(context: Context, args: Readonly<Record<string, unknown>>): ConnectionId | undefined {
  const named = args['connection'];
  const id =
    typeof named === 'string' ? connectionId(named) : (targetConnection(context.target) ?? context.state.nav.current);
  return id !== undefined && savedConnection(context.state.connections, id)?.engine === 'mongodb' ? id : undefined;
}

/** The scope of the node the page was started on: a database, or a collection or view with only it ticked. */
function nodeScope(
  context: Context,
  args: Readonly<Record<string, unknown>>,
): { database: string; collections: string[] } | undefined {
  const { target } = context;
  const database =
    typeof args['database'] === 'string' ? args['database'] : 'database' in target ? target.database : undefined;
  if (typeof database !== 'string') {
    return undefined;
  }
  const collection =
    typeof args['collection'] === 'string'
      ? args['collection']
      : target.kind === 'collection'
        ? target.collection
        : undefined;
  return { database, collections: collection === undefined ? [] : [collection] };
}

function searchOf(value: unknown): SearchInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const fields = value as Readonly<Record<string, unknown>>;
  if (typeof fields['text'] !== 'string') {
    return undefined;
  }
  const read = readLimits.find((limit) => limit === fields['read']) ?? 0;
  const database = typeof fields['database'] === 'string' ? fields['database'] : undefined;
  const collections = Array.isArray(fields['collections'])
    ? fields['collections'].filter((name) => typeof name === 'string')
    : [];
  return {
    ...firstInput,
    text: fields['text'],
    mode: fields['regex'] === true || fields['mode'] === 'regex' ? 'regex' : 'contains',
    ...(database === undefined ? {} : { database, collections }),
    matchCase: fields['matchCase'] === true,
    fieldNames: fields['fieldNames'] === true,
    views: fields['views'] === true,
    read,
  };
}

/**
 * Feature: search.show — the tab of the page of the connection (one per connection); started on a database, a
 * collection or a view, the page's scope is set to it without starting a search; started with `{ search }` by the
 * tool `open_search`, the page is filled and the search starts, unless the text cannot be searched.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = connectionOf(context, args);
  if (connection === undefined) {
    return run({ ...appPlan(text.title, []), undo: { cannot: text.show.nothingWritten } });
  }
  const page = pagePlan(context, connection, args);
  if (page !== undefined) {
    return page;
  }
  const search = searchOf(args['search']);
  const looking = search === undefined ? undefined : wanted(search.text, search.mode, search.matchCase);
  if (looking?.kind === 'error') {
    return refuse('search.show/text', looking.message);
  }
  const opened = planOf(context.state, { shows: connectionPageShows(connection, searchPage), background: false });
  if (opened.kind !== 'run') {
    return opened;
  }
  const scope = nodeScope(context, args);
  const steps = [
    ...opened.plan.steps,
    ...(scope === undefined || search !== undefined
      ? []
      : [appStep(text.show.scopeStep(scopeName(scope)), setScopeAction, { connection, ...scope })]),
    ...(search === undefined
      ? []
      : [appStep(text.show.startStep(search.text.trim()), startAction, startArgsOf(connection, search))]),
  ];
  return run({ ...opened.plan, steps });
}

/**
 * What the page itself starts: `{ tab, run }`, a search with what it shows (`Enter`, **Search**); `{ tab, stop }`,
 * **Stop** and `Esc`; `{ choices }`, the input kept with the tab once it settles.
 */
function pagePlan(
  context: Context,
  connection: ConnectionId,
  args: Readonly<Record<string, unknown>>,
): Outcome | undefined {
  const tab = typeof args['tab'] === 'string' ? args['tab'] : undefined;
  const nothing = { undo: { cannot: text.show.nothingWritten } };
  if (tab !== undefined && args['run'] !== undefined) {
    const input = inputOf(args['run']);
    const step = appStep(text.show.startStep(input.text.trim()), runAction, {
      tab,
      connection,
      input: inputJson(input),
      fallback: fallbackOf(context, connection),
    });
    return run({ ...appPlan(text.title, [step]), ...nothing });
  }
  if (tab !== undefined && args['stop'] === true) {
    return run({ ...appPlan(text.title, [appStep(text.show.stopStep, stopAction, { tab })]), ...nothing });
  }
  const choices = args['choices'];
  if (typeof choices === 'object' && choices !== null) {
    const kept = inputChoices(inputOf(choices));
    return planOf(context.state, {
      shows: connectionPageShows(connection, searchPage),
      background: false,
      memory: { choices: kept },
    });
  }
  return undefined;
}

/** The database searched alone when the user may not list the databases: the one the connection string names. */
function fallbackOf(context: Context, connection: ConnectionId): string {
  const address = savedConnection(context.state.connections, connection)?.address ?? '';
  return databaseOfAddress(address) ?? 'test';
}

function scopeName(scope: { readonly database: string; readonly collections: readonly string[] }): string {
  const [only] = scope.collections;
  return only === undefined ? scope.database : `${scope.database}.${only}`;
}

function startArgsOf(connection: ConnectionId, search: SearchInput): Json {
  return JSON.parse(JSON.stringify({ connection, input: search })) as Json;
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('search.show'), plan };
