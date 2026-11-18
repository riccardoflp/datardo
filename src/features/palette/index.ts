/**
 * The Operations and the Reads of Go to, as the runner starts them. Derivations and views are not listed; opening Go
 * to from the main process (the menu bar on macOS) is.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as findCollections from './find-collections';
import * as findKeys from './find-keys';
import { open } from './open';
import { feature as openResult } from './open-result';
import * as recent from './recent';
import { feature as runCommand } from './run-command';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'read', id: featureId('palette.recent'), request: recent.request, parse: recent.parse },
  {
    kind: 'read',
    id: featureId('palette.find-collections'),
    request: findCollections.request,
    parse: findCollections.parse,
  },
  { kind: 'read', id: featureId('palette.find-keys'), request: findKeys.request, parse: findKeys.parse },
  open,
  runCommand,
  openResult,
];
