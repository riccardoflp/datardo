/**
 * The Operations and the Reads of the backup area, as the runner starts them, with the reads they ask for themselves.
 * Derivations are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as create from './create';
import * as restore from './restore';
import { pathDialog } from './restoring/choose';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('backup.create'), plan: create.plan },
  create.pathDialog,
  create.listRead,
  create.detailsRead,
  create.namesRead,
  { kind: 'operation', id: featureId('backup.restore'), plan: restore.plan },
  pathDialog,
  restore.archiveListRead,
  restore.folderListRead,
  restore.metadataRead,
  restore.existingRead,
];
