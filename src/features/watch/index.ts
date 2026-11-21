/**
 * The Operations and the Reads of the Watch changes area, as the runner starts them. Derivations and views are not
 * listed. The stream itself is kept open by the main process (`watch.stream`), which changes the pages' state, the
 * part `watch` of the app's state.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as clear from './clear';
import * as copyEvents from './copy-events';
import * as enablePreImages from './enable-pre-images';
import * as exportEvents from './export';
import { feature as remember } from './page/remember';
import * as pause from './pause';
import * as resume from './resume';
import * as show from './show';
import * as stop from './stop';
import * as stream from './stream';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('watch.show'), plan: show.plan },
  stream.feature,
  { kind: 'operation', id: featureId('watch.pause'), plan: pause.plan },
  { kind: 'operation', id: featureId('watch.stop'), plan: stop.plan },
  { kind: 'operation', id: featureId('watch.resume'), plan: resume.plan },
  { kind: 'operation', id: featureId('watch.clear'), plan: clear.plan },
  { kind: 'operation', id: featureId('watch.enable-pre-images'), plan: enablePreImages.plan },
  { kind: 'operation', id: featureId('watch.copy-events'), plan: copyEvents.plan },
  { kind: 'operation', id: featureId('watch.export'), plan: exportEvents.plan },
  exportEvents.fileRead,
  show.preImagesRead,
  remember,
];
