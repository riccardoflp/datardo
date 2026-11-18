/**
 * The Operations and the Reads of the window area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { plan as close } from './close';
import { plan as fullScreen } from './full-screen';
import { plan as openDataFolder } from './open-data-folder';
import { plan as openLink } from './open-link';
import { plan as quit } from './quit';
import { plan as remember } from './remember';
import { plan as singleInstance } from './single-instance';
import { plan as size } from './size';
import { plan as theme } from './theme';
import { plan as zoom } from './zoom';
import * as checkUpdate from './check-update';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('window.remember'), plan: remember },
  { kind: 'operation', id: featureId('window.size'), plan: size },
  { kind: 'operation', id: featureId('window.theme'), plan: theme },
  { kind: 'operation', id: featureId('window.zoom'), plan: zoom },
  { kind: 'operation', id: featureId('window.quit'), plan: quit },
  { kind: 'operation', id: featureId('window.open-data-folder'), plan: openDataFolder },
  { kind: 'operation', id: featureId('window.open-link'), plan: openLink },
  { kind: 'operation', id: featureId('window.full-screen'), plan: fullScreen },
  { kind: 'operation', id: featureId('window.single-instance'), plan: singleInstance },
  { kind: 'operation', id: featureId('window.close'), plan: close },
  { kind: 'read', id: featureId('window.check-update'), ...checkUpdate },
];
