/**
 * Feature: mcp.debugging-tools
 *
 * Follow what an application writes: the changes to MongoDB as they happen (`watch_changes`), the recent writes the
 * oplog keeps (`write_history`), and the writes made from Datardo itself, to documents and to keys, with what was
 * there before (`datardo_writes`, `datardo_write_details`). None writes: the change stream is closed before the
 * answer, the oplog is only read, and the undo history is only read, never undone.
 *
 * A change stream is read through the engine method `watch` (`WatchReply` of `tool/watch.ts`), which the MongoDB engine
 * must carry out: `runCommand` cannot follow a cursor, whose `getMore` must run in the session that opened it.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import {
  databaseAndCollection,
  intArg,
  listArg,
  requiredArg,
  stringArg,
  timeArg,
  toolConnection,
  toolTarget,
} from './arguments';
import { fittedItems, counted } from './output-limits';
import { mcpSettings } from './read-data';
import {
  changeEvents,
  oplogAuthSentence,
  oplogOperations,
  oplogRowText,
  spanText,
  timeOf,
  transactionHeading,
  writesFilter,
} from './tool/changes';
import { codeOf, deploymentOf, notAuthorized } from './tool/deployment';
import { listOf, mongoCall, recordOf, textIn, type MongoPlace } from './tool/mongo';
import { replyOrProblem, ToolProblem, type ToolSession } from './tool/program';
import { mongoshObject } from './tool/query';
import { booleanProp, connectionProp, endOf, groupOf, integerProp, filterProp } from './tool/schemas';
import {
  entryText,
  historyNotes,
  keptText,
  type UndoEntry,
  type UndoHistoryReply,
  type UndoWriteReply,
} from './tool/undo-writes';
import { isSystemCollection } from './tool/system-collections';
import { scopeText, watchChanges } from './tool/watch';
import { isFailed, mcpActions, type ToolCall, type ToolEnd, type ToolStep } from './types';

interface HistoryArgs {
  readonly database?: string;
  readonly collection?: string;
  readonly idText?: string;
  readonly id?: Json;
  readonly operations: readonly string[];
  readonly since?: number;
  readonly until?: number;
  readonly limit: number;
}

function historyArgs(session: ToolSession): HistoryArgs {
  const { args, context } = session;
  const sinceText = stringArg(args, 'since');
  const untilText = stringArg(args, 'until');
  const since = sinceText === undefined ? undefined : timeArg(sinceText, 'since', context.now);
  const until = untilText === undefined ? undefined : timeArg(untilText, 'until', context.now);
  if (since !== undefined && until !== undefined && since > until) {
    throw new ToolProblem('since is after until.');
  }
  const idText = stringArg(args, 'id');
  const id = idText === undefined ? undefined : mongoshObject({ v: `{ v: ${idText} }` }, 'v', context.now)?.['v'];
  if (idText !== undefined && id === undefined) {
    throw new ToolProblem('id must be a value in mongosh syntax: ObjectId("…"), "abc", 42, UUID("…").');
  }
  return {
    ...databaseAndCollection(args),
    ...(idText === undefined ? {} : { idText, ...(id === undefined ? {} : { id }) }),
    operations: listArg(args, 'operations', Object.keys(oplogOperations)),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    limit: intArg(args, 'limit', [50, 1, 500]),
  };
}

/** A namespace of a `system.*` collection, in any database. */
const systemNamespace = '^[^.]*\\.system\\.';

/** The filter of `write_history`, with its times, without the writes to the `system.*` collections. */
export function historyFilter(asked: HistoryArgs): Json {
  const codes = (asked.operations.length === 0 ? Object.keys(oplogOperations) : asked.operations).map(
    (each) => oplogOperations[each] ?? each,
  );
  const filter = recordOf(
    writesFilter(codes, {
      ...(asked.database === undefined ? {} : { database: asked.database }),
      ...(asked.collection === undefined ? {} : { collection: asked.collection }),
      ...(asked.id === undefined ? {} : { id: asked.id }),
    }),
  ) as Record<string, Json>;
  const ts: Record<string, Json> = {
    ...(asked.since === undefined ? {} : { $gte: { $timestamp: { t: Math.floor(asked.since / 1000), i: 0 } } }),
    ...(asked.until === undefined ? {} : { $lt: { $timestamp: { t: Math.floor(asked.until / 1000) + 1, i: 0 } } }),
  };
  // The writes to the system.* collections (users with their credentials, views…) are never read.
  const withoutSystem = { ...filter, ns: { $not: { $regularExpression: { pattern: systemNamespace, options: '' } } } };
  return Object.keys(ts).length === 0 ? withoutSystem : { ...withoutSystem, ts };
}

