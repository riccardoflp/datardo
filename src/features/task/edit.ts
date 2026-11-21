/**
 * Feature: task.edit — the form of a task: what it saves, where, under which name, when, and how many outputs it
 * keeps; and the plan that saves it.
 *
 * The form is drawn in the Scheduled tasks page (`task.show`); its fields, their defaults, what is wrong with them,
 * the example name and the next runs are worked out here, and the window sends the form to {@link plan} to save it.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { connectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { defaultPattern, outputName, patternError, writesFolder } from './file-names';
import { nextTaskRun } from './due';
import { describeSchedule, hourChoices, nextRuns, parseTime, whenText } from './next-runs';
import { formatLabels, formText, planText, problemText } from './text';
import type {
  BackupFormat,
  ExportFormat,
  Schedule,
  ScheduledTask,
  TaskFormat,
  TaskId,
  TaskKind,
  TaskState,
} from './types';
import { appStep, argumentsOf, stateOf, taskById, taskId, tasksOf } from './types';
import { openForm } from './editing/form-request';

/** The formats of a backup, in the order the form lists them. */
export const backupFormats: readonly TaskFormat[] = ['archive', 'gzip', 'plain'] satisfies readonly BackupFormat[];

/** The formats of an export, in the order the form lists them. */
export const exportFormats: readonly TaskFormat[] = ['json', 'jsonl', 'csv'] satisfies readonly ExportFormat[];

/** The form of a task, as the window holds and sends it: every field as typed. */
export interface TaskForm {
  readonly name: string;
  readonly kind: TaskKind;
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly format: TaskFormat;
  readonly filter: string;
  readonly projection: string;
  readonly folder: string;
  readonly pattern: string;
  /** **Every few hours**, **Daily** or **Weekly**, with the fields of each kept while another is chosen. */
  readonly when: Schedule['kind'];
  readonly every: number;
  readonly time: string;
  readonly days: readonly number[];
  readonly keep: string;
  readonly runMissed: boolean;
  readonly notifySuccess: boolean;
  readonly enabled: boolean;
}

/** The fields of the form that can be wrong. */
export type FormField =
  | 'name'
  | 'connection'
  | 'database'
  | 'collection'
  | 'format'
  | 'filter'
  | 'projection'
  | 'folder'
  | 'pattern'
  | 'time'
  | 'days'
  | 'every'
  | 'keep';

/** What is wrong with the form, field by field, in the order of the form; empty when it can be saved. */
export type FormProblems = Partial<Record<FormField, string>>;

/** What a filter or a projection reads as: an object, another value, or text that does not parse. */
export type ObjectReading =
  { readonly kind: 'object' } | { readonly kind: 'other' } | { readonly kind: 'error'; readonly error: string };

/**
 * Reads a filter or a projection. Until `query.parse` is given, a text between `{` and `}` is taken as an object, and
 * anything else as another value.
 */
export function readByBraces(text: string): ObjectReading {
  const trimmed = text.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}') ? { kind: 'object' } : { kind: 'other' };
}

/** The source of a new task: what **Schedule…** was started on, or nothing for **New task…**. */
export interface TaskSource {
  readonly connection?: ConnectionId;
  readonly database?: string;
  readonly collection?: string;
}

/** What the source of the form is called in the default names: `shop.orders`, `shop`, `Local`, or empty. */
export function sourceWhat(
  form: Pick<TaskForm, 'connection' | 'database' | 'collection'>,
  connections: readonly ConnectionView[],
): string {
  if (form.database !== '' && form.collection !== '') {
    return `${form.database}.${form.collection}`;
  }
  if (form.database !== '') {
    return form.database;
  }
  return connections.find((each) => each.id === form.connection)?.name ?? '';
}

/** The default name of a task: `Back up shop`, `Export shop.orders`; `Backup` or `Export` without a source. */
export function defaultTaskName(kind: TaskKind, what: string): string {
  if (what === '') {
    return kind === 'backup' ? formText.noSource : formText.exportKind;
  }
  return kind === 'backup' ? formText.backUp(what) : formText.export(what);
}

