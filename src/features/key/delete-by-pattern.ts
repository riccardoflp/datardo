/**
 * Feature: key.delete-by-pattern
 *
 * Deletes every key of a database that matches a pattern, and a type if one is chosen, however many they are. The
 * keys are counted first with `SCAN` as `key.scan` sends it, to the end (`key.delete-by-pattern:count`, which the main
 * process carries out with {@link afterCountPage}); a delete that can be recorded unlinks the names counted, one that
 * cannot scans again and unlinks what each reply returns. Never `KEYS`, `DEL` or `FLUSHDB`.
 */
import type { Json } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Answers, AppStep, Context, Outcome, ReadFeature, Step } from '../../shared/feature';
import { ask, needRead, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { groupThousands } from '../../shared/text-units';
import { stepText } from '../runner/step-text';
import { setting } from '../settings/read';
import { everyKey } from './pattern';
import type { ScanPage } from './scan';
import { scanCommand, scanCount } from './scan';
import { text } from './text';
import type { KeyName, KeysPlace, TypeFilter, UndoNote } from './types';
import {
  argsOf,
  databaseName,
  fieldsOf,
  hexOf,
  keysKept,
  knownTypes,
  namesOfHex,
  notifySuccess,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  stepsInBatches,
  typeFilterOf,
  typeLabel,
  undoNote,
} from './types';

/** The identifier of the count, an app read the main process carries out with `SCAN` to the end. */
export const countReadId = 'key.delete-by-pattern:count';

/** How many names one `UNLINK` holds (Datardo's choice). */
export const namesPerUnlink = 500;

/** What the count gives: the keys that match, their names when they are no more than the undo history keeps. */
export interface PatternCount {
  readonly found: number;
  /** What `DBSIZE` answered when the count started. */
  readonly total: number;
  readonly names?: readonly KeyName[];
}

/** A count in progress, as the main process folds the replies of `SCAN` into it. */
export interface CountProgress {
  readonly cursor: string;
  readonly calls: number;
  readonly found: number;
  /** The names, kept while they are no more than `keepAtMost`. */
  readonly names?: readonly KeyName[];
  readonly complete: boolean;
}

/** No call made: the names are kept from the start. */
export const countStart: CountProgress = { cursor: '0', calls: 0, found: 0, names: [], complete: false };

/** The count after one more reply of `SCAN`: the names are dropped once there are more than `keepAtMost`. */
export function afterCountPage(progress: CountProgress, page: ScanPage, keepAtMost: number): CountProgress {
  const found = progress.found + page.keys.length;
  const names = progress.names === undefined || found > keepAtMost ? undefined : [...progress.names, ...page.keys];
  return {
    cursor: page.cursor,
    calls: progress.calls + 1,
    found,
    ...(names === undefined ? {} : { names }),
    complete: page.cursor === '0',
  };
}

/** The work in progress of the count: *Counting the keys matching `session:*`: 1,200 found, about 40% scanned*. */
export function countingText(pattern: string, progress: CountProgress, total: number): string {
  const percent = total === 0 ? 100 : Math.min(100, Math.floor((progress.calls * scanCount * 100) / total));
  return text.deleteByPattern.counting(pattern, progress.found, percent);
}

/** What the form asks with: the pattern as the tab sent it, or the namespace's, and the tab's type. */
function patternForm(place: KeysPlace, args: Readonly<Record<string, unknown>>): Outcome {
  const pattern =
    typeof args['pattern'] === 'string' ? args['pattern'] : place.namespace === undefined ? '' : `${place.namespace}*`;
  return ask({
    title: text.deleteByPattern.form(databaseName(place.database)),
    button: text.deleteByPattern.count,
    fields: [
      {
        kind: 'text',
        key: 'pattern',
        label: text.deleteByPattern.pattern,
        default: pattern,
        rules: [{ kind: 'not-empty', message: text.deleteByPattern.empty }],
      },
      {
        kind: 'pick-one',
        key: 'type',
        label: text.deleteByPattern.type,
        choices: [
          { value: 'all', label: text.allTypes },
          ...knownTypes.map((type) => ({ value: type, label: typeLabel(type) })),
        ],
        default: typeFilterOf(args['type']),
      },
    ],
  });
}

/** The step of a delete that is not recorded: the scan again from cursor 0, and `UNLINK` after each reply. */
export function scanAndUnlinkStep(place: KeysPlace, pattern: string, type: TypeFilter): AppStep {
  const scan = stepText({
    kind: 'engine',
    connection: place.connection.id,
    request: redisCommand(place.database, ...scanCommand({ database: place.database, pattern, type, cursor: '0' })),
    writes: false,
  });
  return {
    kind: 'app',
    action: 'key.unlink-scanned',
    args: { connection: place.connection.id, database: place.database, pattern, type },
    text: text.deleteByPattern.scanStep(scan),
  };
}

/** What the delete is asked with: the pattern and the type. */
interface Asked {
  readonly pattern: string;
  readonly type: TypeFilter;
}

function confirmation(place: KeysPlace, asked: Asked, count: PatternCount, note: UndoNote): string {
  const database = databaseName(place.database);
  const question =
    asked.pattern === everyKey && asked.type === 'all'
      ? text.deleteByPattern.questionAll(database, place.connection.name)
      : text.deleteByPattern.question(asked.pattern, database, place.connection.name);
  return [
    question,
    text.deleteByPattern.match(count.found, count.total, database),
    ...(note.recorded ? [] : [text.deleteByPattern.matchingToo]),
    note.line,
  ].join('\n');
}

function deletePlan(context: Context, place: KeysPlace, asked: Asked, count: PatternCount): Outcome {
  const note = undoNote(context, place, count.found);
  const names = note.recorded ? count.names : undefined;
  const recorded = names !== undefined;
  const steps: readonly Step[] =
    names === undefined
      ? [scanAndUnlinkStep(place, asked.pattern, asked.type)]
      : stepsInBatches(place, 'UNLINK', names, namesPerUnlink);
  return run({
    title: text.deleteByPattern.title(asked.pattern),
    steps,
    danger: {
      kind: 'destructive',
      text: confirmation(place, asked, count, { recorded, line: note.line }),
      button: text.deleteByPattern.button(count.found),
      name: asked.pattern,
    },
    touches: `${groupThousands(count.found)} ${count.found === 1 ? 'key' : 'keys'}`,
    undo: names === undefined ? { cannot: note.line } : keysKept(place.database, names),
    publishes: false,
    after: [
      notifySuccess(text.deleteByPattern.done(count.found, asked.pattern, databaseName(place.database))),
      refreshAfter(place),
    ],
  });
}

/**
 * Feature: key.delete-by-pattern — the form **Delete by pattern in db0** (what is typed is sent as it is), the count,
 * then the destructive confirmation, whose name to type is the pattern.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.delete-by-pattern needs a database of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.delete-by-pattern/read-only', readOnlyMessage(place));
  }
  if (typeof answers['pattern'] !== 'string') {
    return patternForm(place, argsOf(answers));
  }
  const asked = { pattern: answers['pattern'], type: typeFilterOf(answers['type']) };
  if (asked.pattern === '') {
    return refuse('key.delete-by-pattern/invalid', text.deleteByPattern.empty);
  }
  const count = countOf(answers['count']);
  if (count === undefined) {
    const keepAtMost = undoNote(context, place, 0).recorded ? undoLimit(context) : 0;
    return needRead('count', countReadId, {
      connection: place.connection.id,
      database: place.database,
      ...asked,
      keepAtMost,
    });
  }
  if (count.found === 0) {
    return refuse('key.delete-by-pattern/nothing', text.deleteByPattern.nothing(asked.pattern));
  }
  return deletePlan(context, place, asked, count);
}

function undoLimit(context: Context): number {
  return setting(context.state.settings, 'datardo.undo.maxDocumentsPerOperation');
}

/** The count as the read gave it: `{ found, total, names? }`, the names in hexadecimal. */
export function countOf(value: unknown): PatternCount | undefined {
  const fields = fieldsOf(value);
  if (typeof fields['found'] !== 'number') {
    return undefined;
  }
  return {
    found: fields['found'],
    total: typeof fields['total'] === 'number' ? fields['total'] : fields['found'],
    ...(Array.isArray(fields['names']) ? { names: namesOfHex(fields['names']) } : {}),
  };
}

/** The count as the main process answers it, the names in hexadecimal. */
export function countResult(progress: CountProgress, total: number): Json {
  return {
    found: progress.found,
    total,
    ...(progress.names === undefined ? {} : { names: progress.names.map(hexOf) }),
  };
}

/** `key.delete-by-pattern:count`: an app read, `key.scan-all`, which scans to the end with **Cancel**. */
export const read: ReadFeature = {
  kind: 'read',
  id: featureId(countReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'key.scan-all', args }),
  parse: (replies) => replies[0],
};
