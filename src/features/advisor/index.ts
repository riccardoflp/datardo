/**
 * The Operations and the Reads of the Index advisor, as the runner starts them. The derivations and the view are not
 * listed; `advisor.show` is, for the tree and Go to, which open the page.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as readIndexes from './read-indexes';
import * as readSlowOperations from './read-slow-operations';
import { feature as show } from './show';
import { feature as turnOnProfiler } from './turn-on-profiler';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  { kind: 'read', id: featureId('advisor.read-indexes'), request: readIndexes.request, parse: readIndexes.parse },
  {
    kind: 'read',
    id: featureId('advisor.read-slow-operations'),
    request: readSlowOperations.request,
    parse: readSlowOperations.parse,
  },
  turnOnProfiler,
];
