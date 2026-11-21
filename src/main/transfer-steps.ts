/**
 * The file steps of an export (`transfer.export`) and of a backup (`backup.create`), as the runner's file writer
 * carries them out: the writer of `src/main/transfer-writers.ts`, then the notification of its card, done, cancelled or
 * failed, which the writer sends itself (as `key.export` does); the runner then says nothing of its own.
 */
import type { EngineService } from '../engines';
import type { BackupWriterArgs } from '../features/backup/create';
import { backupMessage, backupWhat } from '../features/backup/creating/message';
import { createText } from '../features/backup/text';
import { exportMessage, type ExportWriterArgs } from '../features/transfer/export';
import type { After, FileStep, Plan } from '../shared/feature';
import type { ConnectionId } from '../shared/ids';
import type { Target } from '../shared/target';
import { Cancelled } from '../runner/cancel';
import type { ProgressReport } from '../runner/ports';
import { writeBackup, writeExport } from './transfer-writers';

/** The writers whose notification their writer sends. */
const ownMessages: ReadonlySet<string> = new Set(['transfer.export', 'backup.create']);

/** Whether a plan writes a file with one of these writers: the runner then says nothing of its own. */
export function endsWithOwnMessage(plan: Plan): boolean {
  return plan.steps.some(
    (step) => step.kind === 'file' && step.content !== undefined && ownMessages.has(step.content.writer),
  );
}

/** What carrying out a step needs: the engines, the connections' names, and where a notification goes. */
export interface TransferStepServices {
  readonly engines: () => EngineService;
  readonly connectionName: (connection: ConnectionId) => string;
  readonly notify: (feature: string, after: Extract<After, { kind: 'notify' }>) => void | Promise<void>;
  readonly now: () => number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What a backup is of, by name, from its writer's arguments. */
function backupWhatOf(args: BackupWriterArgs, name: string): string {
  const target: Target =
    args.collection !== null && args.database !== null
      ? { kind: 'collection', connection: args.connection, database: args.database, collection: args.collection }
      : args.database !== null
        ? { kind: 'database', connection: args.connection, database: args.database }
        : { kind: 'connection', connection: args.connection };
  return backupWhat(target, name);
}

/**
 * Carries out a file step of an export or a backup, and sends its notification; false for a step of another writer.
 * Cancel and a failure are thrown again, after their notification, for the runner to end the plan.
 */
export async function carryOutTransferStep(
  services: TransferStepServices,
  step: FileStep,
  signal: AbortSignal,
  progress?: ProgressReport,
): Promise<boolean> {
  const content = step.content;
  const run = { engines: services.engines(), signal, ...(progress === undefined ? {} : { progress }) };
  if (step.action !== 'write' || content === undefined || !ownMessages.has(content.writer)) {
    return false;
  }
  if (content.writer === 'transfer.export') {
    const args = content.args as unknown as ExportWriterArgs;
    try {
      const done = await writeExport(run, step.path, args);
      await services.notify('transfer.export', exportMessage(args, { kind: 'done', ...done, path: step.path }));
    } catch (error: unknown) {
      const ended =
        error instanceof Cancelled
          ? { kind: 'cancelled' as const }
          : { kind: 'failed' as const, error: messageOf(error) };
      await services.notify('transfer.export', exportMessage(args, ended));
      throw error;
    }
    return true;
  }
  const args = content.args as unknown as BackupWriterArgs;
  const what = backupWhatOf(args, services.connectionName(args.connection));
  const started = services.now();
  try {
    const totals = await writeBackup({ ...run, title: createText.progressTitle(what) }, step.path, args);
    const ended = { kind: 'done' as const, totals, path: step.path, milliseconds: services.now() - started };
    await services.notify('backup.create', backupMessage(what, args, ended));
  } catch (error: unknown) {
    const ended =
      error instanceof Cancelled
        ? { kind: 'cancelled' as const }
        : { kind: 'failed' as const, error: messageOf(error) };
    await services.notify('backup.create', backupMessage(what, args, ended));
    throw error;
  }
  return true;
}
