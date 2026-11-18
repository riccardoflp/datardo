/**
 * What the tests of Go to and Home start from: the tab area's harness (the connections Local, Cache local and Staging,
 * the tabs opened by the tab area's own actions), with the actions of Go to and Home carried out too, connections made
 * connected and current, and the knowledge the window would have (the names of collections, the commands offered).
 */
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, OperationFeature, Outcome } from '../../../src/shared/feature';
import type { ConnectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { commands as registeredCommands } from '../../../src/features/commands';
import { offeredCommands } from '../../../src/features/palette/run-command';
import type { CollectionName, PaletteKnowledge } from '../../../src/features/palette/types';
import { actions as homeActions } from '../../../src/main/actions/home';
import { actions as paletteActions } from '../../../src/main/actions/palette';
import { actions as tabActions } from '../../../src/main/actions/tab';
import { cacheLocal, contextOf, harness as tabHarness, local, saved, type Harness } from '../tab/harness';

export { cacheLocal, collection, home, keys, local, orders, saved, users } from '../tab/harness';

export const staging = saved('staging', 'Staging', 'mongodb', { folder: 'Dev', hosts: 'staging.example.com:27017' });

/** The tab area's harness, whose `start` also carries out the steps of Go to and Home. */
export interface PaletteHarness extends Harness {
  /** Makes a connection connected, as `connection.state` would. */
  readonly connect: (connection: ConnectionId) => void;
  /** Makes a connection the current one. */
  readonly makeCurrent: (connection: ConnectionId) => void;
}

/** A harness with Local, Cache local and Staging saved, nothing open, nothing connected. */
export function harness(connections: readonly ConnectionView[] = [local, cacheLocal, staging]): PaletteHarness {
  const h = tabHarness(connections);
  const area = { ...tabActions(h.services), ...paletteActions(h.services), ...homeActions(h.services) };
  const start = async (feature: OperationFeature, args: Json = null, answers: Answers = {}): Promise<Outcome> => {
    const outcome = feature.plan(contextOf(h.state(), feature.id), { args, ...answers });
    if (outcome.kind === 'run') {
      for (const step of outcome.plan.steps) {
        const action = step.kind === 'app' ? area[step.action] : undefined;
        if (step.kind === 'app' && action !== undefined) {
          await action(step.args, new AbortController().signal);
        } else {
          h.skipped.push(step.text);
        }
      }
    }
    return outcome;
  };
  return {
    ...h,
    start,
    connect: (connection) => {
      h.holder.dispatch({ slice: 'connections', type: 'state', connection, state: 'connected' });
    },
    makeCurrent: (connection) => {
      h.holder.dispatch({ slice: 'nav', type: 'changed', nav: { current: connection } });
    },
  };
}

/** A collection name read by `palette.find-collections`. */
export function named(database: string, name: string, kind: CollectionName['kind'] = 'collection'): CollectionName {
  return { database, name, kind };
}

/** What the window knows: the names read for some connections, and the commands offered in this state. */
export function knowledgeOf(
  state: AppState,
  collections: Readonly<Record<string, readonly CollectionName[]>> = {},
): PaletteKnowledge {
  return {
    collections: Object.fromEntries(
      Object.entries(collections).map(([id, names]) => [id, { names, more: false, at: 0 }]),
    ),
    commands: offeredCommands(registeredCommands, state, state.app.platform).map((entry) => ({
      id: entry.id,
      title: entry.title,
      ...(entry.shownKey === undefined ? {} : { key: entry.shownKey }),
    })),
  };
}
