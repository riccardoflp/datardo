/**
 * The playground area in the main process (playground.md): the host of the runs, the playgrounds of the tabs kept in
 * the app's state, and the connection and the database remembered for each playground file, in
 * `state/<connection id>.json` (data.md). A playground tab restored, or reopened, without its playground loads it:
 * from its draft, else from its file, which a tab whose file is gone closes with *The file <path> doesn't exist.*
 * Closing a tab forgets its playground; one that runs keeps it until the run ends. Quitting stops a run.
 */
import { open, readFile, rm, stat } from 'node:fs/promises';
import { featureId, tabId, type ConnectionId, type TabId } from '../shared/ids';
import type { Tab } from '../shared/state/tabs';
import type { ResultLayout } from '../shared/state/playgrounds';
import { connectionDatabase, exampleScript } from '../features/playground/open';
import { decodedText, type FileText } from '../features/playground/open-file';
import { text } from '../features/playground/text';
import { notify } from '../runner/notify';
import { playgroundTargetIn, withPlaygroundTarget } from '../storage/connection-state';
import { PlaygroundHost } from './playground/host';
import { utilityLauncher } from './playground/launcher';
import type { MainServices } from './services';
import { connectionStateStore } from './table';

let host: PlaygroundHost | undefined;

/** The tabs whose playground is being loaded. */
const loading = new Set<TabId>();

/** The host of the runs, started with the area. */
export function playgroundHost(): PlaygroundHost {
  host ??= new PlaygroundHost(utilityLauncher());
  return host;
}

/**
 * Whether a file can be written (`playground.save:writable`): null, or the system's reason. A file that exists is
 * opened to append, which changes nothing; one that does not is made, then removed, so that the folder is tried.
 */
export async function writableProblem(path: string): Promise<string | null> {
  const exists = await stat(path).then(
    () => true,
    () => false,
  );
  try {
    const handle = await open(path, exists ? 'a' : 'wx');
    await handle.close();
    if (!exists) {
      await rm(path, { force: true });
    }
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Reads a file as a playground's text: refused over `largest` bytes, or when it is not UTF-8. */
export async function readPlaygroundFile(path: string, largest: number): Promise<FileText> {
  try {
    const found = await stat(path);
    if (found.size > largest) {
      return { kind: 'too-large' };
    }
    const decoded = decodedText(await readFile(path));
    return decoded === undefined ? { kind: 'not-text' } : { kind: 'text', text: decoded };
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { kind: 'missing' };
    }
    return { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

/** The connection and the database remembered for a playground file, among the saved connections. */
export async function rememberedTarget(
  services: MainServices,
  path: string,
): Promise<{ readonly connection: ConnectionId; readonly database: string } | undefined> {
  for (const connection of services.state.get().connections.saved) {
    if (connection.engine === 'mongodb') {
      const kept = playgroundTargetIn((await connectionStateStore(services, connection.id)).get(), path);
      if (kept !== undefined) {
        return { connection: connection.id, database: kept.database };
      }
    }
  }
  return undefined;
}

/** Remembers the connection and the database of a playground file, and forgets them on every other connection. */
export async function rememberTarget(
  services: MainServices,
  path: string,
  target: { readonly connection: ConnectionId; readonly database: string },
): Promise<void> {
  for (const connection of services.state.get().connections.saved) {
    if (connection.engine === 'mongodb') {
      const store = await connectionStateStore(services, connection.id);
      const kept = connection.id === target.connection ? { database: target.database } : undefined;
      if (kept !== undefined || playgroundTargetIn(store.get(), path) !== undefined) {
        store.set(withPlaygroundTarget(store.get(), path, kept));
      }
    }
  }
}

/** The layout the results are shown in: the one last chosen in any playground, else the table. */
export function currentLayout(services: MainServices): ResultLayout {
  return Object.values(services.state.get().playgrounds)[0]?.layout ?? 'table';
}

type PlaygroundShows = Extract<Tab['shows'], { kind: 'playground' }>;

function closeGone(services: MainServices, tab: TabId, path: string): void {
  services.state.dispatch({ slice: 'tabs', type: 'closed', tab, at: Date.now() });
  notify(
    { state: services.state, now: () => Date.now() },
    { feature: featureId('playground.open-file'), level: 'warning', text: text.openFile.noFile(path) },
  );
}

/** Loads the playground of a tab that has none: restored at start, or reopened. */
async function load(services: MainServices, tab: Tab & { readonly shows: PlaygroundShows }): Promise<void> {
  const { shows } = tab;
  let saved: string | undefined;
  let database = connectionDatabase;
  if (shows.file !== undefined) {
    const found = await readPlaygroundFile(shows.file, Number.MAX_SAFE_INTEGER);
    if (found.kind !== 'text') {
      closeGone(services, tab.id, shows.file);
      return;
    }
    saved = found.text;
    database = (await rememberedTarget(services, shows.file))?.database ?? connectionDatabase;
  }
  // Loaded meanwhile (an action opened it), or closed: nothing to do.
  const now = services.state.get();
  if (now.playgrounds[tab.id] !== undefined || !now.tabs.tabs.some((each) => each.id === tab.id)) {
    return;
  }
  const draft = tab.draft?.text;
  const savedText = saved ?? (draft === undefined ? exampleScript({ kind: 'connection' }) : '');
  services.state.dispatch({
    slice: 'playgrounds',
    type: 'opened',
    playground: {
      tab: tab.id,
      defaultDatabase: database,
      text: draft ?? savedText,
      savedText,
      layout: currentLayout(services),
    },
  });
}

function isPlaygroundTab(tab: Tab): tab is Tab & { readonly shows: PlaygroundShows } {
  return tab.shows.kind === 'playground';
}

/** Keeps the playgrounds with the tabs: loads those missing, forgets those of the tabs closed. */
function follow(services: MainServices): void {
  const state = services.state.get();
  const open = new Set(state.tabs.tabs.map((tab) => tab.id));
  for (const key of Object.keys(state.playgrounds)) {
    const playground = state.playgrounds[key];
    if (!open.has(tabId(key)) && playground?.closed !== true) {
      services.state.dispatch({ slice: 'playgrounds', type: 'closed', tab: tabId(key) });
    }
  }
  for (const tab of state.tabs.tabs) {
    if (isPlaygroundTab(tab) && state.playgrounds[tab.id] === undefined && !loading.has(tab.id)) {
      loading.add(tab.id);
      void load(services, tab)
        .finally(() => loading.delete(tab.id))
        .catch((error: unknown) => {
          // A playground that could not be loaded leaves its tab empty; the Log says why.
          services.state.dispatch({
            slice: 'runner',
            type: 'logged',
            lines: [{ time: Date.now(), source: 'Playground', kind: 'error', text: `[Playground] ${String(error)}` }],
          });
        });
    }
  }
}

/** Starts the area: the playgrounds follow the tabs, and a quit stops the run in progress. */
export function start(services: MainServices): Promise<void> {
  follow(services);
  services.state.listen((event) => {
    if (event.slice === 'tabs') {
      follow(services);
    }
  });
  services.onQuit(() => playgroundHost().stop());
  return Promise.resolve();
}
