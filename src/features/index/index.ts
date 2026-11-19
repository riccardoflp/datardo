/**
 * The Operations and the Reads of the index area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as create } from './create';
import { feature as createSearch } from './create-search';
import { feature as drop } from './drop';
import { feature as dropSearch } from './drop-search';
import { feature as edit } from './edit';
import { feature as editSearch } from './edit-search';
import { feature as hide } from './hide';
import { feature as list } from './list';
import { feature as listSearch } from './list-search';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  list,
  listSearch,
  create,
  edit,
  hide,
  drop,
  createSearch,
  editSearch,
  dropSearch,
];
