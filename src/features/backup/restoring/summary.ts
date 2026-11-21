/**
 * The message that ends a restore (`backup.restore`), done, cancelled or failed, from what the runner counted of its
 * fed steps, one per collection (`FedTotals`).
 */
import type { After, Context, Plan } from '../../../shared/feature';
import { savedConnection } from '../../../shared/state/connections';
import { targetConnection } from '../../../shared/target';
import { secondsOf, sentences, summed } from '../../transfer/ends/totals';
import { whereOf } from '../restore';
import { restoreText as text, type RestoreTotals } from '../text';
import type { FedTotals } from '../types';

/** *Restored …*, *Restore into \<where\> cancelled after …*, *Restore into \<where\> failed: …*. */
export function restoreSummary(context: Context, _plan: Plan, totals: FedTotals): readonly After[] {
  const id = targetConnection(context.target);
  const connection = id === undefined ? '' : (savedConnection(context.state.connections, id)?.name ?? id);
  const where = whereOf(context, connection);
  const all = summed(totals);
  const failedIndexes = totals.indexes.failed.map((each) =>
    text.indexNotCreated(`${each.on}.${each.index}: ${each.error}`),
  );
  const counts: RestoreTotals = {
    inserted: all.inserted,
    skipped: all.duplicates,
    failed: all.failed,
    ...(all.firstOtherError === undefined ? {} : { firstError: all.firstOtherError }),
    indexes: totals.indexes.created,
    collections: totals.steps.filter((each) => each.read > 0 || totals.ended === 'done').length,
    indexErrors: failedIndexes,
    notRestored: [],
    recorded: totals.recorded,
  };
  const summary = text.summary(counts);
  const refresh: readonly After[] = id === undefined ? [] : [{ kind: 'refresh', connection: id }];
  if (totals.ended === 'cancelled') {
    return [...refresh, { kind: 'notify', level: 'info', text: text.cancelled(where, summary) }];
  }
  if (totals.ended === 'failed') {
    const before = all.inserted > 0 ? text.restoredBefore(summary) : '';
    return [...refresh, { kind: 'notify', level: 'error', text: `${text.failed(where, totals.error ?? '')}${before}` }];
  }
  const databases = [...new Set(totals.steps.map((each) => each.database))].join(', ');
  const done = text.done(summary, connection, databases, secondsOf(totals));
  const more = [
    ...(all.duplicates > 0 ? [text.skipped(all.duplicates)] : []),
    ...(all.failed > 0 ? [text.failedSome(all.failed, all.firstOtherError ?? '')] : []),
    ...failedIndexes,
    ...(totals.recorded > 1 ? [text.undoEach] : []),
  ];
  const warns = all.failed > 0 || failedIndexes.length > 0;
  return [{ kind: 'notify', level: warns ? 'warning' : 'success', text: sentences(done, more) }];
}
