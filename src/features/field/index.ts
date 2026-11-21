/**
 * The Operations and the Reads of the field area, as the runner starts them. Derivations are not listed, except
 * `field.type-counts`, which `field.convert-type` reads through the runner.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { feature as convertType } from './convert-type';
import { feature as left } from './reads/left';
import { feature as remove } from './remove';
import { feature as rename } from './rename';
import * as typeCounts from './type-counts';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  rename,
  remove,
  convertType,
  { kind: 'read', id: featureId('field.type-counts'), request: typeCounts.request, parse: typeCounts.parse },
  left,
];
