/**
 * The Operations and the Read of the structure area, as the runner starts them. Derivations are not listed;
 * `structure.show` is, for the tree and Go to, which open the page.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as apply } from './apply';
import { feature as copyScript } from './copy-script';
import { feature as openInPlayground } from './open-in-playground';
import { feature as read } from './read';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [show, read, copyScript, openInPlayground, apply];
