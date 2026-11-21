/**
 * `tasks/tasks.json`, the scheduled tasks, and `tasks/<id>.json`, the state of one task: the last scheduled time
 * handled, its last 20 runs and the outputs it wrote (data.md). Both at version 1.
 *
 * The shapes mirror those of `src/features/task/types.ts`, which this folder may not import (R1.3); a unit test keeps
 * the two the same. A field Datardo does not know is kept and written back, on each task and at the top of each file.
 * A task this version cannot read is kept as it is, written back and never run: a damaged task loses no other (RS4).
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineName, Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { JsonObject, StoredFile } from './store';

/** When a task runs, as stored. */
export type StoredSchedule =
  | { readonly kind: 'hours'; readonly every: number; readonly time: string }
  | { readonly kind: 'daily'; readonly time: string }
  | { readonly kind: 'weekly'; readonly days: readonly number[]; readonly time: string };

/** A scheduled task, as stored. */
export interface StoredTask {
  readonly id: string;
  readonly name: string;
  readonly engine: EngineName;
  readonly kind: 'backup' | 'export';
  readonly enabled: boolean;
  readonly connection: ConnectionId;
  readonly database?: string;
  readonly collection?: string;
  readonly format: 'archive' | 'gzip' | 'plain' | 'json' | 'jsonl' | 'csv';
  readonly filter?: string;
  readonly projection?: string;
  readonly folder: string;
  readonly pattern: string;
  readonly schedule: StoredSchedule;
  readonly keep: number;
  readonly runMissed: boolean;
  readonly notifySuccess: boolean;
  readonly since: number;
}

/** One run of a task, as stored. */
export interface StoredRun {
  readonly start: number;
  readonly end: number;
  readonly trigger: 'schedule' | 'manual' | 'missed';
  readonly status: 'done' | 'failed' | 'skipped' | 'cancelled' | 'missed';
  readonly output?: string;
  readonly size?: number;
  readonly documents?: number;
  readonly collections?: number;
  readonly error?: string;
  readonly note?: string;
  readonly deleted?: number;
}

/** An output of a task, as stored. */
export interface StoredOutput {
  readonly path: string;
  readonly at: number;
  readonly size: number;
  readonly folder: boolean;
}

/** The state of a task, as stored. */
export interface StoredTaskState {
  readonly lastSlot?: number;
  readonly runs: readonly StoredRun[];
  readonly outputs: readonly StoredOutput[];
  readonly running?: { readonly start: number; readonly trigger: StoredRun['trigger']; readonly slot?: number };
}

/** What `tasks/tasks.json` holds. */
export interface TasksFile {
  readonly tasks: readonly StoredTask[];
  /** The fields of each task that this version does not know, by id. */
  readonly unknown: Readonly<Record<string, JsonObject>>;
  /** The tasks this version cannot read, kept as they are. */
  readonly unreadable: readonly JsonObject[];
  /** The fields at the top of the file that this version does not know. */
  readonly rest: JsonObject;
}

/** No task saved. */
export const noTasks: TasksFile = { tasks: [], unknown: {}, unreadable: [], rest: {} };

const taskFields = new Set([
  'id',
  'name',
  'engine',
  'kind',
  'enabled',
  'connection',
  'database',
  'collection',
  'format',
  'filter',
  'projection',
  'folder',
  'pattern',
  'schedule',
  'keep',
  'runMissed',
  'notifySuccess',
  'since',
]);

const formats: readonly StoredTask['format'][] = ['archive', 'gzip', 'plain', 'json', 'jsonl', 'csv'];
const triggers: readonly StoredRun['trigger'][] = ['schedule', 'manual', 'missed'];
const statuses: readonly StoredRun['status'][] = ['done', 'failed', 'skipped', 'cancelled', 'missed'];

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(object: JsonObject, field: string): string | undefined {
  const value = object[field];
  return typeof value === 'string' ? value : undefined;
}

function number(object: JsonObject, field: string): number | undefined {
  const value = object[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`A scheduled task has no valid ${what}.`);
  }
  return value;
}

function oneOf<T extends string>(choices: readonly T[], value: string | undefined): T | undefined {
  return choices.find((each) => each === value);
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

/** A schedule; throws when it is not one. */
export function scheduleOf(value: Json | undefined): StoredSchedule {
  if (!isObject(value)) {
    throw new Error('A scheduled task has no schedule.');
  }
  const time = required(text(value, 'time'), 'time');
  switch (text(value, 'kind')) {
    case 'hours':
      return { kind: 'hours', every: required(number(value, 'every'), 'every'), time };
    case 'daily':
      return { kind: 'daily', time };
    case 'weekly': {
      const days = value['days'];
      return { kind: 'weekly', days: Array.isArray(days) ? days.filter((day) => typeof day === 'number') : [], time };
    }
    case undefined:
    default:
      throw new Error('A scheduled task has a schedule of no known kind.');
  }
}

function flag(object: JsonObject, field: string, fallback: boolean): boolean {
  const value = object[field];
  return typeof value === 'boolean' ? value : fallback;
}

/** One task of the file; throws when a field it needs is missing or wrong. */
export function taskOf(object: JsonObject): StoredTask {
  const engine = text(object, 'engine');
  const kind = text(object, 'kind');
  return {
    id: required(text(object, 'id'), 'id'),
    name: required(text(object, 'name'), 'name'),
    engine: required(engine === 'mongodb' || engine === 'redis' ? engine : undefined, 'engine'),
    kind: required(kind === 'backup' || kind === 'export' ? kind : undefined, 'kind'),
    enabled: flag(object, 'enabled', true),
    connection: required(text(object, 'connection'), 'connection') as ConnectionId,
    ...optional('database', text(object, 'database')),
    ...optional('collection', text(object, 'collection')),
    format: required(oneOf(formats, text(object, 'format')), 'format'),
    ...optional('filter', text(object, 'filter')),
    ...optional('projection', text(object, 'projection')),
    folder: required(text(object, 'folder'), 'folder'),
    pattern: required(text(object, 'pattern'), 'pattern'),
    schedule: scheduleOf(object['schedule']),
    keep: number(object, 'keep') ?? 0,
    runMissed: flag(object, 'runMissed', false),
    notifySuccess: flag(object, 'notifySuccess', false),
    since: number(object, 'since') ?? 0,
  };
}

function readTask(object: JsonObject): StoredTask | undefined {
  try {
    return taskOf(object);
  } catch {
    // A task this version cannot read is kept in `unreadable` and written back: no other task is lost (RS4).
    return undefined;
  }
}

function unknownOf(object: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([field]) => !taskFields.has(field)));
}

