/**
 * The app step that follows a drop made from Datardo (`manage.drop-collection`, `manage.drop-database`,
 * `gridfs.drop-bucket`): it forgets what Datardo keeps on the connection for what was dropped, naming what it has
 * (`forget the color and the exclusion from searches of shop.orders`). The plan has it only when there is something to forget, after the server's
 * steps, so that it runs only when they succeeded.
 */
import type { ColorMaps } from '../color-of';
import { hasColorsOf, type Dropped } from '../color-of';
import { hasExclusionsOf, type ExcludingConnection } from '../excluded';
import type { AppStep } from '../../../shared/feature';
import type { ConnectionId } from '../../../shared/ids';
import type { Json } from '../../../shared/engine-request';
import { text } from '../text';

/** How the step names what was dropped: `shop.orders`, `the GridFS bucket shop.fs`, `shop and its collections`. */
function wordsOf(dropped: Dropped): string {
  switch (dropped.kind) {
    case 'collection':
      return `${dropped.database}.${dropped.collection}`;
    case 'bucket':
      return text.colors.bucket(dropped.database, dropped.bucket);
    case 'database':
      return text.colors.databaseAndCollections(dropped.database);
  }
}

function argsOf(connection: ConnectionId, dropped: Dropped): Json {
  switch (dropped.kind) {
    case 'collection':
      return { connection, database: dropped.database, collection: dropped.collection };
    case 'bucket':
      return { connection, database: dropped.database, bucket: dropped.bucket };
    case 'database':
      return { connection, database: dropped.database };
  }
}

/**
 * The step that forgets the colors and the exclusions from searches of what is dropped (`tree.color-of`,
 * `tree.excluded`); none when the connection keeps neither for it.
 */
export function forgetStep(
  connection: ColorMaps & ExcludingConnection & { readonly id: ConnectionId },
  dropped: Dropped,
): readonly AppStep[] {
  const several = dropped.kind === 'database';
  const kept = [
    ...(hasColorsOf(connection, dropped) ? [several ? text.colors.theColors : text.colors.theColor] : []),
    ...(hasExclusionsOf(connection, dropped) ? [several ? text.colors.theExclusions : text.colors.theExclusion] : []),
  ];
  if (kept.length === 0) {
    return [];
  }
  return [
    {
      kind: 'app',
      action: 'tree.forget-colors',
      args: argsOf(connection.id, dropped),
      text: text.colors.forget(kept, wordsOf(dropped)),
    },
  ];
}
