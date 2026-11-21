/**
 * The notification that ends a backup (`backup.create`), which the writer of the main process sends once it knows how
 * the backup ended, what its buttons do when the feature is started again with them, and what a backup is of, by name.
 */
import type { After, Answers, Step } from '../../../shared/feature';
import { featureId, type ConnectionId } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { pathStep } from '../../transfer/ask/choose-path';
import { isObject } from '../../tree/types';
import { mongorestoreCommand } from '../folder-layout';
import { createText as text, type BackupTotals } from '../text';
import type { BackupFormat } from '../types';

/** What the backup is of, by name: the connection, the database, or `<database>.<collection>`. */
export function backupWhat(target: Target, connectionName: string): string {
  switch (target.kind) {
    case 'database':
      return target.database;
    case 'collection':
      return `${target.database}.${target.collection}`;
    case 'app':
    case 'tab':
    case 'connection':
    case 'redis-database':
    case 'key':
      return connectionName;
  }
}

/** **Copy mongorestore command** and **Reveal file** or **Reveal folder** of the notification: `args.copy`, `args.reveal`. */
export function notificationAction(answers: Answers): { readonly steps: Step[]; readonly after: After[] } | undefined {
  const args = answers['args'];
  const fields = isObject(args) ? args : {};
  const copy = fields['copy'];
  const reveal = fields['reveal'];
  if (typeof copy === 'string' && copy !== '') {
    return { steps: [], after: [{ kind: 'copy', text: copy }] };
  }
  return typeof reveal === 'string' && reveal !== '' ? { steps: [pathStep('reveal', reveal)], after: [] } : undefined;
}

/** How the writer of a backup ended: what it wrote, or that it was cancelled, or its error. */
export type BackupEnded =
  | { readonly kind: 'done'; readonly totals: BackupTotals; readonly path: string; readonly milliseconds: number }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: string };

/**
 * The notification that ends a backup, which its writer sends: *Backed up \<what\> (…) to \<path\> in \<s\> s.*, with
 * **Copy mongorestore command** and **Reveal file** or **Reveal folder**; *Backup of \<what\> cancelled: …*; or *Backup
 * of \<what\> failed: \<error\>*.
 */
export function backupMessage(
  what: string,
  args: { readonly connection: ConnectionId; readonly format: BackupFormat },
  ended: BackupEnded,
): Extract<After, { kind: 'notify' }> {
  if (ended.kind === 'cancelled') {
    return { kind: 'notify', level: 'info', text: text.cancelled(what) };
  }
  if (ended.kind === 'failed') {
    return { kind: 'notify', level: 'error', text: text.failed(what, ended.error) };
  }
  const feature = featureId('backup.create');
  const target = { kind: 'connection', connection: args.connection } as const;
  const seconds = (ended.milliseconds / 1000).toFixed(1);
  return {
    kind: 'notify',
    level: 'success',
    text: text.done(what, ended.totals, ended.path, seconds),
    actions: [
      { label: text.copyCommand, feature, target, args: { copy: mongorestoreCommand(ended.path, args.format) } },
      {
        label: args.format === 'archive' ? text.revealFile : text.revealFolder,
        feature,
        target,
        args: { reveal: ended.path },
      },
    ],
  };
}
