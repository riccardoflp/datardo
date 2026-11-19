/**
 * The Operations and the Reads of the connection area, as the runner starts them. Derivations and views are not listed.
 * The reads of the main process that import and export ask for (`connection.import:source`, `connection.import:parse`,
 * `connection.export:path`) are listed here too: each answers what its app action returns.
 */
import type { Json } from '../../shared/engine-request';
import type { ReadFeature, RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as add from './add';
import * as allowChanges from './allow-changes';
import * as connect from './connect';
import * as copyString from './copy-string';
import * as disconnect from './disconnect';
import * as duplicate from './duplicate';
import * as edit from './edit';
import * as exportConnections from './export';
import * as form from './form';
import * as importConnections from './import';
import * as linkRedis from './link-redis';
import * as moveToFolder from './move-to-folder';
import * as removeFolder from './remove-folder';
import * as renameFolder from './rename-folder';
import * as setColor from './set-color';
import * as trustHostKey from './trust-host-key';
import * as unlinkRedis from './unlink-redis';
import * as readOnly from './read-only';
import * as overview from './overview';
import * as reconnect from './reconnect';
import * as remove from './remove';
import * as save from './save';
import * as secrets from './secrets';
import * as serverInfo from './server-info';
import * as state from './state';
import * as test from './test';

/** A read the main process answers with its app action of the same name, its reply as it is. */
function mainRead(id: string, action: string): ReadFeature {
  return {
    kind: 'read',
    id: featureId(id),
    request: (_context, args: Json) => ({ kind: 'app', action, args }),
    parse: (replies) => replies[0] ?? null,
  };
}

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
  { kind: 'operation', id: featureId('connection.duplicate'), plan: duplicate.plan },
  { kind: 'operation', id: featureId('connection.set-color'), plan: setColor.plan },
  { kind: 'operation', id: featureId('connection.move-to-folder'), plan: moveToFolder.plan },
  { kind: 'operation', id: featureId('connection.rename-folder'), plan: renameFolder.plan },
  { kind: 'operation', id: featureId('connection.remove-folder'), plan: removeFolder.plan },
  { kind: 'operation', id: featureId('connection.link-redis'), plan: linkRedis.plan },
  { kind: 'operation', id: featureId('connection.unlink-redis'), plan: unlinkRedis.plan },
  { kind: 'operation', id: featureId('connection.trust-host-key'), plan: trustHostKey.plan },
  { kind: 'operation', id: featureId('connection.import'), plan: importConnections.plan },
  { kind: 'operation', id: featureId('connection.export'), plan: exportConnections.plan },
  {
    kind: 'read',
    id: featureId('connection.copy-string'),
    request: copyString.request,
    parse: copyString.parse,
    after: copyString.after,
  },
  mainRead('connection.import:source', 'connection.import-source'),
  mainRead('connection.import:parse', 'connection.import-parse'),
  mainRead('connection.export:path', 'connection.export-path'),
  { kind: 'read', id: featureId('connection.test'), request: test.request, parse: test.parse },
  { kind: 'read', id: featureId('connection.server-info'), request: serverInfo.request, parse: serverInfo.parse },
  { kind: 'read', id: featureId('connection.state'), request: state.request, parse: state.parse },
  { kind: 'read', id: featureId('connection.form'), request: form.request, parse: form.parse },
];
