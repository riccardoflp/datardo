/**
 * The Operations and the Reads of the Monitor page, as the runner starts them. Derivations and the views of the
 * sections are not listed; `monitor.show` is, for the tree, Go to and the MCP server, which open the page. These are
 * the features of the Operations and Slow queries sections (M30); the Reads and Operations of the Stats, Replication
 * and Sharding sections join them in the milestone that builds those sections (M31).
 */
import type { ReadFeature, RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { feature as clearProfiler } from './clear-profiler';
import { feature as createSuggestedIndex } from './create-suggested-index';
import { feature as killOperation } from './kill-operation';
import { feature as openSlowQuery } from './open-slow-query';
import * as readDatabaseStats from './read-database-stats';
import * as readOperations from './read-operations';
import * as readSlowQueries from './read-slow-queries';
import { feature as setLogThreshold } from './set-log-threshold';
import { feature as setProfiler } from './set-profiler';
import { feature as show } from './show';

function read(id: string, module: Pick<ReadFeature, 'request' | 'parse'>): ReadFeature {
  return { kind: 'read', id: featureId(id), request: module.request, parse: module.parse };
}

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  read('monitor.read-operations', readOperations),
  killOperation,
  read('monitor.read-slow-queries', readSlowQueries),
  setProfiler,
  setLogThreshold,
  clearProfiler,
  createSuggestedIndex,
  openSlowQuery,
  // The databases of the **Database** lists, read once when the page opens (`monitor.show`, "Reads"): the step
  // `list` of the statistics of the databases, `listDatabases` with `nameOnly`.
  read('monitor.read-database-stats', readDatabaseStats),
];
