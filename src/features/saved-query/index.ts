/**
 * The Operations and the Reads of the saved-query area, as the runner starts them. Derivations and views are not
 * listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as chooseFolder } from './choose-folder';
import { feature as clearRecent } from './clear-recent';
import { feature as connectionList } from './connection-list';
import { feature as deleteQuery } from './delete';
import { feature as list } from './list';
import { feature as move } from './move';
import { feature as readFolder } from './read-folder';
import { feature as recent } from './recent';
import { feature as removeRecent } from './remove-recent';
import { feature as rename } from './rename';
import { feature as revealFile } from './reveal-file';
import { feature as runQuery } from './run';
import { feature as save } from './save';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  list,
  readFolder,
  connectionList,
  recent,
  removeRecent,
  clearRecent,
  save,
  rename,
  move,
  deleteQuery,
  revealFile,
  chooseFolder,
  runQuery,
];
