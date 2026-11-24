/**
 * What the search area does in the main process (`search.show`, `search.scan`): one search at a time per Search
 * documents tab, carried out by `search-run`, followed in the app's state for the page and on the status line as work
 * in progress (*Searching “mario” in Local*, with **Cancel**). A new search of the tab stops the one that runs; closing
 * the tab or disconnecting its connection stops it too. The news of a search that is no longer the tab's current one
 * is dropped.
 */
import { headOf, inputJson, inputOf, scanJson } from '../features/search/model/page';
import { progressText, searchPage } from '../features/search/show';
import type { SearchRun } from '../features/search/types';
import { runtimeOf } from '../runner/runtime';
import type { RunnerPorts } from '../runner/ports';
import type { Json } from '../shared/engine-request';
import { connectionId, featureId, tabId, type ConnectionId, type TabId } from '../shared/ids';
import { whenRunnerReady } from './bridge';
import { runSearch } from './search-run';
import type { MainServices } from './services';

/** The search of a tab that runs now. */
interface Running {
  readonly id: number;
  readonly connection: ConnectionId;
  readonly stop: AbortController;
}

const running = new Map<TabId, Running>();
let nextSearch = 1;

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

/** Tells the page the news of a search, when it is still the tab's current one. */
function changed(
  services: MainServices,
  search: { readonly tab: TabId; readonly id: number },
  run: SearchRun,
  scans: readonly number[] | 'all',
) {
  const { tab, id } = search;
  if (running.get(tab)?.id !== id) {
    return;
  }
  if (scans === 'all') {
    services.state.dispatch({ slice: 'search', type: 'run', tab, run: headOf(run), scans: run.scans.map(scanJson) });
    return;
  }
  for (const index of scans) {
    const scan = run.scans[index];
    if (scan !== undefined) {
      services.state.dispatch({ slice: 'search', type: 'scan', tab, index, scan: scanJson(scan) });
    }
  }
  services.state.dispatch({ slice: 'search', type: 'run', tab, run: headOf(run) });
}

/** Stops the search of a tab, when one runs. */
export function stopSearch(tab: TabId): void {
  running.get(tab)?.stop.abort();
}

/** `search.run` `{ tab, connection, input, fallback }`: a search of the tab with that input, the one running stopped. */
async function startSearch(services: MainServices, args: Json): Promise<void> {
  const tab = tabId(textField(args, 'tab'));
  const connection = connectionId(textField(args, 'connection'));
  const input = inputOf(fields(args)['input']);
  const fallback = fields(args)['fallback'];
  stopSearch(tab);
  const id = nextSearch++;
  const stop = new AbortController();
  running.set(tab, { id, connection, stop });
  const ports = await whenRunnerReady();
  const name = ports.connectionName(connection);
  const work = runtimeOf(ports).work.begin({
    feature: featureId('search.scan'),
    title: progressText(input, name),
    connection,
    signal: stop.signal,
  });
  // What the connection excludes from searches as the search starts: a change while it runs does not reach it.
  const exclusions = services.state.get().connections.saved.find((each) => each.id === connection)?.exclusions ?? [];
  const asked = { id, connection, input, fallback: typeof fallback === 'string' ? fallback : 'test', exclusions };
  void carriedOut(services, ports, { tab, asked, signal: work.signal }).finally(() => {
    work.end();
    if (running.get(tab)?.id === id) {
      running.delete(tab);
    }
  });
}

interface Carried {
  readonly tab: TabId;
  readonly asked: Parameters<typeof runSearch>[1];
  readonly signal: AbortSignal;
}

async function carriedOut(services: MainServices, ports: RunnerPorts, carried: Carried): Promise<void> {
  const { tab, asked } = carried;
  await runSearch(
    {
      send: (request, signal) => ports.engines.send(request, signal),
      now: () => Date.now(),
      changed: (run, scans) => {
        changed(services, { tab, id: asked.id }, run, scans);
      },
    },
    asked,
    carried.signal,
  );
}

/** The Search documents tab of a connection, when one is open. */
function searchTabOf(services: MainServices, connection: ConnectionId): TabId | undefined {
  return services.state
    .get()
    .tabs.tabs.find(
      (tab) => tab.shows.kind === 'page' && tab.shows.page === searchPage && tab.shows.connection === connection,
    )?.id;
}

/** Asks the page of a connection something: a scope, or an input to search with. */
function ask(services: MainServices, args: Json, asked: Json): Promise<void> {
  const tab = searchTabOf(services, connectionId(textField(args, 'connection')));
  if (tab !== undefined) {
    services.state.dispatch({ slice: 'search', type: 'asked', tab, ask: asked });
  }
  return Promise.resolve();
}

/** The actions of the search area, by name. */
export function searchActions(services: MainServices): Readonly<Record<string, (args: Json) => Promise<unknown>>> {
  return {
    'search.run': (args) => startSearch(services, args),
    'search.stop': (args) => {
      stopSearch(tabId(textField(args, 'tab')));
      return Promise.resolve();
    },
    'search.set-scope': (args) => {
      const scope = { database: textField(args, 'database'), collections: fields(args)['collections'] ?? [] };
      return ask(services, args, { scope });
    },
    'search.start': (args) => ask(services, args, { input: inputJson(inputOf(fields(args)['input'])) }),
  };
}

/** Stops the search of a tab that closes, and those of a connection that is disconnected or removed. */
export function start(services: MainServices): Promise<void> {
  services.state.listen((event) => {
    if (event.slice === 'tabs' && event.type === 'closed') {
      stopSearch(event.tab);
      services.state.dispatch({ slice: 'search', type: 'forgotten', tab: event.tab });
      return;
    }
    const gone =
      (event.slice === 'connections' &&
        event.type === 'state' &&
        (event.state === 'not-connected' || event.state === 'failed')) ||
      (event.slice === 'connections' && event.type === 'removed');
    if (gone) {
      for (const [tab, search] of running) {
        if (search.connection === event.connection) {
          stopSearch(tab);
        }
      }
    }
  });
  return Promise.resolve();
}
