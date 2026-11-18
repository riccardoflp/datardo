/**
 * The Operations and the Reads of the runner area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { open as openLog } from './log';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [openLog];
