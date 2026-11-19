/**
 * The Operations and the Reads of the aggregate area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as addStage } from './add-stage';
import { feature as clear } from './clear';
import { feature as copy } from './copy';
import { feature as dropCondition } from './drop-condition';
import { feature as editAsText } from './edit-as-text';
import { feature as moveStage } from './move-stage';
import { feature as removeStage } from './remove-stage';
import { feature as run } from './run';
import { feature as saveAsView } from './save-as-view';
import { feature as showStage } from './show-stage';
import { feature as sortColumn } from './sort-column';
import { feature as toggleStage } from './toggle-stage';
import { feature as writeOutput } from './write-output';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  addStage,
  removeStage,
  moveStage,
  toggleStage,
  clear,
  showStage,
  editAsText,
  copy,
  run,
  writeOutput,
  dropCondition,
  sortColumn,
  saveAsView,
];
