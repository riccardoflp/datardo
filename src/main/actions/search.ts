/**
 * The actions of the search area the runner carries out for its app steps (`search.show`, `search.open-in-collection`):
 * starting and stopping the search of a tab, setting the scope of the page or filling it for the tool `open_search`,
 * and `query.open-filtered`, which opens a collection tab on its Documents section with a filter and runs it. The
 * relation area opens the documents a reference names through the same action (`relation.open-referenced`,
 * `relation.open-referencing`).
 */
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import { connectionId } from '../../shared/ids';
import type { Tab } from '../../shared/state/tabs';
import { searchActions } from '../search';
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

function textOf(args: Json, name: string): string {
  const value = fields(args)[name];
  return typeof value === 'string' ? value : '';
}

/**
 * `query.open-filtered` `{ connection, database, collection, filter, sort, projection }`: the collection tab, opened
 * or made active, with the query put in its bar; the window then shows it and runs it (`query.run`), as for a saved
 * query (`saved-query.run`). A tab of the collection already open shows the new filter in place of its own.
 */
function openFiltered(services: MainServices): AppAction {
  return (args) => {
    const where = {
      connection: connectionId(textField(args, 'connection')),
      database: textField(args, 'database'),
      collection: textField(args, 'collection'),
    };
    const shows = (tab: Tab): boolean =>
      tab.shows.kind === 'collection' &&
      tab.shows.connection === where.connection &&
      tab.shows.database === where.database &&
      tab.shows.collection === where.collection;
    openTab(services, { shows: { kind: 'collection', ...where } }, { background: false, visiting: 'visit' });
    const tabs = services.state.get().tabs;
    const tab = tabs.tabs.find((each) => each.id === tabs.active && shows(each)) ?? tabs.tabs.find(shows);
    if (tab === undefined) {
      throw new Error(`The tab of ${where.database}.${where.collection} could not be opened.`);
    }
    const query = {
      kind: 'find',
      filter: textOf(args, 'filter'),
      sort: textOf(args, 'sort'),
      projection: textOf(args, 'projection'),
    };
    services.state.dispatch({ slice: 'saved-query', type: 'loaded', tab: tab.id, query });
    return Promise.resolve();
  };
}

/** The actions of the search area, and `query.open-filtered`. */
export const actions: AreaActions = (services) => ({
  ...searchActions(services),
  'query.open-filtered': openFiltered(services),
});