/** The form of a new task: **Daily** at `02:00`, keep 7, enabled, with the source and the folder given. */
export function newTaskForm(source: TaskSource, connections: readonly ConnectionView[], folder: string): TaskForm {
  const fields = {
    connection: source.connection ?? '',
    database: source.database ?? '',
    collection: source.database === undefined ? '' : (source.collection ?? ''),
  };
  return {
    ...fields,
    name: defaultTaskName('backup', sourceWhat(fields, connections)),
    kind: 'backup',
    format: 'archive',
    filter: '',
    projection: '',
    folder,
    pattern: defaultPattern,
    when: 'daily',
    every: 6,
    time: '02:00',
    days: [1],
    keep: '7',
    runMissed: false,
    notifySuccess: false,
    enabled: true,
  };
}

/**
 * The form with another kind: a name still at its default follows (`Back up shop.orders` becomes `Export
 * shop.orders`), a name the user typed stays; the format becomes the kind's default when it is not one of its own.
 */
export function withKind(form: TaskForm, kind: TaskKind, connections: readonly ConnectionView[]): TaskForm {
  const what = sourceWhat(form, connections);
  const name = form.name === defaultTaskName(form.kind, what) ? defaultTaskName(kind, what) : form.name;
  const formats: readonly TaskFormat[] = kind === 'backup' ? backupFormats : exportFormats;
  const format = formats.includes(form.format) ? form.format : kind === 'backup' ? 'archive' : 'jsonl';
  return { ...form, kind, name, format };
}

/** The schedule the form says. */
export function scheduleOf(form: Pick<TaskForm, 'when' | 'every' | 'time' | 'days'>): Schedule {
  switch (form.when) {
    case 'hours':
      return { kind: 'hours', every: form.every, time: form.time };
    case 'daily':
      return { kind: 'daily', time: form.time };
    case 'weekly':
      return { kind: 'weekly', days: [...form.days].sort((first, second) => first - second), time: form.time };
  }
}

function objectProblem(text: string, label: string, read: (text: string) => ObjectReading): string | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const reading = read(text);
  switch (reading.kind) {
    case 'object':
      return undefined;
    case 'other':
      return problemText.notObject(label);
    case 'error':
      return problemText.parseError(label, reading.error);
  }
}

function sourceProblems(form: TaskForm): FormProblems {
  if (form.kind === 'backup') {
    return {
      ...(form.collection !== '' && form.database === '' ? { database: problemText.databaseOfCollection } : {}),
      ...(backupFormats.includes(form.format) ? {} : { format: problemText.backupFormat }),
    };
  }
  return {
    ...(form.database === '' ? { database: problemText.database } : {}),
    ...(form.collection === '' ? { collection: problemText.collection } : {}),
    ...(exportFormats.includes(form.format) ? {} : { format: problemText.exportFormat }),
  };
}

function queryProblems(form: TaskForm, read: (text: string) => ObjectReading): FormProblems {
  if (form.kind !== 'export') {
    return {};
  }
  const filter = objectProblem(form.filter, problemText.filter, read);
  const projection = objectProblem(form.projection, problemText.projection, read);
  return { ...(filter === undefined ? {} : { filter }), ...(projection === undefined ? {} : { projection }) };
}

function scheduleProblems(form: TaskForm): FormProblems {
  const pattern = patternError(form.pattern);
  const keep = Number(form.keep);
  return {
    ...(form.folder.trim() === '' ? { folder: problemText.folder } : {}),
    ...(pattern === undefined ? {} : { pattern }),
    ...(parseTime(form.time) === undefined ? { time: problemText.time } : {}),
    ...(form.when === 'weekly' && form.days.length === 0 ? { days: problemText.days } : {}),
    ...(form.when === 'hours' && !hourChoices.includes(form.every) ? { every: problemText.every } : {}),
    ...(/^\s*\d+\s*$/u.test(form.keep) && Number.isInteger(keep) ? {} : { keep: problemText.keep }),
  };
}

/** What is wrong with the form, field by field, in the order of the form. */
export function formProblems(form: TaskForm, read: (text: string) => ObjectReading = readByBraces): FormProblems {
  return {
    ...(form.name.trim() === '' ? { name: problemText.name } : {}),
    ...(form.connection === '' ? { connection: problemText.connection } : {}),
    ...sourceProblems(form),
    ...queryProblems(form, read),
    ...scheduleProblems(form),
  };
}

