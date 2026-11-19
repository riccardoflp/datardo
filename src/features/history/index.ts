/**
 * The Operations and the Reads of the document history area, as the runner starts them. Derivations and views are not
 * listed. The writes of a document are read one window of the oplog at a time: what drives the windows is in the main
 * process (`history.read-writes`).
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as copyVersion from './copy-version';
import * as oplogWindow from './oplog-window';
import * as readWrites from './read-writes';
import * as show from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('history.show'), plan: show.plan },
  { kind: 'read', id: featureId('history.oplog-window'), request: oplogWindow.request, parse: oplogWindow.parse },
  { kind: 'read', id: featureId('history.read-writes'), request: readWrites.request, parse: readWrites.parse },
  { kind: 'operation', id: featureId('history.copy-version'), plan: copyVersion.plan },
];
