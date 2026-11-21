/**
 * The Operations and the Reads of the Server area, as the runner starts them. Derivations and the views of the
 * sections are not listed; `server.show` and `server.slow-log` are, for the tree and Go to, which open the page.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as killClient from './kill-client';
import * as largestKeys from './largest-keys';
import * as readClients from './read-clients';
import * as readConfig from './read-config';
import * as readInfo from './read-info';
import * as readMemory from './read-memory';
import * as readSlowLog from './read-slow-log';
import { clientIdRead, feature as show } from './show';
import * as slowLogReset from './slow-log-reset';
import { feature as slowLog } from './slow-log';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  clientIdRead,
  slowLog,
  { kind: 'read', id: featureId('server.read-info'), request: readInfo.request, parse: readInfo.parse },
  { kind: 'read', id: featureId('server.read-clients'), request: readClients.request, parse: readClients.parse },
  { kind: 'operation', id: featureId('server.kill-client'), plan: killClient.plan },
  { kind: 'read', id: featureId('server.read-slow-log'), request: readSlowLog.request, parse: readSlowLog.parse },
  { kind: 'operation', id: featureId('server.slow-log-reset'), plan: slowLogReset.plan },
  { kind: 'read', id: featureId('server.read-memory'), request: readMemory.request, parse: readMemory.parse },
  { kind: 'read', id: featureId('server.largest-keys'), request: largestKeys.request, parse: largestKeys.parse },
  { kind: 'read', id: featureId('server.read-config'), request: readConfig.request, parse: readConfig.parse },
];
