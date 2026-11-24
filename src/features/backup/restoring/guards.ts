/**
 * What a restore (`backup.restore`) does not let a backup decide, since a backup may come from someone else (T5): the
 * system databases and invalid names a backup gives its databases, the TTL indexes of a backup on a collection that was
 * already there (the server would delete documents the restore did not bring), and the collections a view of the
 * backup replaces, which the confirmation names.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../../shared/feature';
import { connectionId, featureId } from '../../../shared/ids';
import { nameError } from '../../manage/name-rules';
import { argsOf, failureOf, textArg } from '../../tree/types';
import { restoreText as text } from '../text';
import { isJsonDocument, systemDatabases, type BackupDatabase, type JsonDocument } from '../types';

/**
 * Why a database of a backup is not restored under the name the backup gives it: `admin`, `local` and `config` in any
 * case (a system database) and a name MongoDB refuses; undefined when it can be.
 */
export function refusedDatabase(name: string): string | undefined {
  if (systemDatabases.includes(name.toLowerCase())) {
    return text.systemDatabase;
  }
  return nameError('database', name) === undefined ? undefined : text.invalidDatabase;
}

/** The databases of a backup that can be restored under their names, and the others with why: `admin (a system database)`. */
export function offeredDatabases(databases: readonly BackupDatabase[]): {
  readonly offered: readonly BackupDatabase[];
  readonly notOffered: readonly string[];
} {
  const offered = databases.filter((each) => refusedDatabase(each.name) === undefined);
  const notOffered = databases.flatMap((each) => {
    const why = refusedDatabase(each.name);
    return why === undefined ? [] : [`${each.name} (${why})`];
  });
  return { offered, notOffered };
}

/** Whether an index of a backup makes the server delete documents: it has `expireAfterSeconds`. */
export function isTtlIndex(index: JsonDocument): boolean {
  return index['expireAfterSeconds'] !== undefined && index['expireAfterSeconds'] !== null;
}

/** A number of Extended JSON (`{ $numberInt: "60" }`) or plain, as a number; NaN when it is not one. */
function numberOf(value: Json | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (isJsonDocument(value)) {
    const digits = value['$numberInt'] ?? value['$numberLong'] ?? value['$numberDouble'] ?? value['$numberDecimal'];
    return typeof digits === 'string' ? Number(digits) : Number.NaN;
  }
  return Number.NaN;
}

/** The key of an index as text, its numbers read the same whether they are `Int32`, `Double` or plain. */
function keyText(index: JsonDocument): string {
  const key = index['key'];
  if (!isJsonDocument(key)) {
    return '';
  }
  return JSON.stringify(
    Object.entries(key).map(([field, how]) => [field, Number.isNaN(numberOf(how)) ? how : numberOf(how)]),
  );
}

/** Whether a collection already has the TTL index of the backup: the same key and the same delay. */
export function hasSameTtl(index: JsonDocument, own: readonly JsonDocument[]): boolean {
  const delay = numberOf(index['expireAfterSeconds']);
  return own.some(
    (each) => isTtlIndex(each) && numberOf(each['expireAfterSeconds']) === delay && keyText(each) === keyText(index),
  );
}

/** How many indexes of a collection are read, and how long the server may take (R9.2; Datardo's choice). */
const mostIndexes = 1_000;
const indexesTimeLimitMs = 30_000;

/** The indexes of a collection, by `<database>.<collection>`, as `getIndexes()` gives them. */
export type OwnIndexes = Readonly<Record<string, readonly JsonDocument[]>>;

function namespacesOf(args: Json): readonly { readonly database: string; readonly collection: string }[] {
  const list = argsOf(args)['namespaces'];
  return (Array.isArray(list) ? (list as readonly Json[]) : []).map((each) => ({
    database: textArg(each, 'database'),
    collection: textArg(each, 'collection'),
  }));
}

/** `backup.restore:indexes`: `db.<collection>.getIndexes()` of each existing collection whose backup has a TTL index. */
export const indexesRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.restore:indexes'),
  request: (_context: Context, args: Json): ReadRequest => {
    const connection = connectionId(textArg(args, 'connection'));
    const requests = namespacesOf(args).map((each) => ({
      connection,
      request: {
        engine: 'mongodb',
        database: each.database,
        collection: each.collection,
        method: 'listIndexes',
        arguments: [],
        limit: mostIndexes,
        timeLimitMs: indexesTimeLimitMs,
      } as const,
    }));
    return { kind: 'engine', requests };
  },
  parse: (replies: readonly unknown[], args: Json): OwnIndexes =>
    Object.fromEntries(
      namespacesOf(args).map((each, index) => {
        const reply = replies[index];
        const failure = failureOf(reply);
        if (failure !== undefined) {
          throw new Error(failure);
        }
        const specs = (Array.isArray(reply) ? (reply as readonly Json[]) : []).filter(isJsonDocument);
        return [`${each.database}.${each.collection}`, specs];
      }),
    ),
};
