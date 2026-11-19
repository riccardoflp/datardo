/**
 * The Operations and the Read of the document area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as copyPath } from './copy-path';
import { feature as copyValue } from './copy-value';
import { feature as deleteOne } from './delete';
import { feature as deleteMany } from './delete-many';
import { feature as deleteSelected } from './delete-selected';
import { feature as duplicate } from './duplicate';
import { feature as inlineEdit } from './inline-edit';
import { feature as insert } from './insert';
import { feature as insertFromTab } from './insert-from-tab';
import { feature as read } from './read';
import { feature as restoreVersion } from './restore-version';
import { feature as save } from './save';
import { feature as updateMany } from './update-many';
import { feature as updateSelected } from './update-selected';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  read,
  inlineEdit,
  copyValue,
  copyPath,
  save,
  insert,
  insertFromTab,
  duplicate,
  deleteOne,
  deleteSelected,
  updateMany,
  updateSelected,
  deleteMany,
  restoreVersion,
];
