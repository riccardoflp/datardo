/**
 * The Operations and the Reads of the settings area, as the runner starts them. Derivations and views are not listed.
 */
import { featureId } from '../../shared/ids';
import type { RunnableFeature } from '../../shared/feature';
import { plan as change } from './change';
import { open as openPage } from './page';
import { plan as reset } from './reset';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('settings.change'), plan: change },
  { kind: 'operation', id: featureId('settings.reset'), plan: reset },
  openPage,
];