/**
 * Whether an operation of the oplog writes to a `system.*` collection: its namespace (`admin.system.users`), or the
 * collection a command names (`{ drop: "system.profile" }`).
 */
export function isSystemWrite(entry: Readonly<Record<string, unknown>>): boolean {
  const ns = textIn(entry['ns']) ?? '';
  const [target] = Object.values(recordOf(entry['o']));
  return (
    isSystemCollection(ns.slice(ns.indexOf('.') + 1)) ||
    (entry['op'] === 'c' && typeof target === 'string' && isSystemCollection(target))
  );
}

/**
 * The rows of the entries: each operation, those of a transaction under the heading of their entry; the writes to a
 * `system.*` collection are left out, and a transaction with nothing else left goes with them.
 */
export function oplogRows(entries: readonly Readonly<Record<string, unknown>>[]): readonly string[] {
  const rows: string[] = [];
  for (const entry of entries.filter((each) => !isSystemWrite(each))) {
    const all = listOf(recordOf(entry['o'])['applyOps']).map(recordOf);
    const inner = all.filter((each) => !isSystemWrite(each));
    if (entry['op'] === 'c' && all.length > 0) {
      const lines = inner.map((each) => oplogRowText({ ...each, ts: entry['ts'], wall: entry['wall'] }, true));
      if (lines.length > 0) {
        rows.push(`${timeOf(entry['wall'], entry['ts'])} ${transactionHeading(entry)}:\n${lines.join('\n')}`);
      }
    } else {
      rows.push(oplogRowText(entry, false));
    }
  }
  return rows;
}

function windowLines(first: unknown, last: unknown, asked: HistoryArgs): readonly string[] {
  const one = recordOf(listOf(first)[0]);
  const other = recordOf(listOf(last)[0]);
  if (one['ts'] === undefined || other['ts'] === undefined) {
    return ['The oplog is empty.'];
  }
  const from = timeOf(one['wall'], one['ts']);
  const to = timeOf(other['wall'], other['ts']);
  const older = asked.since !== undefined && asked.since < Date.parse(from);
  return [
    `Oplog window: ${from} → ${to} (${spanText(Date.parse(from), Date.parse(to))}).`,
    ...(older ? [`since is older than the oplog's first entry: the writes before ${from} are no longer there.`] : []),
  ];
}

