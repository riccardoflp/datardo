/**
 * The Operations and the Reads of the GridFS area, as the runner starts them, with the auxiliary reads of its
 * operations. Derivations and the views are not listed; `gridfs.show` is, for the tree, the notification of an upload
 * and Go to, which open the page of a bucket.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as createBucket } from './create-bucket';
import { feature as deleteFile } from './delete';
import { feature as download } from './download';
import { countRead, feature as dropBucket } from './drop-bucket';
import { feature as editMetadata } from './edit-metadata';
import { feature as list, fileRead } from './list';
import { feature as open } from './open';
import { feature as preview } from './preview';
import { feature as rename } from './rename';
import { feature as show } from './show';
import { feature as upload } from './upload';
import { chooseRead, temporaryRead } from './write/file';
import { existingRead, replacedRead } from './write/upload';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  list,
  fileRead,
  preview,
  upload,
  existingRead,
  replacedRead,
  chooseRead,
  createBucket,
  download,
  open,
  temporaryRead,
  rename,
  editMetadata,
  deleteFile,
  dropBucket,
  countRead,
];
