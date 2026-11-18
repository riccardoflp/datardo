/**
 * The Operations and the Reads of the nav area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as back } from './back';
import { feature as copyPath } from './copy-path';
import { feature as openOnAnother, sideRead as openOnAnotherRead } from './open-on-another-connection';
import { feature as pin } from './pin';
import { feature as ping } from './ping';
import { feature as resize } from './resize';
import { feature as switchConnection } from './switch-connection';
import { feature as toggleExplorer } from './toggle-explorer';
import { feature as toggleInspector } from './toggle-inspector';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  toggleExplorer,
  pin,
  copyPath,
  openOnAnother,
  openOnAnotherRead,
  switchConnection,
  back,
  ping,
  resize,
  toggleInspector,
];
