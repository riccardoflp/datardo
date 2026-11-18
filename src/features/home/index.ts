/**
 * The Operations of the Home area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import * as forgetRecent from './forget-recent';
import * as show from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show.open, forgetRecent.feature];
