/**
 * The Operations and the Reads of the keys area, as the runner starts them. Derivations and views are not listed; the
 * reads an Operation or a View needs of its own are registered as `<card>:<what>` (`key.open:read`).
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as copy from './copy';
import * as copyName from './copy-name';
import * as deleteByPattern from './delete-by-pattern';
import * as deleteKey from './delete';
import * as deleteSelected from './delete-selected';
import * as details from './details';
import * as exportKeys from './export';
import * as importKeys from './import';
import * as inspect from './inspect';
import * as newKey from './new';
import * as open from './open';
import * as persist from './persist';
import * as refresh from './refresh';
import * as rename from './rename';
import * as scan from './scan';
import * as setExpiry from './set-expiry';
import * as show from './show';
import * as switchDatabase from './switch-database';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show.open,
  { kind: 'operation', id: featureId('key.open'), plan: open.plan },
  { kind: 'operation', id: featureId('key.rename'), plan: rename.plan },
  { kind: 'operation', id: featureId('key.persist'), plan: persist.plan },
  { kind: 'operation', id: featureId('key.delete'), plan: deleteKey.plan },
  { kind: 'operation', id: featureId('key.refresh'), plan: refresh.plan },
  { kind: 'operation', id: featureId('key.delete-by-pattern'), plan: deleteByPattern.plan },
  { kind: 'operation', id: featureId('key.new'), plan: newKey.plan },
  { kind: 'operation', id: featureId('key.copy'), plan: copy.plan },
  { kind: 'operation', id: featureId('key.set-expiry'), plan: setExpiry.plan },
  { kind: 'operation', id: featureId('key.delete-selected'), plan: deleteSelected.plan },
  { kind: 'operation', id: featureId('key.copy-name'), plan: copyName.plan },
  { kind: 'operation', id: featureId('key.export'), plan: exportKeys.plan },
  { kind: 'operation', id: featureId('key.import'), plan: importKeys.plan },
  { kind: 'operation', id: featureId('key.switch-database'), plan: switchDatabase.plan },
  { kind: 'read', id: featureId('key.scan'), request: scan.request, parse: scan.parse },
  { kind: 'read', id: featureId('key.scan:types'), request: scan.typesRequest, parse: scan.parseTypes },
  { kind: 'read', id: featureId('key.details'), request: details.request, parse: details.parse },
  open.read,
  rename.read,
  newKey.read,
  copy.read,
  inspect.read,
  deleteByPattern.read,
  exportKeys.fileRead,
  exportKeys.scanRead,
  importKeys.fileRead,
  importKeys.existsRead,
];
