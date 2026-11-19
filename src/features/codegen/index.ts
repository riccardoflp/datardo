/**
 * The Operations of the codegen area, as the runner starts them. Derivations and views are not listed: the code is
 * written in the window, and nothing is read from a deployment.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as copy } from './copy';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show, copy];
