/**
 * The Operations and the Reads of the console area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as clear from './clear';
import * as clearHistory from './clear-history';
import * as commandDocs from './command-docs';
import * as commandFlags from './command-flags';
import * as connect from './connect';
import * as copyReply from './copy-reply';
import * as runCommand from './run';
import * as show from './show';
import * as stop from './stop';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('console.show'), plan: show.plan },
  { kind: 'operation', id: featureId('console.connect'), plan: connect.plan },
  { kind: 'operation', id: featureId('console.run'), plan: runCommand.plan },
  { kind: 'operation', id: featureId('console.stop'), plan: stop.plan },
  { kind: 'operation', id: featureId('console.clear'), plan: clear.plan },
  { kind: 'operation', id: featureId('console.clear-history'), plan: clearHistory.plan },
  { kind: 'operation', id: featureId('console.copy-reply'), plan: copyReply.plan },
  { kind: 'read', id: featureId('console.command-flags'), request: commandFlags.request, parse: commandFlags.parse },
  { kind: 'read', id: featureId('console.command-docs'), request: commandDocs.request, parse: commandDocs.parse },
  // The counts a confirmation of console.run names (`DBSIZE`, `INFO keyspace`): the card's Reads line, with no card
  // of its own yet.
  {
    kind: 'read',
    id: featureId(runCommand.keyCountRead),
    request: runCommand.keyCountRequest,
    parse: runCommand.parseKeyCount,
  },
];
