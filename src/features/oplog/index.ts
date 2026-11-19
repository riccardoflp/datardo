/**
 * The Operations and the Read of publishing for redis-oplog, as the runner starts them. Derivations and views are not
 * listed. The read of the documents by `_id` (`oplog.read-documents`) has no card of its own: it is on the **Reads**
 * line of `oplog.publish`.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as playgroundWrites from './playground-writes';
import * as publish from './publish';
import * as documents from './reads/documents';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('oplog.publish'), plan: publish.plan },
  { kind: 'operation', id: featureId('oplog.playground-writes'), plan: playgroundWrites.plan },
  { kind: 'read', id: featureId('oplog.read-documents'), request: documents.request, parse: documents.parse },
];
