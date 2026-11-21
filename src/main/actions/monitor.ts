/**
 * The actions of the Monitor page the runner carries out for its app steps: `monitor.open-query`, the step of
 * `monitor.open-slow-query` (which **Open** and **Explain** of the Index advisor start too), which opens the
 * collection tab of a slow operation, or makes it active, with its query in the query bar or its stages in the
 * pipeline editor, on the Documents section or on the Explain section; the window then runs it, as for a saved query
 * (`saved-query.run`).
 */
import { explainSection } from '../../features/explain/show';
import { openedQueryText } from '../../features/monitor/open-slow-query';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import { connectionId } from '../../shared/ids';
import type { Tab } from '../../shared/state/tabs';
import type { MainServices } from '../services';
import { openTab } from './tab';
import type { AreaActions } from '.';

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

/** `monitor.open-query` `{ connection, database, collection, filter?, sort?, projection?, pipeline?, explain }`. */
function openQuery(services: MainServices): AppAction {
  return (args) => {
    const where = {
      connection: connectionId(textField(args, 'connection')),
      database: textField(args, 'database'),
      collection: textField(args, 'collection'),
    };
    const section = fields(args)['explain'] === true ? explainSection : 'documents';
    const shows = (tab: Tab): boolean =>
      tab.shows.kind === 'collection' &&
      tab.shows.connection === where.connection &&
      tab.shows.database === where.database &&
      tab.shows.collection === where.collection;
    openTab(services, { shows: { kind: 'collection', ...where }, section }, { background: false, visiting: 'visit' });
    const tabs = services.state.get().tabs;
    const tab = tabs.tabs.find((each) => each.id === tabs.active && shows(each)) ?? tabs.tabs.find(shows);
    if (tab === undefined) {
      throw new Error(`The tab of ${where.database}.${where.collection} could not be opened.`);
    }
    services.state.dispatch({ slice: 'saved-query', type: 'loaded', tab: tab.id, query: openedQueryText(args) });
    return Promise.resolve();
  };
}

/** The actions of the Monitor page. */
export const actions: AreaActions = (services) => ({
  'monitor.open-query': openQuery(services),
});
