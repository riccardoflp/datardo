/**
 * Feature: key.copy
 *
 * Makes a copy of a key, with its value and its expiry, under another name or in another database of the same
 * server: `COPY orders:42 orders:42-old`, `COPY orders:42 orders:42 DB 1`, with `REPLACE` after **Replace**. `COPY` is
 * in Redis since 6.2; a server without it is refused, and nothing is put together from other commands in its place.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import type { Answers, Context, Danger, Outcome, ReadFeature } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { isVersionAtLeast } from '../connection/server-info';
import { databaseList } from './switch-database';
import { text } from './text';
import type { KeyName, KeysPlace, ReplyOutcome } from './types';
import {
  argsOf,
  databaseName,
  isErrorReply,
  isSameName,
  keyArgs,
  keysUndo,
  undoNote,
  nameOfText,
  nameText,
  notifySuccess,
  oneKeyRequest,
  parseExists,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  refusedReply,
  textOfName,
  writeStep,
} from './types';

/** The identifier of the read that says whether the destination exists, in the destination's database. */
export const existsReadId = 'key.copy:read';

/** Where the copy goes: its name and its database. */
export interface CopyDestination {
  readonly name: KeyName;
  readonly database: number;
}

function copyForm(context: Context, place: KeysPlace, name: KeyName, answers: Answers): Outcome {
  const list = databaseList(argsOf(answers), place.database);
  return ask({
    title: text.copy.form(nameText(name)),
    button: text.copy.button,
    fields: [
      { kind: 'text', key: 'to', label: text.copy.to, default: textOfName(name) ?? '' },
      {
        kind: 'pick-one',
        key: 'database',
        label: text.copy.database,
        choices: list.map((each) => ({ value: String(each.database), label: each.label })),
        default: String(place.database),
      },
    ],
  });
}

/** Whether the server has `COPY`: Redis 6.2 or later. */
export function hasCopy(context: Context, place: KeysPlace): boolean {
  const server = context.state.connections.live[place.connection.id]?.server;
  return server?.engine !== 'redis' || isVersionAtLeast(server.redisVersion, [6, 2]);
}

/** `COPY <key> <to> [DB <n>] [REPLACE]`. */
export function copyWords(
  place: KeysPlace,
  name: KeyName,
  to: CopyDestination,
  replaces: boolean,
): readonly (string | Uint8Array)[] {
  return [
    'COPY',
    name,
    to.name,
    ...(to.database === place.database ? [] : ['DB', String(to.database)]),
    ...(replaces ? ['REPLACE'] : []),
  ];
}

function replaceDanger(to: CopyDestination, undoLine: string): Danger {
  return {
    kind: 'confirm',
    text: [
      text.copy.replace(nameText(to.name), databaseName(to.database)),
      `${text.copy.replaceDetail} ${undoLine}`,
    ].join('\n'),
    button: text.copy.replaceButton,
  };
}

function copyPlan(
  context: Context,
  place: KeysPlace & { readonly key: KeyName },
  to: CopyDestination,
  replaces: boolean,
): Outcome {
  const name = place.key;
  const sameDatabase = to.database === place.database;
  const from = nameText(name);
  const target = nameText(to.name);
  return run({
    title: text.copy.title(from, sameDatabase ? target : databaseName(to.database)),
    steps: [writeStep(place, copyWords(place, name, to, replaces))],
    danger: replaces ? replaceDanger(to, undoNote(context, place, 1).line) : noDanger,
    undo: keysUndo(context, place, [to.name], to.database),
    publishes: false,
    after: [
      notifySuccess(
        sameDatabase ? text.copy.done(from, target) : text.copy.doneIn(from, target, databaseName(to.database)),
      ),
      refreshAfter(place),
    ],
  });
}

function destinationOf(place: KeysPlace, answers: Answers): CopyDestination | undefined {
  const typed = answers['to'];
  if (typeof typed !== 'string') {
    return undefined;
  }
  const database = Number(answers['database'] ?? place.database);
  return { name: nameOfText(typed), database: Number.isInteger(database) ? database : place.database };
}

/**
 * Feature: key.copy — the form **Copy orders:42**, `EXISTS <name>` on the destination's database, then `COPY`; when
 * the destination exists, with `REPLACE` after the confirmation **Replace**.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place?.key === undefined) {
    throw new Error('key.copy needs a key of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.copy/read-only', readOnlyMessage(place));
  }
  if (!hasCopy(context, place)) {
    return refuse('key.copy/unsupported', text.copy.noCopy);
  }
  const to = destinationOf(place, answers);
  if (to === undefined) {
    return copyForm(context, place, place.key, answers);
  }
  if (to.name.length === 0 || (to.database === place.database && isSameName(to.name, place.key))) {
    return refuse('key.copy/invalid', text.copy.different);
  }
  const exists = answers['exists'];
  if (typeof exists !== 'boolean') {
    return needRead('exists', existsReadId, keyArgs(place, to.name, to.database));
  }
  return copyPlan(context, { ...place, key: place.key }, to, exists);
}

/**
 * What the reply of `COPY` means: 0 refuses with `/not-copied`; `ERR unknown command` is a server without `COPY`
 * (`/unsupported`).
 */
export function afterReply(reply: RedisReply, name: KeyName, to: KeyName): ReplyOutcome {
  if (isErrorReply(reply) && /unknown command/iu.test(reply.message)) {
    return refusedReply('key.copy/unsupported', text.copy.noCopy);
  }
  return reply === 0
    ? refusedReply('key.copy/not-copied', text.copy.notCopied(nameText(name), nameText(to)))
    : { kind: 'done' };
}

/** `key.copy:read`: `EXISTS <name>` on the destination's database. */
export const read: ReadFeature = {
  kind: 'read',
  id: featureId(existsReadId),
  request: (_context: Context, args: Json) => oneKeyRequest('EXISTS', args),
  parse: parseExists,
};