function writeHistory(session: ToolSession): string {
  const asked = historyArgs(session);
  const connection = toolConnection(session, 'mongodb');
  const deployment = deploymentOf(session, connection);
  if (deployment.kind === 'mongos') {
    throw new ToolProblem(
      `${connection.name} is a sharded cluster (mongos): the oplog is on each shard. Use a connection to a shard's replica set, or watch_changes.`,
    );
  }
  if (deployment.kind === 'standalone') {
    throw new ToolProblem(
      `The oplog exists only on replica sets: ${connection.name} is a standalone server. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)`,
    );
  }
  const oplog: MongoPlace = { connection: connection.id, database: 'local', collection: 'oplog.rs' };
  const ends = { projection: { ts: 1, wall: 1 } };
  const [found, first, last] = session.send([
    mongoCall(oplog, 'find', [historyFilter(asked), { sort: { $natural: -1 } }], asked.limit + 1),
    mongoCall(oplog, 'find', [{}, { ...ends, sort: { $natural: 1 } }], 1),
    mongoCall(oplog, 'find', [{}, { ...ends, sort: { $natural: -1 } }], 1),
  ]);
  if ([found, first, last].some(notAuthorized)) {
    throw new ToolProblem(oplogAuthSentence(connection.name));
  }
  const timedOut = codeOf(found) === 50 || (isFailed(found) && /time limit|MaxTimeMSExpired/iu.test(found.message));
  if (timedOut) {
    throw new ToolProblem(
      'Reading the oplog took more than 30 s without finding a match: narrow it with since/until, collection or id.',
    );
  }
  const entries = listOf(replyOrProblem(found, 'Reading the oplog failed: ')).map(recordOf);
  const rows = oplogRows(entries.slice(0, asked.limit));
  const fitted = fittedItems(rows);
  const more = entries.length > asked.limit || fitted.left > 0;
  const conditions = [
    ...(asked.idText === undefined ? [] : [`_id ${asked.idText}`]),
    ...(asked.operations.length === 0 ? [] : [asked.operations.join('/')]),
    ...(asked.since === undefined ? [] : [`since ${new Date(asked.since).toISOString()}`]),
    ...(asked.until === undefined ? [] : [`until ${new Date(asked.until).toISOString()}`]),
  ];
  const scope = scopeText(connection.name, asked.database, asked.collection);
  const head = `Writes to ${scope}${conditions.length === 0 ? '' : ` (${conditions.join(', ')})`}, newest first: ${counted(fitted.shown.length, 'operation')}${more ? ' (there are older ones: lower until, or raise limit)' : ''}.`;
  return [
    head,
    ...(fitted.shown.length === 0 ? [] : ['', fitted.shown.join('\n')]),
    '',
    ...windowLines(isFailed(first) ? [] : first, isFailed(last) ? [] : last, asked),
  ].join('\n');
}

function historyOf(session: ToolSession): UndoHistoryReply {
  const reply = recordOf(replyOrProblem(session.app(mcpActions.undoHistory, {}), 'The undo history cannot be read: '));
  return { total: Number(reply['total'] ?? 0), entries: listOf(reply['entries']) as readonly UndoEntry[] };
}

function datardoWrites(session: ToolSession): string {
  const { args, context } = session;
  const saved = context.state.connections.saved;
  const connection = stringArg(args, 'connection') === undefined ? undefined : toolTarget(args, saved);
  const { database, collection } = databaseAndCollection(args);
  if (collection !== undefined && connection?.engine === 'redis') {
    throw new ToolProblem('collection is for MongoDB connections.');
  }
  const limit = intArg(args, 'limit', [20, 1, 200]);
  const matching = [...historyOf(session).entries]
    .sort((one, other) => other.at - one.at)
    .filter(
      (entry) =>
        (connection === undefined || entry.connection === connection.id) &&
        (database === undefined ||
          entry.database === database ||
          (entry.redisDatabase !== undefined &&
            (database === String(entry.redisDatabase) || database === `db${String(entry.redisDatabase)}`))) &&
        (collection === undefined || entry.collection === collection),
    );
  const where = [
    ...(connection === undefined ? [] : [`through ${connection.name}`]),
    ...(database === undefined ? [] : [`on ${database}${collection === undefined ? '' : `.${collection}`}`]),
  ].join(' ');
  const readData = mcpSettings(context.state.settings).readData;
  const head =
    matching.length === 0
      ? `No writes${where === '' ? '' : ` ${where}`} in the undo history.`
      : `${counted(matching.length, 'write')}${where === '' ? '' : ` ${where}`} in the undo history${matching.length > limit ? `, the newest ${String(limit)}` : ''} (newest first):`;
  return [
    head,
    ...matching.slice(0, limit).map((entry) => `- ${entryText(entry, readData)}`),
    '',
    ...historyNotes(context.state.settings, connection === undefined ? saved : [connection]),
  ].join('\n');
}

