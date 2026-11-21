/**
 * Every feature the runner can start, by its identifier: the Operations and the Reads of every area. Each area lists
 * its own in `src/features/<area>/index.ts`; a new area adds one line here.
 */
import type { RunnableFeature } from '../shared/feature';
import type { FeatureId } from '../shared/ids';
import { features as windowFeatures } from './window';
import { features as navFeatures } from './nav';
import { features as runnerFeatures } from './runner';
import { features as settingsFeatures } from './settings';
import { features as connectionFeatures } from './connection';
import { features as tabFeatures } from './tab';
import { features as paletteFeatures } from './palette';
import { features as homeFeatures } from './home';
import { features as treeFeatures } from './tree';
import { features as undoFeatures } from './undo';
import { features as oplogFeatures } from './oplog';
import { features as queryFeatures } from './query';
import { features as tableFeatures } from './table';
import { features as keyFeatures } from './key';
import { features as aggregateFeatures } from './aggregate';
import { features as savedQueryFeatures } from './saved-query';

/** The features of every area, as each area's index lists them. */
const areas: readonly (readonly RunnableFeature[])[] = [
  windowFeatures,
  navFeatures,
  runnerFeatures,
  settingsFeatures,
  connectionFeatures,
  tabFeatures,
  paletteFeatures,
  homeFeatures,
  treeFeatures,
  undoFeatures,
  oplogFeatures,
  queryFeatures,
  tableFeatures,
  keyFeatures,
  aggregateFeatures,
  savedQueryFeatures,
];

/** The features the runner can start, by identifier. */
export function runnableFeatures(): ReadonlyMap<FeatureId, RunnableFeature> {
  return new Map(areas.flat().map((feature) => [feature.id, feature]));
}
