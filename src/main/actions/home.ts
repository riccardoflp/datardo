/**
 * The actions of Home the runner carries out: what the page remembers across starts, the engine chosen in its filter
 * (`home.filter`) and the folders collapsed (`home.connections`), kept in `home.json`.
 */
import type { Json } from '../../shared/engine-request';
import type { MainServices } from '../services';
import type { AreaActions } from '.';

function field(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

function chooseEngine(services: MainServices, args: Json): Promise<void> {
  const engine = field(args, 'engine');
  if (engine !== 'all' && engine !== 'mongodb' && engine !== 'redis') {
    throw new Error('The action needs an engine: all, mongodb or redis.');
  }
  services.state.dispatch({ slice: 'palette', type: 'home-changed', home: { engine } });
  return Promise.resolve();
}

function collapseFolder(services: MainServices, args: Json): Promise<void> {
  const folder = field(args, 'folder');
  if (typeof folder !== 'string') {
    throw new Error('The action needs the name of a folder.');
  }
  const others = services.state.get().palette.home.collapsed.filter((each) => each !== folder);
  const collapsed = field(args, 'collapsed') === true ? [...others, folder].sort() : others;
  services.state.dispatch({ slice: 'palette', type: 'home-changed', home: { collapsed } });
  return Promise.resolve();
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'home.choose-engine': (args) => chooseEngine(services, args),
  'home.collapse-folder': (args) => collapseFolder(services, args),
});
