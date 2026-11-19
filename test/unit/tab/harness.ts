/**
 * What the tests of the tab area start from: the app's state in the main process's holder, the saved connections
 * Local (MongoDB) and Cache local (Redis), and the plans of the area carried out by the area's own app actions, as the
 * runner would. Steps of other areas (a recent place of Go to) are recorded and not carried out.
 */
import type { ConnectionView } from '../../../src/shared/connection';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, OperationFeature, Outcome } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Tab, TabShows } from '../../../src/shared/state/tabs';
import { AppStateHolder } from '../../../src/main/app-state';
import { actions } from '../../../src/main/actions/tab';
import type { MainServices } from '../../../src/main/services';
import { titledTabs } from '../../../src/features/tab/title';
import { feature as openFeature } from '../../../src/features/tab/open';

/** A saved connection. */
export function saved(
  id: string,
  name: string,
  engine: 'mongodb' | 'redis',
  more: Partial<ConnectionView> = {},
): ConnectionView {
  return {
    id: connectionId(id),
    name,
    engine,
    hosts: engine === 'mongodb' ? 'localhost:27017' : 'localhost:6379',
    readOnly: false,
    keepsUndo: true,
    secrets: noSecretsSaved,
    ...more,
  };
}

export const local = saved('local', 'Local', 'mongodb', { color: 'blue' });
export const cacheLocal = saved('cache-local', 'Cache local', 'redis', { color: 'green' });
export const staging = saved('staging', 'Staging', 'mongodb');

/** A page of the app. */
export function appPage(page: string): TabShows {
  return { kind: 'app', page };
}

/** A collection on a connection. */
export function collection(name: string, database = 'shop', connection: ConnectionId = local.id): TabShows {
  return { kind: 'collection', connection, database, collection: name };
}

/** The keys of a Redis database. */
export function keys(database = 0, connection: ConnectionId = cacheLocal.id): TabShows {
  return { kind: 'keys', connection, database, separator: ':' };
}

/** A document of `shop.orders` on Local. */
export function document(id: string, idJson?: string): TabShows {
  return {
    kind: 'document',
    connection: local.id,
    database: 'shop',
    collection: 'orders',
    id,
    ...(idJson === undefined ? {} : { idJson }),
  };
}

export const home = appPage('home');
export const orders = collection('orders');
export const users = collection('users');

/** A context on a state, for a feature. */
export function contextOf(state: AppState, feature: string): Context {
  return {
    feature: featureId(feature),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state,
  };
}

/** The state, the tab actions, and how to start the area's features on them. */
export interface Harness {
  readonly holder: AppStateHolder;
  readonly services: MainServices;
  readonly state: () => AppState;
  /** Plans with the feature and carries out its app steps; returns what the feature returned. */
  readonly start: (feature: OperationFeature, args?: Json, answers?: Answers) => Promise<Outcome>;
  /** Opens a tab, as `tab.open` does. */
  readonly open: (shows: TabShows, background?: boolean) => Promise<Outcome>;
  /** The open tab of a title. */
  readonly tab: (title: string) => Tab;
  /** The titles of the open tabs, in the order of the strip. */
  readonly titles: () => readonly string[];
  /** The title of the active tab. */
  readonly active: () => string | undefined;
  /** The steps of other areas that were not carried out. */
  readonly skipped: string[];
}

/** A holder with the connections saved, and nothing open. */
export function harness(connections: readonly ConnectionView[] = [local, cacheLocal], dataFolder = ''): Harness {
  const holder = new AppStateHolder();
  holder.dispatch({ slice: 'connections', type: 'loaded', saved: connections, keychain: true, readOnlyFile: false });
  const services: MainServices = {
    state: holder,
    dataFolder,
    window: () => undefined,
    onQuit: () => undefined,
    dialogs: { ask: () => Promise.resolve(undefined), confirm: () => Promise.resolve(false) },
    platform: 'windows',
  };
  const area = actions(services);
  const skipped: string[] = [];
  const titleMap = (): ReadonlyMap<string, string> => titledTabs(holder.get().tabs.tabs);
  const start = async (feature: OperationFeature, args: Json = null, answers: Answers = {}): Promise<Outcome> => {
    const outcome = feature.plan(contextOf(holder.get(), feature.id), { args, ...answers });
    if (outcome.kind === 'run') {
      for (const step of outcome.plan.steps) {
        const action = step.kind === 'app' ? area[step.action] : undefined;
        if (step.kind === 'app' && action !== undefined) {
          await action(step.args, new AbortController().signal);
        } else {
          skipped.push(step.text);
        }
      }
    }
    return outcome;
  };
  const tab = (title: string): Tab => {
    const found = holder.get().tabs.tabs.find((each) => titleMap().get(each.id) === title);
    if (found === undefined) {
      throw new Error(`No tab is titled ${title}.`);
    }
    return found;
  };
  return {
    holder,
    services,
    state: () => holder.get(),
    start,
    open: (shows, background = false) => start(openFeature, JSON.parse(JSON.stringify({ shows, background })) as Json),
    tab,
    titles: () => holder.get().tabs.tabs.map((each) => titleMap().get(each.id) ?? ''),
    active: () => {
      const id = holder.get().tabs.active;
      return id === undefined ? undefined : titleMap().get(id);
    },
    skipped,
  };
}

/** The four tabs of the cards: Home, `orders` and `users` of Local, the keys of Cache local, with `users` active. */
export async function fourTabs(): Promise<Harness> {
  const h = harness();
  await h.open(home);
  await h.open(orders);
  await h.open(users);
  await h.open(keys());
  await h.open(users);
  return h;
}
