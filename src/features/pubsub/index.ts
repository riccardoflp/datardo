/**
 * The Operations and the Reads of the Pub/Sub area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as channels from './channels';
import * as clear from './clear';
import * as copy from './copy';
import * as exportMessages from './export';
import * as followOplog from './follow-oplog';
import * as pause from './pause';
import * as publish from './publish';
import * as reconnect from './reconnect';
import * as show from './show';
import * as subscribe from './subscribe';
import * as unsubscribe from './unsubscribe';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('pubsub.show'), plan: show.plan },
  { kind: 'operation', id: featureId('pubsub.subscribe'), plan: subscribe.plan },
  { kind: 'operation', id: featureId('pubsub.unsubscribe'), plan: unsubscribe.plan },
  { kind: 'operation', id: featureId('pubsub.pause'), plan: pause.plan },
  { kind: 'operation', id: featureId('pubsub.clear'), plan: clear.plan },
  { kind: 'operation', id: featureId('pubsub.copy'), plan: copy.plan },
  { kind: 'operation', id: featureId('pubsub.export'), plan: exportMessages.plan },
  { kind: 'operation', id: featureId('pubsub.publish'), plan: publish.plan },
  { kind: 'operation', id: featureId('pubsub.reconnect'), plan: reconnect.plan },
  { kind: 'operation', id: featureId('pubsub.follow-oplog'), plan: followOplog.plan },
  { kind: 'read', id: featureId('pubsub.channels'), request: channels.request, parse: channels.parse },
];
