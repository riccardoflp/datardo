/**
 * A drop the script reached (`playground.writes`, D40): a collection that does not exist is sent unasked; otherwise
 * the run waits at that call while the destructive confirmation is open, with what the drop deletes read first.
 * **Drop** sends it; **Cancel** throws in the script; **Stop** closes the confirmation and sends nothing. Each answer
 * is written in the Log under **Playground**.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import {
  answerLine,
  cancelledMessage,
  dropPlan,
  existsRequest,
  type Drop,
  type DropFacts,
} from '../../features/playground/writes';
import { confirmationOf } from '../../runner/run';
import { writeLog } from '../../runner/log';
import { CallError, send, type RunContext } from './run-context';

const writesFeature = featureId('playground.writes');

/** The source of the Log lines of a run. */
export const logSource = 'Playground';

function countOf(value: Json): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  const fields = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
  const number = Number(
    (fields as Readonly<Record<string, Json>>)['$numberInt'] ??
      (fields as Readonly<Record<string, Json>>)['$numberLong'],
  );
  return Number.isFinite(number) ? number : undefined;
}

async function read(context: RunContext, request: MongoRequest): Promise<Json | undefined> {
  try {
    return await send(context, request);
  } catch {
    // What could not be read is left out of the confirmation, which then says only *This cannot be undone.*
    return undefined;
  }
}

async function collectionFacts(
  context: RunContext,
  drop: Extract<Drop, { kind: 'collection' }>,
): Promise<DropFacts | 'absent'> {
  const listed = await read(context, existsRequest(drop));
  if (Array.isArray(listed) && listed.length === 0) {
    return 'absent';
  }
  const [info] = Array.isArray(listed) ? (listed as readonly Json[]) : [];
  if ((info as { readonly type?: Json } | undefined)?.type === 'view') {
    return { kind: 'view' };
  }
  const on = { engine: 'mongodb' as const, database: drop.database, collection: drop.collection };
  const documents = await read(context, { ...on, method: 'estimatedDocumentCount', arguments: [] });
  const indexes = await read(context, { ...on, method: 'getIndexes', arguments: [] });
  const counted = documents === undefined ? undefined : countOf(documents);
  return {
    kind: 'collection',
    ...(counted === undefined ? {} : { documents: counted }),
    ...(Array.isArray(indexes) ? { indexes: indexes.length } : {}),
  };
}

async function databaseFacts(context: RunContext, database: string): Promise<DropFacts> {
  const listed = await read(context, { engine: 'mongodb', database, method: 'getCollectionNames', arguments: [] });
  return { kind: 'database', ...(Array.isArray(listed) ? { collections: listed.length } : {}) };
}

function confirmContext(context: RunContext, scriptDatabase: string): Context {
  const { ports, run } = context;
  return {
    feature: writesFeature,
    now: ports.now(),
    platform: ports.platform,
    startedBy: 'user',
    target: { kind: 'database', connection: run.connection, database: scriptDatabase },
    state: ports.state.get(),
  };
}

async function activateTab(context: RunContext): Promise<void> {
  const { ports, run } = context;
  if (ports.state.get().tabs.tabs.some((tab) => tab.id === run.tab)) {
    await ports.appActions.get('tab.activate')?.({ tab: run.tab }, context.signal);
  }
}

/** Waits for the answer, or for the run to be stopped, which closes the confirmation. */
function answered(context: RunContext, confirmed: Promise<boolean>): Promise<boolean> {
  const { signal, ports } = context;
  const stopped = (): void => {
    ports.dialogs.dismiss?.(writesFeature);
  };
  signal.addEventListener('abort', stopped, { once: true });
  return confirmed.finally(() => {
    signal.removeEventListener('abort', stopped);
  });
}

/** Asks about a drop, and sends it once confirmed; a cancelled drop throws in the script. */
export async function dropCall(
  context: RunContext,
  drop: Drop,
  request: MongoRequest,
  scriptDatabase: string,
): Promise<Json> {
  const facts =
    drop.kind === 'collection' ? await collectionFacts(context, drop) : await databaseFacts(context, drop.database);
  if (facts === 'absent') {
    return send(context, request);
  }
  const { ports, run } = context;
  const plan = dropPlan(drop, facts, { playground: run.title, connection: run.connection }, request);
  const confirmation = {
    ...confirmationOf(plan, confirmContext(context, scriptDatabase)),
    steps: [{ text: drop.step }],
  };
  await activateTab(context);
  ports.state.dispatch({ slice: 'playgrounds', type: 'run-waiting', tab: run.tab, waiting: true });
  let confirmed: boolean;
  try {
    confirmed = await answered(context, ports.dialogs.confirm(writesFeature, confirmation));
  } finally {
    ports.state.dispatch({ slice: 'playgrounds', type: 'run-waiting', tab: run.tab, waiting: false });
  }
  if (context.signal.aborted) {
    throw new CallError(cancelledMessage(drop));
  }
  writeLog(ports, [
    {
      feature: logSource,
      kind: 'info',
      text: answerLine(drop, confirmed ? 'confirmed' : 'cancelled'),
      connection: run.connection,
    },
  ]);
  if (!confirmed) {
    throw new CallError(cancelledMessage(drop));
  }
  return send(context, request);
}
