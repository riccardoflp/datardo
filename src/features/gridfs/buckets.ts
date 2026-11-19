/**
 * Feature: gridfs.buckets
 *
 * Which collections of a database make a bucket, for the tree: a name `X` is a bucket when the database has both
 * `X.files` and `X.chunks`; the buckets are sorted by name. Ported from Mongoster's `bucketNames`.
 */
import { compareNames } from '../tree/types';

const filesSuffix = '.files';
const chunksSuffix = '.chunks';

/** Feature: gridfs.buckets — the buckets of a database from the names of its collections, sorted by name. */
export function bucketNames(collections: readonly string[]): readonly string[] {
  const all = new Set(collections);
  const buckets = collections
    .filter((name) => name.length > filesSuffix.length && name.endsWith(filesSuffix))
    .map((name) => name.slice(0, -filesSuffix.length))
    .filter((bucket) => all.has(`${bucket}${chunksSuffix}`));
  return [...new Set(buckets)].sort(compareNames);
}

/** The tooltip of a bucket in the tree: *GridFS bucket shop.fs (fs.files and fs.chunks)*. */
export function bucketTooltip(database: string, bucket: string): string {
  return `GridFS bucket ${database}.${bucket} (${bucket}${filesSuffix} and ${bucket}${chunksSuffix})`;
}
