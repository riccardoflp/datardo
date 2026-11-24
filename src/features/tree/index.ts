/**
 * The Reads and Operations of the tree area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as count from './count';
import * as listCollections from './list-collections';
import * as listDatabases from './list-databases';
import * as redisDatabases from './redis-databases';
import * as refresh from './refresh';
import * as scanNamespaces from './scan-namespaces';
import * as setCollectionColor from './set-collection-color';
import * as setDatabaseColor from './set-database-color';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'read', id: featureId('tree.list-databases'), request: listDatabases.request, parse: listDatabases.parse },
  {
    kind: 'read',
    id: featureId('tree.list-collections'),
    request: listCollections.request,
    parse: listCollections.parse,
  },
  { kind: 'read', id: featureId('tree.count'), request: count.request, parse: count.parse },
  { kind: 'read', id: featureId('tree.redis-databases'), request: redisDatabases.request, parse: redisDatabases.parse },
  { kind: 'read', id: featureId('tree.scan-namespaces'), request: scanNamespaces.request, parse: scanNamespaces.parse },
  { kind: 'read', id: featureId('tree.refresh'), request: refresh.request, parse: refresh.parse },
  setCollectionColor.feature,
  setDatabaseColor.feature,
];
