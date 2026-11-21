/**
 * The messages that end a copy, an import and a generation, done, cancelled or failed, from what the runner counted of
 * their fed steps (`FedTotals`), as their cards write them; and the one of a restore (`backup.restore`). The runner asks
 * for them through its port `fedSummary`, which the main process gives with {@link fedSummary}.
 */
import type { MongoRequest } from '../../../shared/engine-request';
import type { After, Context, NotificationAction, Plan } from '../../../shared/feature';
import { featureId, type ConnectionId } from '../../../shared/ids';
import { savedConnection } from '../../../shared/state/connections';
import { restoreSummary } from '../../backup/restoring/summary';
import { isFedStep, type FedStep, type FedTotals } from '../../backup/types';
import { copyText, generateText, importText } from '../text';
import { secondsOf, sentences, summed } from './totals';

/** The first fed step of a plan, and where it writes. */
function fedOf(plan: Plan): { readonly step: FedStep; readonly request: MongoRequest } | undefined {
  const step = plan.steps.find(isFedStep);
  return step === undefined ? undefined : { step, request: step.request as MongoRequest };
}

function connectionNameOf(context: Context, connection: ConnectionId): string {
  return savedConnection(context.state.connections, connection)?.name ?? connection;
}

/** **Open**: the collection, in a collection tab (`tab.open`). */
function openAction(label: string, connection: ConnectionId, database: string, collection: string): NotificationAction {
  const target = { kind: 'collection', connection, database, collection } as const;
  return {
    label,
    feature: featureId('tab.open'),
    target,
    args: { shows: { kind: 'collection', connection, database, collection } },
  };
}

/** The open pages and the tree read again once something was written, also when the plan stopped. */
function refreshed(connection: ConnectionId, totals: FedTotals, inserted: number): readonly After[] {
  return totals.ended !== 'done' && inserted > 0 ? [{ kind: 'refresh', connection }] : [];
}

/** `transfer.copy-collection`: *Copied …*, *Copy cancelled after …*, *Copy failed: …*. */
export function copySummary(context: Context, plan: Plan, totals: FedTotals): readonly After[] {
  const fed = fedOf(plan);
  if (fed === undefined) {
    return [];
  }
  const { step, request } = fed;
  const collection = request.collection ?? '';
  const destination = `${connectionNameOf(context, step.connection)} › ${request.database}.${collection}`;
  const all = summed(totals);
  const refresh = refreshed(step.connection, totals, all.inserted);
  if (totals.ended === 'cancelled') {
    const text = copyText.cancelled(all.inserted, step.work?.total ?? all.read, destination);
    return [...refresh, { kind: 'notify', level: 'info', text }];
  }
  if (totals.ended === 'failed') {
    return [...refresh, { kind: 'notify', level: 'error', text: copyText.failed(totals.error ?? '') }];
  }
  const failedIndexes = totals.indexes.failed.map((each) => copyText.indexNotCreated(`${each.index}: ${each.error}`));
  const more = [
    ...(all.duplicates > 0 ? [copyText.skipped(all.duplicates)] : []),
    ...(all.failed > 0 ? [copyText.failedSome(all.failed, all.firstOtherError ?? '')] : []),
    ...failedIndexes,
    ...(totals.notRecorded === undefined ? [] : [copyText.overflow(totals.notRecorded)]),
  ];
  const done = copyText.done(
    {
      inserted: all.inserted,
      total: all.read,
      skipped: all.duplicates,
      failed: all.failed,
      indexes: totals.indexes.created,
      indexErrors: failedIndexes,
    },
    destination,
    secondsOf(totals),
  );
  const warns = all.failed > 0 || failedIndexes.length > 0 || totals.notRecorded !== undefined;
  return [
    {
      kind: 'notify',
      level: warns ? 'warning' : 'success',
      text: sentences(done, more),
      actions: [openAction(copyText.open, step.connection, request.database, collection)],
    },
  ];
}

/** `transfer.import`: *Imported \<i\> of \<n\> documents into \<collection\>.*, a warning with what failed. */
export function importSummary(_context: Context, plan: Plan, totals: FedTotals): readonly After[] {
  const fed = fedOf(plan);
  if (fed === undefined) {
    return [];
  }
  const { step, request } = fed;
  const all = summed(totals);
  const refresh = refreshed(step.connection, totals, all.inserted);
  if (totals.ended === 'failed') {
    return [...refresh, { kind: 'notify', level: 'error', text: importText.failed(totals.error ?? '') }];
  }
  const total = step.work?.total ?? all.read;
  const done = importText.done(all.inserted, total, request.collection ?? '');
  const refused = all.duplicates + all.failed;
  const more = refused > 0 ? [importText.failedSome(refused, all.firstError ?? '')] : [];
  const level = refused > 0 ? 'warning' : totals.ended === 'cancelled' ? 'info' : 'success';
  return [...refresh, { kind: 'notify', level, text: sentences(done, more) }];
}

/** `transfer.generate`: *Inserted \<i\> generated documents into \<destination\> in \<s\> s.*, with **Open**. */
export function generateSummary(context: Context, plan: Plan, totals: FedTotals): readonly After[] {
  const fed = fedOf(plan);
  if (fed === undefined) {
    return [];
  }
  const { step, request } = fed;
  const collection = request.collection ?? '';
  const target = context.target;
  const same =
    target.kind === 'collection' &&
    target.connection === step.connection &&
    target.database === request.database &&
    target.collection === collection;
  const destination = same
    ? `${request.database}.${collection}`
    : `${connectionNameOf(context, step.connection)} › ${request.database}.${collection}`;
  const all = summed(totals);
  const refresh = refreshed(step.connection, totals, all.inserted);
  if (totals.ended === 'cancelled') {
    const text = generateText.cancelled(all.inserted, step.work?.total ?? all.read, destination);
    return [...refresh, { kind: 'notify', level: 'info', text }];
  }
  if (totals.ended === 'failed') {
    return [
      ...refresh,
      { kind: 'notify', level: 'error', text: generateText.failed(all.inserted, totals.error ?? '') },
    ];
  }
  const refused = all.duplicates + all.failed;
  const done = generateText.done(all.inserted, destination, secondsOf(totals));
  const more = refused > 0 ? [generateText.failedSome(refused, all.firstError ?? '')] : [];
  return [
    {
      kind: 'notify',
      level: refused > 0 ? 'warning' : 'success',
      text: sentences(done, more),
      actions: [openAction(generateText.open, step.connection, request.database, collection)],
    },
  ];
}

/** The message that ends a plan with fed steps, by the feature that made it; none for another feature. */
export function fedSummary(context: Context, plan: Plan, totals: FedTotals): readonly After[] | undefined {
  switch (context.feature) {
    case featureId('transfer.copy-collection'):
      return copySummary(context, plan, totals);
    case featureId('transfer.import'):
      return importSummary(context, plan, totals);
    case featureId('transfer.generate'):
      return generateSummary(context, plan, totals);
    case featureId('backup.restore'):
      return restoreSummary(context, plan, totals);
    default:
      return undefined;
  }
}
