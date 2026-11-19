/**
 * The Operations and the Reads of the schema area, as the runner starts them. Derivations and views are not listed.
 * `schema.sample` is an app read: the main process carries out its {@link sampleAction} (`schema.sample`'s module says
 * how), with the analysis on a worker thread.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as filterFromValue } from './filter-from-value';
import { feature as sample, sampleAction } from './sample';
import { feature as show } from './show';

export { sampleAction };

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show, sample, filterFromValue];
