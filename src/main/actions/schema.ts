/**
 * The actions of the schema area: the read of a sample (`schema.sample`, the app action `schema.read-sample`), made in
 * `src/main/schema.ts` through the connections' clients with its analysis on a worker thread; and `query.set-filter`,
 * the app step of `schema.filter-from-value` that puts a filter in the query bar of a tab.
 */
import type { AreaActions } from '.';
import { workerFile } from '../../runner/workers/analysis';
import { connectionEngines } from '../connections';
import { readSample, setFilter } from '../schema';

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => {
  const worker = workerFile(import.meta.dirname);
  const analysis = worker === undefined ? {} : { worker };
  return {
    'schema.read-sample': (args, signal) =>
      readSample({ engines: connectionEngines, state: services.state, analysis, now: () => Date.now() }, args, signal),
    'query.set-filter': (args) => setFilter(services.state, args),
  };
};
