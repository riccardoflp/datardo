/**
 * The Operations and the Reads of the transfer area, as the runner starts them, with the reads they ask for
 * themselves. Derivations are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as copyCollection from './copy-collection';
import * as exportDocuments from './export';
import * as generate from './generate';
import * as importDocuments from './import';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('transfer.export'), plan: exportDocuments.plan },
  exportDocuments.fileRead,
  { kind: 'operation', id: featureId('transfer.import'), plan: importDocuments.plan },
  importDocuments.fileDialog,
  importDocuments.fileRead,
  { kind: 'operation', id: featureId('transfer.copy-collection'), plan: copyCollection.plan },
  copyCollection.sourceRead,
  copyCollection.countRead,
  { kind: 'operation', id: featureId('transfer.generate'), plan: generate.plan },
  generate.sampleRead,
  generate.largestIdRead,
];
