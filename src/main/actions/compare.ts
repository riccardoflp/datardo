/**
 * The actions of the compare and structure areas: the comparison of two collections (`compare.compare`, made in
 * `src/main/compare-reads.ts`, the pairing in a worker thread), the read of two structures (`structure.read-both`, in
 * `src/main/structure-reads.ts`), and what a comparison's tab keeps (`compare.keep`, `structure.keep`): its title and
 * the choices of its page in its memory.
 */
import { join } from 'node:path';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import { onWorker, type PairingStarter } from '../../runner/workers/pairing';
import { jsonFields } from '../../features/connection/types';
import { tabId } from '../../shared/ids';
import { connectionEngines } from '../connections';
import { compareSides } from '../compare-reads';
import type { MainServices } from '../services';
import { readBoth } from '../structure-reads';

/** The worker of the pairing, started for each comparison; built beside the main process (`pairing.js`). */
function pairing(): PairingStarter {
  return onWorker(join(import.meta.dirname, 'pairing.js'));
}

function choicesOf(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/**
 * `compare.keep`, `structure.keep` `{ tab, title, choices }`: the tab of a comparison takes the title of its sides and
 * keeps the choices of its page in its memory; nothing when the tab is gone.
 */
function keep(services: MainServices): AppAction {
  return (args) => {
    const fields = jsonFields(args);
    const id = typeof fields['tab'] === 'string' ? tabId(fields['tab']) : undefined;
    const tab = services.state.get().tabs.tabs.find((each) => each.id === id);
    if (tab === undefined) {
      return Promise.resolve(null);
    }
    const title = fields['title'];
    if (tab.shows.kind === 'page' && typeof title === 'string' && title !== tab.shows.title) {
      services.state.dispatch({ slice: 'tabs', type: 'shows-changed', tab: tab.id, shows: { ...tab.shows, title } });
    }
    const memory = { ...tab.memory, choices: choicesOf(fields['choices']) };
    services.state.dispatch({ slice: 'tabs', type: 'changed', tab: tab.id, memory });
    return Promise.resolve(null);
  };
}

/** The actions of these areas, by name. */
export const actions: AreaActions = (services) => {
  const ports = {
    engines: connectionEngines,
    state: services.state,
    now: () => Date.now(),
    platform: services.platform,
  };
  return {
    'compare.compare': (args, signal, progress) =>
      compareSides({ ...ports, pairing: pairing() }, args, signal, progress),
    'compare.keep': keep(services),
    'structure.read-both': (args, signal, progress) => readBoth(ports, args, signal, progress),
    'structure.keep': keep(services),
  };
};
