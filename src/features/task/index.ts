/**
 * The Operations of the scheduled tasks area, as the runner starts them. Derivations and views are not listed; the
 * area has no Read: the tasks and their states are in the app's state, and what is on disk is given by the main
 * process (`answers.disk`).
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as cancel from './cancel';
import * as deleteTask from './delete';
import * as edit from './edit';
import * as enable from './enable';
import * as missed from './missed';
import * as retention from './retention';
import * as runTask from './run';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('task.edit'), plan: edit.plan },
  { kind: 'operation', id: featureId('task.run'), plan: runTask.plan },
  { kind: 'operation', id: featureId('task.missed'), plan: missed.plan },
  { kind: 'operation', id: featureId('task.cancel'), plan: cancel.plan },
  { kind: 'operation', id: featureId('task.retention'), plan: retention.plan },
  { kind: 'operation', id: featureId('task.delete'), plan: deleteTask.plan },
  { kind: 'operation', id: featureId('task.enable'), plan: enable.plan },
];
