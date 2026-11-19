/**
 * The Operations and the Reads of the table area, as the runner starts them. Its Derivations and Views are not
 * listed: the window calls them.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as arrangeColumns from './arrange-columns';
import * as collapse from './collapse';
import * as copyAs from './copy-as';
import * as copyPath from './copy-path';
import * as copyValue from './copy-value';
import * as expand from './expand';
import * as refresh from './refresh';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('table.expand'), plan: expand.plan },
  { kind: 'operation', id: featureId('table.collapse'), plan: collapse.plan },
  { kind: 'operation', id: featureId('table.arrange-columns'), plan: arrangeColumns.plan },
  { kind: 'operation', id: featureId('table.copy-as'), plan: copyAs.plan },
  { kind: 'operation', id: featureId('table.copy-value'), plan: copyValue.plan },
  { kind: 'operation', id: featureId('table.copy-path'), plan: copyPath.plan },
  { kind: 'read', id: featureId('table.refresh'), request: refresh.request, parse: refresh.parse },
];
