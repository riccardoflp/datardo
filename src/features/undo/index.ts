/**
 * The Operations and the Reads of the undo history, as the runner starts them. Derivations and views are not listed.
 * Two Reads have no card of their own: what `undo.record` keeps (`undo.keep`) and an operation's file with its records
 * as they are now (`undo.read-operation`), both answered by the main process.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as clear from './clear';
import * as details from './details';
import * as forgetConnection from './forget-connection';
import * as last from './last';
import * as limits from './limits';
import * as perConnection from './per-connection';
import * as keep from './reads/keep';
import * as operation from './reads/operation';
import * as record from './record';
import * as remove from './remove';
import * as revert from './revert';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('undo.record'), plan: record.plan },
  { kind: 'operation', id: featureId('undo.revert'), plan: revert.plan },
  { kind: 'operation', id: featureId('undo.last'), plan: last.plan },
  { kind: 'operation', id: featureId('undo.clear'), plan: clear.plan },
  { kind: 'operation', id: featureId('undo.remove'), plan: remove.plan },
  { kind: 'operation', id: featureId('undo.limits'), plan: limits.plan },
  { kind: 'operation', id: featureId('undo.per-connection'), plan: perConnection.plan },
  { kind: 'operation', id: featureId('undo.forget-connection'), plan: forgetConnection.plan },
  { kind: 'read', id: featureId('undo.details'), request: details.request, parse: details.parse },
  { kind: 'read', id: featureId('undo.keep'), request: keep.request, parse: keep.parse },
  { kind: 'read', id: featureId('undo.read-operation'), request: operation.request, parse: operation.parse },
];
