/**
 * The Operations and the Reads of the playground area, as the runner starts them. Derivations and views are not
 * listed: the process of a run and the main process call `playground.rewrite`, `playground.runtime`,
 * `playground.sessions` and `playground.writes` directly.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as autocomplete from './autocomplete';
import * as open from './open';
import * as results from './results';
import * as show from './show';
import * as openFile from './open-file';
import * as runPlayground from './run';
import * as save from './save';
import * as stop from './stop';
import * as target from './target';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('playground.open'), plan: open.plan },
  { kind: 'operation', id: featureId('playground.open-file'), plan: openFile.plan },
  { kind: 'operation', id: featureId('playground.save'), plan: save.plan },
  { kind: 'operation', id: featureId('playground.target'), plan: target.plan },
  { kind: 'operation', id: featureId('playground.run'), plan: runPlayground.plan },
  { kind: 'operation', id: featureId('playground.stop'), plan: stop.plan },
  openFile.fileRead,
  openFile.textRead,
  openFile.rememberedRead,
  save.fileRead,
  save.writableRead,
  target.databasesRead,
  runPlayground.connectRead,
  show.editRead,
  results.layoutRead,
  autocomplete.collectionsRead,
  autocomplete.sampleRead,
];
