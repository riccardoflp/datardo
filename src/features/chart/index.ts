/**
 * The Operations and the Reads of the chart area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as draw from './draw';
import { feature as filterFromMark } from './filter-from-mark';
import { feature as savePicture } from './save-picture';
import { feature as show } from './show';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  { kind: 'read', id: featureId('chart.draw'), request: draw.request, parse: draw.parse },
  filterFromMark,
  savePicture,
];
