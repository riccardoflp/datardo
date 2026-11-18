/**
 * The Operations and the Reads of the connection area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as add from './add';
import * as allowChanges from './allow-changes';
import * as connect from './connect';
import * as disconnect from './disconnect';
import * as edit from './edit';
import * as form from './form';
import * as readOnly from './read-only';
import * as overview from './overview';
import * as reconnect from './reconnect';
import * as remove from './remove';
import * as save from './save';
import * as secrets from './secrets';
import * as serverInfo from './server-info';
import * as state from './state';
import * as test from './test';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('connection.add'), plan: add.plan },
  { kind: 'operation', id: featureId('connection.edit'), plan: edit.plan },
  { kind: 'operation', id: featureId('connection.save'), plan: save.plan },
  { kind: 'operation', id: featureId('connection.connect'), plan: connect.plan },
  { kind: 'operation', id: featureId('connection.disconnect'), plan: disconnect.plan },
  { kind: 'operation', id: featureId('connection.reconnect'), plan: reconnect.plan },
  { kind: 'operation', id: featureId('connection.remove'), plan: remove.plan },
  { kind: 'operation', id: featureId('connection.overview'), plan: overview.plan },
  { kind: 'operation', id: featureId('connection.secrets'), plan: secrets.plan },
  { kind: 'operation', id: featureId('connection.read-only'), plan: readOnly.plan },
  { kind: 'operation', id: featureId('connection.allow-changes'), plan: allowChanges.plan },
  { kind: 'read', id: featureId('connection.test'), request: test.request, parse: test.parse },
  { kind: 'read', id: featureId('connection.server-info'), request: serverInfo.request, parse: serverInfo.parse },
  { kind: 'read', id: featureId('connection.state'), request: state.request, parse: state.parse },
  { kind: 'read', id: featureId('connection.form'), request: form.request, parse: form.parse },
];
