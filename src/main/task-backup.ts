/**
 * What a run of a backup task backs up, read just before it writes, as `backup.create` reads it for **Back up…**: the
 * databases of the connection except `admin`, `local` and `config`, or the task's database; their collections except
 * those whose name starts with `system.` (or the task's collection); the indexes and the counts of each. Time series
 * collections are left out, which the run's details say.
 */
import {
  archiveArgs,
  detailsRead,
  leaveOutTimeSeries,
  listRead,
  type BackupList,
  type BackupWriterArgs,
} from '../features/backup/create';
import { systemDatabases, type BackupChoice, type BackupDetails } from '../features/backup/types';
import { planText } from '../features/task/text';
import * as listDatabases from '../features/tree/list-databases';
import type { MongoDatabase } from '../features/tree/types';
import type { Json } from '../shared/engine-request';
import type { Context, ReadFeature } from '../shared/feature';
import { featureId, type ConnectionId } from '../shared/ids';
import type { Target } from '../shared/target';
import { appTarget } from '../shared/target';
import type { RunnerPorts } from '../runner/ports';
import { sendRead } from '../runner/read';
import type { TaskHost } from './task-host';

/** A run or a save that fails for a reason of its card, with its code (`task.run/nothing`) and its message. */
export class TaskFailure extends Error {
  /** Named after the card's refusal. */
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The source of a backup task, as its writer's arguments give it. */
export interface BackupSource {
  readonly connection: ConnectionId;
  readonly database: string | null;
  readonly collection: string | null;
  readonly format: BackupWriterArgs['format'];
}

/** What a backup task writes: the writer's arguments, and the note of the collections left out. */
export interface PlannedBackup {
  readonly args: BackupWriterArgs;
  readonly note?: string;
}

interface Reading {
  readonly ports: RunnerPorts;
  readonly context: Context;
  readonly signal: AbortSignal;
}

async function read(reading: Reading, feature: ReadFeature, args: Json): Promise<unknown> {
  const request = feature.request(reading.context, args);
  if (request.kind !== 'engine' && request.kind !== 'app') {
    throw new Error(`${feature.id} cannot be read for a scheduled task.`);
  }
  const replies = await sendRead(reading.ports, request, reading.signal);
  return feature.parse(replies, args);
}

async function databasesOf(reading: Reading, source: BackupSource): Promise<readonly string[]> {
  if (source.database !== null) {
    return [source.database];
  }
  const args = listDatabases.listDatabasesArgs(reading.context.state, source.connection);
  const listed = (await read(
    reading,
    { kind: 'read', id: featureId('tree.list-databases'), request: listDatabases.request, parse: listDatabases.parse },
    args,
  )) as readonly MongoDatabase[];
  return listed.map((each) => each.name).filter((name) => !systemDatabases.includes(name));
}

/** The collections the task backs up, before the time series are left out. */
function chosenOf(list: BackupList, source: BackupSource): BackupChoice {
  const choice = list.databases.map((each) => ({
    database: each.database,
    collections:
      source.collection === null
        ? each.collections
        : each.collections.filter((info) => info.name === source.collection),
  }));
  if (source.collection !== null && source.database !== null && choice.every((each) => each.collections.length === 0)) {
    throw new TaskFailure('task.run/no-collection', planText.noCollection(source.database, source.collection));
  }
  return choice;
}

function targetOf(source: BackupSource): Target {
  if (source.database === null) {
    return { kind: 'connection', connection: source.connection };
  }
  return source.collection === null
    ? { kind: 'database', connection: source.connection, database: source.database }
    : { kind: 'collection', connection: source.connection, database: source.database, collection: source.collection };
}

/** Reads what the backup of a task holds; throws with the card's message when there is nothing to back up. */
export async function plannedBackup(host: TaskHost, source: BackupSource, signal: AbortSignal): Promise<PlannedBackup> {
  const state = host.state.get();
  const context: Context = {
    feature: featureId('task.run'),
    now: host.now(),
    platform: host.platform,
    startedBy: 'task',
    target: appTarget,
    state,
  };
  const reading: Reading = { ports: await host.runner(), context, signal };
  const databases = await databasesOf(reading, source);
  const list = (await read(reading, listRead, {
    connection: source.connection,
    databases: [...databases],
  })) as BackupList;
  const { kept, left } = leaveOutTimeSeries(chosenOf(list, source));
  if (kept.every((each) => each.collections.length === 0)) {
    throw new TaskFailure('task.run/nothing', left.length > 0 ? planText.nothingTimeSeries : planText.nothingAtAll);
  }
  const collections = kept.flatMap((each) =>
    each.collections.map((info) => ({ database: each.database, collection: info.name, type: info.type })),
  );
  const details = (await read(reading, detailsRead, { connection: source.connection, collections })) as BackupDetails;
  const args = {
    ...archiveArgs(source.connection, targetOf(source), kept, { serverVersion: list.serverVersion, details }),
    format: source.format,
  };
  return { args, ...(left.length > 0 ? { note: planText.timeSeriesLeftOut(left.join(', ')) } : {}) };
}
