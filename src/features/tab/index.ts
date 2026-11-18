/**
 * The Operations of the tab area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as activate } from './activate';
import { feature as close } from './close';
import { feature as closeMany } from './close-many';
import { feature as collapseGroup } from './collapse-group';
import { feature as open } from './open';
import { feature as reopen } from './reopen';
import { feature as reorder } from './reorder';
import { feature as restore } from './restore';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  activate,
  restore,
  open,
  reorder,
  collapseGroup,
  close,
  reopen,
  closeMany,
];
