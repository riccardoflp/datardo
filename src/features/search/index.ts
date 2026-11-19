/**
 * The Operations and the Reads of the search area, as the runner starts them. Derivations and the view are not listed;
 * the page's `plan` is, as the command `search.show` starts it.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as collections } from './collections';
import { feature as copyId } from './copy-id';
import { feature as openInCollection } from './open-in-collection';
import { feature as scan } from './scan';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show, collections, scan, openInCollection, copyId];
