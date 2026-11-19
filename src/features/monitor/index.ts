/**
 * The Operations and the Reads of the Monitor page, as the runner starts them. Derivations and the views of the
 * sections are not listed; `monitor.show` is, for the tree, Go to and the MCP server, which open the page.
 */
import type { ReadFeature, RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { feature as clearProfiler } from './clear-profiler';
import { feature as createSuggestedIndex } from './create-suggested-index';
import { feature as killOperation } from './kill-operation';
import { feature as openSlowQuery } from './open-slow-query';
import * as readCollectionStats from './read-collection-stats';
import * as readDatabaseStats from './read-database-stats';
import * as readOperations from './read-operations';
import * as readOplog from './read-oplog';
import * as readReplication from './read-replication';
import * as readServerStatus from './read-server-status';
import * as readShardingEvents from './read-sharding-events';
import * as readSharding from './read-sharding';
import * as readSlowQueries from './read-slow-queries';
import { feature as setBalancer } from './set-balancer';
import { feature as setCollectionBalancing } from './set-collection-balancing';
import { feature as setLogThreshold } from './set-log-threshold';
import { feature as setProfiler } from './set-profiler';
import { feature as show } from './show';
import { feature as stepDown } from './step-down';

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
  read('monitor.read-server-status', readServerStatus),
  read('monitor.read-database-stats', readDatabaseStats),
  read('monitor.read-collection-stats', readCollectionStats),
  read('monitor.read-replication', readReplication),
  read('monitor.read-oplog', readOplog),
  stepDown,
  read('monitor.read-sharding', readSharding),
  read('monitor.read-sharding-events', readShardingEvents),
  setBalancer,
  setCollectionBalancing,
];
