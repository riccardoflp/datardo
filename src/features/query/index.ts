/**
 * The Reads of the query area, as the runner starts them. Its Derivations and Views are not listed: the window calls
 * them, and the area has no Operation.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as count from './count';
import * as fieldHints from './field-hints';
import * as run from './run';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'read', id: featureId('query.run'), request: run.request, parse: run.parse },
  { kind: 'read', id: featureId('query.count'), request: count.request, parse: count.parse },
  { kind: 'read', id: featureId('query.field-hints'), request: fieldHints.request, parse: fieldHints.parse },
];
