/**
 * The Operations and the Reads of the explain area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as run } from './run';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show, run];
