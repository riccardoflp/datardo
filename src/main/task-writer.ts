/**
 * The file steps of a run of a scheduled task (`task.run`), as the runner's file writer carries them out: the backup
 * of `backup.create` or the export of `transfer.export` written in the task's folder, which a run's own Cancel stops
 * too (`task.cancel`), its progress shown on the page; and the deletes of retention (`task.retention`), which delete
 * an output only while it is still of the kind recorded and never throw, the paths they could not delete kept for
 * `task.forget-outputs`. A run sends no notification of `backup.create` or `transfer.export`: `task.notify` speaks
 * for it.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportWriterArgs } from '../features/transfer/export';
import { retentionWriter } from '../features/task/retention';
import { taskId, type TaskFormat } from '../shared/state/tasks';
import type { FileStep } from '../shared/feature';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { ProgressReport } from '../runner/ports';
import { plannedBackup, type BackupSource } from './task-backup';
import type { TaskHost, WrittenOutput } from './task-host';
import { writeBackup, writeExport, type WriteRun } from './transfer-writers';

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The task a step was written for: `args.task` of its writer, when it is one. */
export function stepTask(step: FileStep): string | undefined {
  const task = step.content === undefined ? undefined : fieldsOf(step.content.args)['task'];
  return typeof task === 'string' && task !== '' ? task : undefined;
}

/** The bytes of a file, or of everything in a folder. */
export async function sizeOf(path: string): Promise<number> {
  const found = await stat(path);
  if (!found.isDirectory()) {
    return found.size;
  }
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => sizeOf(join(path, entry.name))));
  return sizes.reduce((sum, each) => sum + each, 0);
}

/** What the page shows of a run in progress: `shop.orders: 12,000 documents`, `12,000 documents`. */
function progressOf(host: TaskHost, task: string, runner: ProgressReport | undefined): ProgressReport {
  return (change) => {
    runner?.(change);
    const detail = change.detail;
    if (detail === undefined) {
      return;
    }
    const running = host.state.get().tasks.running[task];
    if (running !== undefined) {
      host.state.dispatch({
        slice: 'tasks',
        type: 'run-changed',
        task: taskId(task),
        run: { ...running, progress: detail },
      });
    }
  };
}

function backupSourceOf(fields: Fields): BackupSource {
  const text = (name: string): string | null => (typeof fields[name] === 'string' ? fields[name] : null);
  return {
    connection: (text('connection') ?? '') as ConnectionId,
    database: text('database'),
    collection: text('collection'),
    format: (text('format') ?? 'archive') as Extract<TaskFormat, 'archive' | 'gzip' | 'plain'>,
  };
}

async function writeOutput(host: TaskHost, step: FileStep, run: WriteRun, task: string): Promise<WrittenOutput> {
  const content = step.content;
  if (content?.writer === 'transfer.export') {
    const args = content.args as unknown as ExportWriterArgs;
    const done = await writeExport(run, step.path, args);
    return { documents: done.documents, size: await sizeOf(step.path) };
  }
  const planned = await plannedBackup(host, backupSourceOf(fieldsOf(content?.args ?? null)), run.signal);
  const name = host.state.get().tasks.tasks.find((each) => each.id === task)?.name ?? task;
  const done = await writeBackup({ ...run, title: name }, step.path, planned.args);
  return {
    documents: done.documents,
    collections: done.collections,
    size: await sizeOf(step.path),
    ...(planned.note === undefined ? {} : { note: planned.note }),
  };
}

/** The write of a run: what it wrote goes in the book of runs; a failure there too, then thrown for the runner. */
interface Writing {
  readonly signal: AbortSignal;
  readonly task: string;
  readonly progress?: ProgressReport;
}

async function writeRun(host: TaskHost, step: FileStep, given: Writing): Promise<void> {
  const own = host.book.signal(given.task);
  const signal = own === undefined ? given.signal : AbortSignal.any([given.signal, own]);
  const run: WriteRun = { engines: host.engines(), signal, progress: progressOf(host, given.task, given.progress) };
  try {
    host.book.wrote(given.task, await writeOutput(host, step, run, given.task));
  } catch (error: unknown) {
    if (!signal.aborted) {
      host.book.failed(given.task, messageOf(error));
    }
    throw error;
  }
}

/** A delete of retention: only an output still of the kind recorded; what fails is kept, and the run goes on. */
async function deleteOutput(host: TaskHost, step: FileStep, task: string): Promise<void> {
  const folder = fieldsOf(step.content?.args ?? null)['folder'] === true;
  try {
    const found = await stat(step.path).catch(() => undefined);
    if (found === undefined || found.isDirectory() !== folder) {
      return;
    }
    await rm(step.path, { recursive: folder, force: true });
  } catch (error: unknown) {
    host.book.couldNotDelete(task, step.path, messageOf(error));
  }
}

/** Carries out a file step of a run of a task; false for a step of anything else. */
export async function carryOutTaskStep(
  host: TaskHost,
  step: FileStep,
  signal: AbortSignal,
  progress?: ProgressReport,
): Promise<boolean> {
  const task = stepTask(step);
  const writer = step.content?.writer;
  if (task === undefined || writer === undefined) {
    return false;
  }
  if (step.action === 'delete' && writer === retentionWriter) {
    await deleteOutput(host, step, task);
    return true;
  }
  if (step.action === 'write' && (writer === 'backup.create' || writer === 'transfer.export')) {
    await writeRun(host, step, { signal, task, ...(progress === undefined ? {} : { progress }) });
    return true;
  }
  return false;
}