function datardoWriteDetails(session: ToolSession): string {
  const id = requiredArg(session.args, 'id');
  const limit = intArg(session.args, 'limit', [20, 1, 100]);
  const entry = historyOf(session).entries.find((each) => each.id === id);
  if (entry === undefined) {
    throw new ToolProblem(
      `No write ${id} in the undo history: use datardo_writes (it may have been removed by the history's limits).`,
    );
  }
  if (entry.undoneAt !== undefined) {
    throw new ToolProblem(
      `The write ${id} was undone on ${new Date(entry.undoneAt).toISOString().replace(/\.\d{3}Z$/u, 'Z')}: its documents are no longer kept.`,
    );
  }
  const reply = session.app(mcpActions.undoWrite, { id, limit });
  const kept = recordOf(replyOrProblem(reply, `The documents of ${id} can't be read: `)) as unknown as UndoWriteReply;
  return keptText(entry, kept);
}

const scopeProps = {
  connection: connectionProp,
  database: { type: 'string', description: 'Only this database.' },
  collection: { type: 'string', description: 'Only this collection (needs database).' },
} as const;

/** The tools of this group. */
export const group = groupOf('mcp.debugging-tools', [
  {
    name: 'watch_changes',
    title: 'Watch changes',
    description:
      'Opens a change stream on a collection, a database or the whole deployment, waits up to waitSeconds or until maxEvents changes, and returns them (time, operation, namespace, _id, fields set/unset, the document after and, when the collection records pre-images, before) with a resume token. Passing that token back as resumeAfter continues exactly where the previous call stopped. Needs a replica set or a sharded cluster.',
    properties: {
      ...scopeProps,
      waitSeconds: integerProp(0, 25, 10, 'How long to wait for changes.'),
      maxEvents: integerProp(1, 200, 50, 'Return as soon as this many changes arrived.'),
      resumeAfter: { type: 'string', description: 'The resume token of a previous call (its _data string).' },
      operationTypes: {
        type: 'array',
        items: { type: 'string', enum: changeEvents },
        description: 'Only these operations; empty for all.',
      },
      filter: { ...filterProp, description: 'A $match on the change event in mongosh syntax.' },
      since: {
        type: 'string',
        description: 'Also return the changes from this time on (ISO date, or "5m", "1h" ago). Not with resumeAfter.',
      },
      fullDocument: booleanProp(true, 'Include the whole document after an update (and before, with pre-images).'),
    },
    required: ['connection'],
    readsData: true,
    run: watchChanges,
  },
  {
    name: 'write_history',
    title: 'Write history',
    description:
      "The recent writes from the oplog (local.oplog.rs) of a replica set, newest first: time, operation, namespace, _id, the inserted document, an update's fields set and unset with their values, commands; the operations of a transaction under one heading; the oplog window at the end.",
    properties: {
      ...scopeProps,
      id: { type: 'string', description: 'Only writes to the document with this _id, in mongosh syntax.' },
      operations: {
        type: 'array',
        items: { type: 'string', enum: Object.keys(oplogOperations) },
        description: 'Only these operations; empty for all.',
      },
      since: { type: 'string', description: 'Only writes from this time on: ISO date, or "15m", "2h", "1d" ago.' },
      until: { type: 'string', description: 'Only writes up to this time: ISO date, or "15m", "2h", "1d" ago.' },
      limit: integerProp(1, 500, 50, 'Operations returned.'),
    },
    required: ['connection'],
    readsData: true,
    run: writeHistory,
  },
  {
    name: 'datardo_writes',
    title: "Datardo's writes",
    description:
      "The writes the user made from Datardo (its undo history), newest first: id, time (UTC), connection, database.collection or the Redis database, title, counts, undone or undo of. Writes of other clients aren't here. Pass an id to datardo_write_details for what was there before.",
    properties: { ...scopeProps, limit: integerProp(1, 200, 20, 'Writes returned.') },
    required: [],
    run: datardoWrites,
  },
  {
    name: 'datardo_write_details',
    title: "Before one of Datardo's writes",
    description:
      'What one write of the undo history kept, as it was before: documents updated and deleted in full, inserted by _id; keys by name, type, size and expiry. Take the id from datardo_writes.',
    properties: {
      id: { type: 'string', description: "The write's id, from datardo_writes." },
      limit: integerProp(1, 100, 20, 'Documents or keys returned.'),
    },
    required: ['id'],
    readsData: true,
    run: datardoWriteDetails,
  },
]);

/** Feature: mcp.debugging-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.debugging-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