function readTasks(object: JsonObject): TasksFile {
  const list = object['tasks'] ?? [];
  if (!Array.isArray(list)) {
    throw new Error('tasks is not a list.');
  }
  const objects = (list as readonly Json[]).filter(isObject);
  const read = objects.map((each) => ({ object: each, task: readTask(each) }));
  const tasks = read.flatMap((each) => (each.task === undefined ? [] : [each.task]));
  return {
    tasks,
    unknown: Object.fromEntries(
      read.flatMap((each) => (each.task === undefined ? [] : [[each.task.id, unknownOf(each.object)]])),
    ),
    unreadable: read.flatMap((each) => (each.task === undefined ? [each.object] : [])),
    rest: Object.fromEntries(Object.entries(object).filter(([field]) => field !== 'tasks' && field !== 'version')),
  };
}

/** The kind of file `tasks/tasks.json` is. */
export const tasksFile: StoredFile<TasksFile> = {
  path: 'tasks/tasks.json',
  holds: 'The scheduled tasks',
  version: 1,
  migrations: {},
  empty: () => noTasks,
  read: readTasks,
  write: (value) => ({
    ...value.rest,
    tasks: [
      ...value.tasks.map((task) => ({ ...(value.unknown[task.id] ?? {}), ...(task as unknown as JsonObject) })),
      ...value.unreadable,
    ],
  }),
};

/** The file with the tasks changed, keeping what this version does not know of those that stay. */
export function withTasks(file: TasksFile, tasks: readonly StoredTask[]): TasksFile {
  const ids = new Set(tasks.map((each) => each.id));
  return {
    ...file,
    tasks,
    unknown: Object.fromEntries(Object.entries(file.unknown).filter(([id]) => ids.has(id))),
  };
}

function runOf(object: JsonObject): StoredRun | undefined {
  const start = number(object, 'start');
  const trigger = oneOf(triggers, text(object, 'trigger'));
  const status = oneOf(statuses, text(object, 'status'));
  if (start === undefined || trigger === undefined || status === undefined) {
    return undefined;
  }
  return {
    start,
    end: number(object, 'end') ?? start,
    trigger,
    status,
    ...optional('output', text(object, 'output')),
    ...optional('size', number(object, 'size')),
    ...optional('documents', number(object, 'documents')),
    ...optional('collections', number(object, 'collections')),
    ...optional('error', text(object, 'error')),
    ...optional('note', text(object, 'note')),
    ...optional('deleted', number(object, 'deleted')),
  };
}

function outputOf(object: JsonObject): StoredOutput | undefined {
  const path = text(object, 'path');
  const at = number(object, 'at');
  if (path === undefined || at === undefined) {
    return undefined;
  }
  return { path, at, size: number(object, 'size') ?? 0, folder: object['folder'] === true };
}

function listOf<T>(value: Json | undefined, read: (object: JsonObject) => T | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('A list of the state of a task is not a list.');
  }
  return (value as readonly Json[]).filter(isObject).flatMap((each) => {
    const item = read(each);
    return item === undefined ? [] : [item];
  });
}

function runningOf(value: Json | undefined): StoredTaskState['running'] {
  if (!isObject(value)) {
    return undefined;
  }
  const start = number(value, 'start');
  const trigger = oneOf(triggers, text(value, 'trigger'));
  return start === undefined || trigger === undefined
    ? undefined
    : { start, trigger, ...optional('slot', number(value, 'slot')) };
}

/** The state of a task that has never run. */
export const emptyStoredState: StoredTaskState = { runs: [], outputs: [] };

const safeId = /^[A-Za-z0-9_-]+$/u;

/** The kind of file the state of the task `id` is, `tasks/<id>.json`; throws for an id that is not a file name. */
export function taskStateFile(id: string): StoredFile<StoredTaskState> {
  if (!safeId.test(id) || id === 'tasks') {
    throw new Error(`The task id ${id} cannot name a file.`);
  }
  return {
    path: `tasks/${id}.json`,
    holds: 'The run log of a scheduled task',
    version: 1,
    migrations: {},
    empty: () => emptyStoredState,
    read: (object) => {
      const running = runningOf(object['running']);
      return {
        ...optional('lastSlot', number(object, 'lastSlot')),
        runs: listOf(object['runs'], runOf),
        outputs: listOf(object['outputs'], outputOf),
        ...(running === undefined ? {} : { running }),
      };
    },
    write: (value) => value as unknown as JsonObject,
  };
}

/**
 * Deletes the state of the task `id`, `tasks/<id>.json`, with the task (`task.delete`): its run log and its list of
 * outputs go with it, so that no later task deletes the files it wrote. A file already gone is no error.
 */
export async function deleteTaskState(folder: string, id: string): Promise<void> {
  const file = taskStateFile(id);
  await rm(join(folder, ...file.path.split('/')), { force: true });
}
