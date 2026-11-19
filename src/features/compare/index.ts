/**
 * The Operations and the Reads of the compare area, as the runner starts them. Derivations and the view are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as copyDocument } from './copy-document';
import { feature as makeLike } from './make-like';
import { feature as read } from './read';
import { feature as readDetails } from './read-details';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show, read, readDetails, copyDocument, makeLike];
