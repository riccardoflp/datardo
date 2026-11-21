/**
 * Opening the form of a task (`task.edit` started without a form): **New task…**, **Schedule…** on a connection, a
 * database or a collection, **Edit** and a double click on a task. The plan opens the Scheduled tasks page and keeps
 * the request until Datardo quits (`state.runner.remembered`), which the page reads to open its form once per
 * request: a new task of the source, in the folder of the last backup made by hand, or the task edited.
 */
import type { Json } from '../../../shared/engine-request';
import type { Answers, Context, Outcome, ReadFeature } from '../../../shared/feature';
import { needRead, noDanger, run } from '../../../shared/feature';
import { connectionId, featureId } from '../../../shared/ids';
import { savedConnection } from '../../../shared/state/connections';
import { pathRead } from '../../transfer/ask/choose-path';
import type { TaskForm, TaskSource } from '../edit';
import { planText } from '../text';
import type { ScheduledTask, TaskId } from '../types';
import { argumentsOf, taskById, taskId } from '../types';

/** The key the request is kept under, the identifier of the feature that makes it. */
export const formRequestKey = 'task.edit';

/** A request to open the form: when it was made, and the task it edits or the source and folder of a new one. */
export interface FormRequest {
  /** When it was made: the page opens each request once. */
  readonly asked: number;
  readonly task?: TaskId;
  readonly source: TaskSource;
  /** The folder of a new task: that of the last backup made by hand, else the home folder. */
  readonly folder: string;
}

function textOf(fields: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = fields[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The request kept, or undefined when there is none. */
export function formRequestOf(value: unknown): FormRequest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const fields = value as Readonly<Record<string, unknown>>;
  const asked = fields['asked'];
  if (typeof asked !== 'number') {
    return undefined;
  }
  const source = typeof fields['source'] === 'object' && fields['source'] !== null ? fields['source'] : {};
  const task = textOf(fields, 'task');
  return {
    asked,
    ...(task === undefined ? {} : { task: taskId(task) }),
    source: sourceOf(source as Readonly<Record<string, unknown>>),
    folder: textOf(fields, 'folder') ?? '',
  };
}

function sourceOf(fields: Readonly<Record<string, unknown>>): TaskSource {
  const connection = textOf(fields, 'connection');
  const database = textOf(fields, 'database');
  const collection = textOf(fields, 'collection');
  return {
    ...(connection === undefined ? {} : { connection: connectionId(connection) }),
    ...(database === undefined ? {} : { database }),
    ...(database === undefined || collection === undefined ? {} : { collection }),
  };
}

/**
 * The source of a new task: the connection, database and collection **Schedule…** was started on, from its arguments
 * or its target; nothing on a connection that is not MongoDB.
 */
export function requestedSource(context: Context, answers: Answers): TaskSource {
  const args = argumentsOf(answers);
  const target = context.target;
  const fromTarget: Readonly<Record<string, unknown>> =
    target.kind === 'connection' || target.kind === 'database' || target.kind === 'collection' ? target : {};
  const source = sourceOf(textOf(args, 'connection') === undefined ? fromTarget : args);
  const connection =
    source.connection === undefined ? undefined : savedConnection(context.state.connections, source.connection);
  return connection?.engine === 'mongodb' ? source : {};
}

/** The form of a task that exists, as it was saved. */
export function taskForm(task: ScheduledTask): TaskForm {
  const schedule = task.schedule;
  return {
    name: task.name,
    kind: task.kind,
    connection: task.connection,
    database: task.database ?? '',
    collection: task.collection ?? '',
    format: task.format,
    filter: task.filter ?? '',
    projection: task.projection ?? '',
    folder: task.folder,
    pattern: task.pattern,
    when: schedule.kind,
    every: schedule.kind === 'hours' ? schedule.every : 6,
    time: schedule.time,
    days: schedule.kind === 'weekly' ? schedule.days : [1],
    keep: String(task.keep),
    runMissed: task.runMissed,
    notifySuccess: task.notifySuccess,
    enabled: task.enabled,
  };
}

/** The read of the folder of a new task: the folder of the last backup made by hand, else the home folder. */
export const defaultFolderRead: ReadFeature = {
  kind: 'read',
  id: featureId('task.edit:default-folder'),
  request: (_context, args) => ({ kind: 'app', action: 'task.default-folder', args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : ''),
};

/** **Browse…** of the form: the system's folder dialog, which answers the path, or null when it was closed. */
export const folderDialog = pathRead('task.edit:folder', 'backup.choose-path');

function opened(request: Json | undefined): Outcome {
  return run({
    title: planText.openForm,
    steps: [],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoEdit },
    publishes: false,
    after: [
      ...(request === undefined ? [] : [{ kind: 'remember' as const, key: formRequestKey, value: request }]),
      { kind: 'open', page: 'tasks' },
    ],
  });
}

/**
 * The plan of `task.edit` started without a form: the page with the form of `args.task`, or of a new task of the
 * source it was started on, in the default folder.
 */
export function openForm(context: Context, answers: Answers): Outcome {
  const edited = textOf(argumentsOf(answers), 'task');
  if (edited !== undefined) {
    const task = taskById(context.state, taskId(edited));
    return opened(task === undefined ? undefined : { asked: context.now, task: task.id });
  }
  const folder = answers['folder'];
  if (typeof folder !== 'string') {
    return needRead('folder', defaultFolderRead.id);
  }
  const source = requestedSource(context, answers);
  return opened({ asked: context.now, source: { ...source }, folder });
}