/** The example name under **File name**: `e.g. shop_2026-11-17_02-00-00.agz`; empty while the pattern is wrong. */
export function exampleName(form: TaskForm, connectionName: string, now: number): string {
  if (patternError(form.pattern) !== undefined) {
    return '';
  }
  const task = {
    pattern: form.pattern,
    format: form.format,
    ...(form.database === '' ? {} : { database: form.database }),
    ...(form.collection === '' ? {} : { collection: form.collection }),
  };
  return formText.example(outputName(task, now, connectionName));
}

/** The schedule and its next three runs: `Daily at 02:00. Next: today 02:00, …`; empty while it has none. */
export function schedulePreview(form: TaskForm, now: number): string {
  const schedule = scheduleOf(form);
  const next = nextRuns(schedule, now, 3);
  if (next.length === 0) {
    return '';
  }
  return formText.preview(describeSchedule(schedule), next.map((at) => whenText(at, now)).join(', '));
}

/** A new id that no task has, from the time: `t-<time in base 36>`, then `-2`, `-3`… */
export function newTaskId(now: number, taken: readonly string[]): TaskId {
  const base = `t-${Math.max(0, Math.floor(now)).toString(36)}`;
  let id = base;
  for (let suffix = 2; taken.includes(id); suffix += 1) {
    id = `${base}-${String(suffix)}`;
  }
  return taskId(id);
}

function optionalText(
  name: 'database' | 'collection' | 'filter' | 'projection',
  value: string,
): Record<string, string> {
  return value.trim() === '' ? {} : { [name]: value.trim() };
}

/**
 * The task the form saves. A new task, a task enabled again or a task whose schedule changed counts its runs from
 * `now`; any other change keeps when they counted from.
 */
export function taskFromForm(form: TaskForm, saving: TaskSaving): ScheduledTask {
  const schedule = scheduleOf(form);
  const old = saving.old;
  const since =
    old === undefined || (!old.enabled && form.enabled) || JSON.stringify(old.schedule) !== JSON.stringify(schedule)
      ? saving.now
      : old.since;
  return {
    id: saving.id,
    name: form.name.trim(),
    engine: saving.connection.engine,
    kind: form.kind,
    enabled: form.enabled,
    connection: saving.connection.id,
    ...optionalText('database', form.database),
    ...(form.database.trim() === '' ? {} : optionalText('collection', form.collection)),
    format: form.format,
    ...(form.kind === 'export'
      ? { ...optionalText('filter', form.filter), ...optionalText('projection', form.projection) }
      : {}),
    folder: form.folder.trim(),
    pattern: form.pattern,
    schedule,
    keep: Number(form.keep),
    runMissed: form.runMissed,
    notifySuccess: form.notifySuccess,
    since,
  };
}

/** What saving a form needs besides it: the id, the task it edits, the connection chosen, the time. */
export interface TaskSaving {
  readonly id: TaskId;
  readonly old?: ScheduledTask;
  readonly connection: ConnectionView;
  readonly now: number;
}

/** What the page says once the task is saved: its schedule, and its next run or that it is disabled. */
export function savedMessage(task: ScheduledTask, state: TaskState, now: number): string {
  const schedule = describeSchedule(task.schedule);
  const next = nextTaskRun(task, state);
  return next === undefined
    ? planText.savedDisabled(task.name, schedule)
    : planText.saved(task.name, schedule, whenText(next, now));
}

/** The form from what the window sent, or undefined when it is not one. */
export function formFromJson(value: unknown): TaskForm | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const form = value as Partial<TaskForm>;
  return typeof form.name === 'string' && (form.kind === 'backup' || form.kind === 'export')
    ? (value as TaskForm)
    : undefined;
}

