/**
 * The app step that follows a drop made from Datardo (`manage.drop-collection`, `manage.drop-database`,
 * `gridfs.drop-bucket`): it forgets what Datardo keeps on the connection for what was dropped, and its formatting rules
 * (`table.format-scopes`), naming what it has (`forget the color and the formatting rules of shop.orders`). The plan
 * has it only when there is something to forget, after the server's steps, so that it runs only when they succeeded.
 */
import type { ColorMaps } from '../color-of';
import { hasColorsOf, type Dropped } from '../color-of';
import type { AppStep } from '../../../shared/feature';
import type { ConnectionId } from '../../../shared/ids';
import type { Json } from '../../../shared/engine-request';
import { noFormatting, type KeptFormatting } from '../../../shared/formatting-rules';
import { hasRulesOf } from '../../table/format-scopes';
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

/** Whether Datardo keeps formatting rules for what is dropped (`table.format-scopes`). */
function hasFormattingOf(formatting: KeptFormatting, connection: ConnectionId, dropped: Dropped): boolean {
  const place = { connection, database: dropped.database };
  switch (dropped.kind) {
    case 'collection':
      return hasRulesOf(formatting, place, [dropped.collection]);
    case 'bucket':
      return hasRulesOf(formatting, place, [`${dropped.bucket}.files`, `${dropped.bucket}.chunks`]);
    case 'database':
      return hasRulesOf(formatting, place, 'whole-database');
  }
}

/**
 * The step that forgets the colors and the formatting rules of what is dropped, naming those it has; none when the
 * connection keeps neither for it. `formatting` is every rule kept (`table.format-scopes`).
 */
export function forgetStep(
  connection: ColorMaps & { readonly id: ConnectionId },
  dropped: Dropped,
  formatting: KeptFormatting = noFormatting,
): readonly AppStep[] {
  const colors = hasColorsOf(connection, dropped);
  const rules = hasFormattingOf(formatting, connection.id, dropped);
  if (!colors && !rules) {
    return [];
  }
  const kept = [
    ...(colors ? [dropped.kind === 'database' ? text.colors.theColors : text.colors.theColor] : []),
    ...(rules ? [text.colors.theFormattingRules] : []),
  ];
  return [
    {
      kind: 'app',
      action: 'tree.forget-colors',
      args: argsOf(connection.id, dropped),
      text: text.colors.forget(kept, wordsOf(dropped)),
    },
  ];
}
