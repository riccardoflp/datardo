/**
 * What the relation area does in the main process (`relation.read`, "The references kept"): the references of each
 * database, found once with a sample of 100 when the first collection tab of the database shows its documents, and
 * kept until Datardo quits; the samples of the Relationship diagram, which replace them; and what makes them old or
 * forgets them. What is kept is mirrored in the app's state, without the sampled values, for the tabs, the inspector
 * island and the diagram. Each read shows on the status line as work in progress, with **Cancel**.
 */
import { keptAfter, needsReading, type KeptEvent, type KeptReferences } from '../features/relation/kept/references';
import { backgroundSample } from '../features/relation/read';
import { text } from '../features/relation/text';
import type { ReferenceGraph } from '../features/relation/types';
import { setting } from '../features/settings/read';
import { withoutSecrets } from '../features/runner/error';
import { writeLog } from '../runner/log';
import { runtimeOf } from '../runner/runtime';
import type { Intent, IntentResult } from '../shared/bridge';
import type { Json } from '../shared/engine-request';
import { connectionId, featureId, tabId, type ConnectionId, type TabId } from '../shared/ids';
import { followIntents, whenRunnerReady } from './bridge';
import { readReferences } from './relation-read';
import type { MainServices } from './services';

/** What the area needs of the services: the app's state. */
type Holder = Pick<MainServices, 'state'>;

let kept: KeptReferences = [];
/** The reads under way for the tabs, by connection and database: a tab that asks meanwhile waits for the same one. */
const reading = new Map<string, Promise<void>>();
/** The sample of each diagram tab under way, and what stops it. */
const sampling = new Map<TabId, AbortController>();

function placeKey(connection: ConnectionId, database: string): string {
  return `${connection}\u0000${database}`;
}

/** The references as the app's state keeps them: without the sampled values of the fields. */
function strippedGraph(graph: ReferenceGraph): ReferenceGraph {
  return {
    ...graph,
    collections: graph.collections.map((collection) => ({
      ...collection,
      fields: collection.fields.map((field) => ({ ...field, values: [] })),
    })),
  };
}

function change(services: Holder, event: KeptEvent): void {
  const after = keptAfter(kept, event);
  if (after === kept) {
    return;
  }
  kept = after;
  const shown = kept.map((entry) =>
    entry.graph === undefined ? entry : { ...entry, graph: strippedGraph(entry.graph) },
  );
  services.state.dispatch({ slice: 'relation', type: 'kept', kept: JSON.parse(JSON.stringify(shown)) as Json[] });
}

function message(error: unknown): string {
  return withoutSecrets(error instanceof Error ? error.message : String(error));
}

/** The sample of a database, followed on the status line, its progress told to `progress` too. */
async function sampled(
  place: { readonly connection: ConnectionId; readonly database: string; readonly size: number },
  progress: (shown: string) => void,
  stop?: AbortSignal,
): Promise<ReferenceGraph> {
  const ports = await whenRunnerReady();
  const work = runtimeOf(ports).work.begin({
    feature: featureId('relation.read'),
    title: text.follow.finding(place.database),
    connection: place.connection,
    ...(stop === undefined ? {} : { signal: stop }),
  });
  try {
    return await readReferences(
      {
        send: (request, signal) => ports.engines.send(request, signal),
        progress: (shown) => {
          work.change({ title: shown });
          progress(shown);
        },
      },
      place,
      work.signal,
    );
  } finally {
    work.end();
  }
}

/** Finds the references of a database for its tabs, when they are found by themselves and none are kept or new. */
export function ensureReferences(services: Holder, connection: ConnectionId, database: string): void {
  const detect = setting(services.state.get().settings, 'datardo.relation.detect');
  const key = placeKey(connection, database);
  if (reading.has(key) || !needsReading(kept, { connection, database }, detect)) {
    return;
  }
  change(services, { kind: 'reading', connection, database });
  const read = sampled({ connection, database, size: backgroundSample }, () => undefined)
    .then((graph) => {
      change(services, { kind: 'found', graph, connection });
    })
    .catch((error: unknown) => {
      // A read that fails keeps nothing, and the old references stay as old: the next collection tab tries again.
      change(services, { kind: 'failed', connection, database });
      void logFailure(message(error));
    })
    .finally(() => reading.delete(key));
  reading.set(key, read);
}

/** Writes in the Log why a read of the references for the tabs failed: nothing else says it. */
async function logFailure(failure: string): Promise<void> {
  const ports = await whenRunnerReady();
  writeLog(ports, [{ feature: featureId('relation.read'), kind: 'error', text: failure }]);
}

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