/**
 * Feature: task.edit — `args` is `{ form, task }`: the fields of the form, and the task it edits (none for a new one).
 * The plan is `save the scheduled task "<name>"`, after which the page says what was saved and when it runs next.
 * Started without a form (**New task…**, **Schedule…**, **Edit**), it opens the page with the form instead.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = argumentsOf(answers);
  const form = formFromJson(args['form']);
  if (form === undefined) {
    return openForm(context, answers);
  }
  const first = Object.values(formProblems(form))[0];
  if (first !== undefined) {
    return refuse('task.edit/invalid', first);
  }
  const connection = savedConnection(context.state.connections, connectionId(form.connection));
  if (connection?.engine !== 'mongodb') {
    return refuse('task.edit/no-connection', problemText.connection);
  }
  const editing = typeof args['task'] === 'string' ? taskById(context.state, taskId(args['task'])) : undefined;
  const id =
    editing?.id ??
    newTaskId(
      context.now,
      tasksOf(context.state).tasks.map((each) => each.id),
    );
  const task = taskFromForm(form, {
    id,
    connection,
    now: context.now,
    ...(editing === undefined ? {} : { old: editing }),
  });
  const message = savedMessage(task, stateOf(tasksOf(context.state), id), context.now);
  return run({
    title: planText.save(task.name),
    steps: [appStep('task.save', { task: task as unknown as Json, message }, planText.save(task.name))],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoEdit },
    publishes: false,
    after: [],
  });
}

/** What the form is drawn from. */
export interface FormInput {
  readonly form: TaskForm;
  /** The name of the task edited; none for a new task. */
  readonly editing?: string;
  readonly connections: readonly ConnectionView[];
  /** The fields that lost the focus, or `all` once the form's button was pressed: only their problems are shown. */
  readonly touched: readonly FormField[] | 'all';
  readonly now: number;
}

/** A choice of a list of the form. */
export interface FormChoice {
  readonly value: string;
  readonly label: string;
}

/** The form of a task, as the page draws it. */
export interface FormView {
  readonly title: string;
  readonly button: string;
  readonly cancel: string;
  /** The saved MongoDB connections: a Redis connection is never offered. */
  readonly connections: readonly FormChoice[];
  readonly kindHint: string;
  readonly formats: readonly FormChoice[];
  /** Filter and projection are asked for an export only. */
  readonly asksQuery: boolean;
  readonly csvHint?: string;
  readonly example: string;
  readonly placeholders: string;
  /** The schedule and its next three runs; empty while the time or the days are wrong. */
  readonly preview: string;
  readonly localTime: string;
  /** `the last 7 files`, `the last 7 folders`. */
  readonly keeps: string;
  readonly keepHint: string;
  /** The problems of the fields touched. */
  readonly problems: FormProblems;
}

function shownProblems(problems: FormProblems, touched: FormInput['touched']): FormProblems {
  if (touched === 'all') {
    return problems;
  }
  return Object.fromEntries(Object.entries(problems).filter(([field]) => touched.includes(field as FormField)));
}

/** The form as the page draws it (`task.show`, its item 4). */
export function formView(input: FormInput): FormView {
  const { form, connections, now } = input;
  const problems = formProblems(form);
  const formats: readonly TaskFormat[] = form.kind === 'backup' ? backupFormats : exportFormats;
  const connectionName = connections.find((each) => each.id === form.connection)?.name ?? '';
  const keep = Number(form.keep);
  return {
    title: input.editing === undefined ? formText.newTitle : formText.editTitle(input.editing),
    button: input.editing === undefined ? formText.create : formText.save,
    cancel: formText.cancel,
    connections: connections
      .filter((each) => each.engine === 'mongodb')
      .map((each) => ({ value: each.id, label: each.name })),
    kindHint: form.kind === 'backup' ? formText.backupHint : formText.exportHint,
    formats: formats.map((format) => ({ value: format, label: formatLabels[format] })),
    asksQuery: form.kind === 'export',
    ...(form.kind === 'export' && form.format === 'csv' ? { csvHint: formText.csvHint } : {}),
    example: exampleName(form, connectionName, now),
    placeholders: formText.placeholders,
    preview: problems.time === undefined && problems.days === undefined ? schedulePreview(form, now) : '',
    localTime: formText.localTime,
    keeps: writesFolder(form) ? formText.keepFolders(keep) : formText.keepFiles(keep),
    keepHint: formText.keepHint,
    problems: shownProblems(problems, input.touched),
  };
}
