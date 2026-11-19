/**
 * The Operations and the Reads of the manage area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as createCollection } from './create-collection';
import { feature as createDatabase } from './create-database';
import { feature as definition } from './definition';
import { feature as dropCollection } from './drop-collection';
import { feature as dropDatabase } from './drop-database';
import { feature as editValidation } from './edit-validation';
import { feature as editView } from './edit-view';
import { feature as readOptions } from './read-options';
import { feature as renameCollection } from './rename-collection';
import { feature as validation } from './validation';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  createDatabase,
  createCollection,
  renameCollection,
  dropCollection,
  dropDatabase,
  readOptions,
  definition,
  editView,
  validation,
  editValidation,
];