function textField(args: Json, name: string): string {
  const value = fields(args)[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

/**
 * `relation.sample` `{ tab, connection, database, size }`: the sample of a Relationship diagram, which replaces the
 * references kept for the database once it ends; its progress, and the server's message when it fails, go to the tab.
 */
function sample(services: Holder, args: Json): Promise<void> {
  const tab = tabId(textField(args, 'tab'));
  const connection = connectionId(textField(args, 'connection'));
  const database = textField(args, 'database');
  const size = typeof fields(args)['size'] === 'number' ? (fields(args)['size'] as number) : backgroundSample;
  sampling.get(tab)?.abort();
  const stop = new AbortController();
  sampling.set(tab, stop);
  const tell = (progress?: string, error?: string): void => {
    if (sampling.get(tab) === stop) {
      services.state.dispatch({
        slice: 'relation',
        type: 'diagram-read',
        tab,
        ...(progress === undefined ? {} : { progress }),
        ...(error === undefined ? {} : { error }),
      });
    }
  };
  tell(text.diagram.loading);
  void sampled(
    { connection, database, size },
    (shown) => {
      tell(shown);
    },
    stop.signal,
  )
    .then((graph) => {
      change(services, { kind: 'found', graph, connection });
      tell();
    })
    .catch((error: unknown) => {
      tell(undefined, stop.signal.aborted ? undefined : message(error));
    })
    .finally(() => {
      if (sampling.get(tab) === stop) {
        sampling.delete(tab);
      }
    });
  return Promise.resolve();
}

/** The Relationship diagram tab of a database, when one is open. */
function diagramTabOf(services: Holder, connection: ConnectionId, database: string): TabId | undefined {
  return services.state
    .get()
    .tabs.tabs.find(
      (tab) =>
        tab.shows.kind === 'page' &&
        tab.shows.page === 'diagram' &&
        tab.shows.connection === connection &&
        tab.shows.database === database,
    )?.id;
}

/** `relation.select-box` `{ connection, database, collection }`: the box selected and brought into view. */
function selectBox(services: Holder, args: Json): Promise<void> {
  const tab = diagramTabOf(services, connectionId(textField(args, 'connection')), textField(args, 'database'));
  if (tab !== undefined) {
    services.state.dispatch({ slice: 'relation', type: 'select', tab, collection: textField(args, 'collection') });
  }
  return Promise.resolve();
}

/**
 * `relation.detect` `{ connection, database, sample }`: the references of a database sampled again, kept, and given
 * to the MCP tool `describe_relations` as its collections and its relations.
 */
async function detect(services: Holder, args: Json): Promise<Json> {
  const connection = connectionId(textField(args, 'connection'));
  const database = textField(args, 'database');
  const size = fields(args)['sample'];
  const graph = await sampled(
    { connection, database, size: typeof size === 'number' ? size : backgroundSample },
    () => undefined,
  );
  change(services, { kind: 'found', graph, connection });
  return detectReply(graph);
}

/** What `relation.detect` gives the MCP tool `describe_relations`: the collections and the relations of a graph. */
export function detectReply(graph: ReferenceGraph): Json {
  return {
    collections: graph.collections.map((collection) => collection.name),
    relations: graph.relations.map((relation) => ({
      kind: relation.kind,
      from: relation.from,
      to: relation.to,
      ...(relation.kind === 'view'
        ? {}
        : {
            field: relation.field,
            toField: relation.toField,
            many: relation.several,
            matched: relation.found,
            tested: relation.lookedUp,
          }),
    })),
  };
}

/** The actions of the relation area that keep or read the references, by name. */
export function relationActions(services: Holder): Readonly<Record<string, (args: Json) => Promise<unknown>>> {
  return {
    'relation.sample': (args) => sample(services, args),
    'relation.select-box': (args) => selectBox(services, args),
    'relation.detect': (args) => detect(services, args),
  };
}

function argument(intent: Intent, name: string): unknown {
  const args = intent.args;
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, unknown>>)[name]
    : undefined;
}

/** The database of a feature's target or arguments. */
function databaseOf(intent: Intent): { connection: ConnectionId; database: string } | undefined {
  const target = intent.target;
  if (target.kind === 'collection' || target.kind === 'database') {
    return { connection: target.connection, database: target.database };
  }
  const connection = argument(intent, 'connection');
  const database = argument(intent, 'database');
  return typeof connection === 'string' && typeof database === 'string'
    ? { connection: connectionId(connection), database }
    : undefined;
}

/** The features after which the references of their database are forgotten (the cards of the manage area). */
const forgetting: ReadonlySet<string> = new Set([
  'manage.rename-collection',
  'manage.drop-collection',
  'manage.drop-database',
]);

/**
 * What the window started that changes the references kept: the documents of a collection tab shown (`query.run`)
 * find them, **Refresh** of the tree island makes them old, and renaming or dropping forgets them.
 */
export function followIntent(services: Holder, intent: Intent, result: IntentResult): void {
  const place = databaseOf(intent);
  if (intent.feature === 'query.run' && result.kind === 'read' && place !== undefined) {
    const tab = services.state.get().tabs.tabs.find((each) => each.id === argument(intent, 'tab'));
    if (tab?.shows.kind === 'collection') {
      ensureReferences(services, tab.shows.connection, tab.shows.database);
    }
    return;
  }
  if (intent.feature === 'tree.refresh') {
    const connection = argument(intent, 'connection');
    const named = typeof connection === 'string' ? connectionId(connection) : services.state.get().nav.current;
    const database = argument(intent, 'database');
    if (named !== undefined) {
      change(services, { kind: 'refreshed', connection: named, ...(typeof database === 'string' ? { database } : {}) });
    }
    return;
  }
  if (forgetting.has(intent.feature) && result.kind === 'done' && place !== undefined) {
    change(services, { kind: 'database-forgotten', ...place });
  }
}

/** Forgets the references of a connection that is disconnected or removed; stops the sample of a diagram that closes. */
export function start(services: MainServices): Promise<void> {
  followIntents((intent, result) => {
    followIntent(services, intent, result);
  });
  services.state.listen((event) => {
    if (event.slice === 'connections' && event.type === 'removed') {
      change(services, { kind: 'forgotten', connection: event.connection });
    }
    if (
      event.slice === 'connections' &&
      event.type === 'state' &&
      (event.state === 'not-connected' || event.state === 'failed')
    ) {
      change(services, { kind: 'forgotten', connection: event.connection });
    }
    if (event.slice === 'tabs' && event.type === 'closed' && services.state.get().relation.diagrams[event.tab]) {
      sampling.get(event.tab)?.abort();
      services.state.dispatch({ slice: 'relation', type: 'diagram-closed', tab: event.tab });
    }
  });
  return Promise.resolve();
}
