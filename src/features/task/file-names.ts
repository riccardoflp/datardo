/**
 * Feature: task.file-names — the name of the file or folder each run writes, from the task's file name pattern, and
 * which patterns are accepted.
 */
import { twoDigits } from './next-runs';
import { fileNameText, scheduleText } from './text';
import type { ScheduledTask, TaskFormat } from './types';

/** The pattern of a new task. */
export const defaultPattern = '{name}_{date}_{time}';

const placeholders: readonly string[] = [
  'name',
  'connection',
  'database',
  'collection',
  'date',
  'time',
  'YYYY',
  'MM',
  'DD',
  'HH',
  'mm',
  'ss',
  'weekday',
];

/** The placeholders that change from one run to another: a pattern needs one of them. */
const timePlaceholders = /\{(?:date|time|YYYY|MM|DD|HH|mm|ss|weekday)\}/u;

/** What the source of a task is called in its names. */
export interface PatternValues {
  /** The collection, else the database, else the connection's name. */
  readonly name: string;
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
}

/** Why a pattern cannot be used, or undefined when it can. */
export function patternError(pattern: string): string | undefined {
  if (pattern.trim() === '') {
    return fileNameText.empty;
  }
  if (/[\\/]/u.test(pattern)) {
    return fileNameText.separator;
  }
  const unknown = [...pattern.matchAll(/\{([^}]*)\}/gu)]
    .map((match) => match[1] ?? '')
    .find((placeholder) => !placeholders.includes(placeholder));
  if (unknown !== undefined) {
    return fileNameText.unknown(unknown);
  }
  return timePlaceholders.test(pattern) ? undefined : fileNameText.noDate;
}

/**
 * A name any system accepts as a file name: every run of `\ / : * ? " < > |` and white space becomes `_`, leading and
 * trailing `.` and `_` are removed, and an empty name is `output`.
 */
export function safeFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|\s]+/gu, '_').replace(/^[._]+|[._]+$/gu, '');
  return safe === '' ? fileNameText.fallback : safe;
}

/** The values of the placeholders at a moment, in local time. */
function timeValues(date: number): Readonly<Record<string, string>> {
  const at = new Date(date);
  const YYYY = String(at.getFullYear());
  const MM = twoDigits(at.getMonth() + 1);
  const DD = twoDigits(at.getDate());
  const HH = twoDigits(at.getHours());
  const mm = twoDigits(at.getMinutes());
  const ss = twoDigits(at.getSeconds());
  const weekday = scheduleText.weekdayNames[at.getDay()] ?? '';
  return { YYYY, MM, DD, HH, mm, ss, weekday, date: `${YYYY}-${MM}-${DD}`, time: `${HH}-${mm}-${ss}` };
}

/** The name of a run at `date` (milliseconds since 1970, shown in local time), without its extension. */
export function expandPattern(pattern: string, date: number, values: PatternValues): string {
  const parts: Readonly<Record<string, string>> = { ...values, ...timeValues(date) };
  const name = pattern.replace(/\{([^}]*)\}/gu, (all, key: string) => parts[key] ?? all);
  return safeFileName(name);
}

/** What a task's source is called: as **Back up…** and **Export collection…** name their files. */
export function patternValues(
  task: Pick<ScheduledTask, 'database' | 'collection'>,
  connectionName: string,
): PatternValues {
  return {
    name: task.collection ?? task.database ?? connectionName,
    connection: connectionName,
    database: task.database ?? '',
    collection: task.collection ?? '',
  };
}

/** Whether a task's format writes a folder rather than a file. */
export function writesFolder(task: Pick<ScheduledTask, 'kind' | 'format'>): boolean {
  return task.kind === 'backup' && task.format !== 'archive';
}

/** The extension of what a run writes: `.agz` for an archive, none for a folder backup, that of an export. */
export function outputExtension(format: TaskFormat): string {
  switch (format) {
    case 'archive':
      return '.agz';
    case 'gzip':
    case 'plain':
      return '';
    case 'json':
    case 'jsonl':
    case 'csv':
      return `.${format}`;
  }
}

/**
 * Feature: task.file-names — the name, with its extension, of what a run of the task writes when it starts at `date`
 * (milliseconds since 1970, in local time).
 */
export function outputName(
  task: Pick<ScheduledTask, 'pattern' | 'format' | 'database' | 'collection'>,
  date: number,
  connectionName: string,
): string {
  return expandPattern(task.pattern, date, patternValues(task, connectionName)) + outputExtension(task.format);
}

/**
 * The name with `_2`, `_3`… added before the extension while `isTaken` says the name exists: `shop_…_2.agz`.
 */
export function freeName(name: string, extension: string, isTaken: (candidate: string) => boolean): string {
  const base = extension !== '' && name.endsWith(extension) ? name.slice(0, -extension.length) : name;
  let candidate = name;
  for (let number = 2; isTaken(candidate); number += 1) {
    candidate = `${base}_${String(number)}${extension}`;
  }
  return candidate;
}
