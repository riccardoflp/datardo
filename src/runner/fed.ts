/**
 * The steps whose documents come from a feed (`DocumentsFeed`): each batch the feed gives is sent as the step's
 * `insertMany` or `bulkWrite`, and **Cancel** is looked at between batches, never in the middle of one. The steps fed
 * from one archive are run together, so that the file is read once. What each batch did is counted for the message
 * that ends the plan (`FedTotals`), with the `_id`s inserted, which the undo history keeps.
 */
import { isFedStep, type FedStep, type FedStepTotals, type FedTotals } from '../features/backup/types';
import { counted } from '../features/transfer/text';
import type { Json, MongoRequest } from '../shared/engine-request';
import type { Step } from '../shared/feature';
import { Cancelled } from './cancel';
import { writeLog } from './log';
import type { FedBatch } from './ports';
import type { Running, StepEnded, StepObserver } from './steps';

/** The code of a write refused because its `_id` (or another unique key) already exists. */
const duplicateKey = 11000;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Looked at before each batch of a step: the undo history reads what the batch is about to replace. */
export type BeforeBatch = (step: FedStep, documents: readonly Json[]) => Promise<void>;

/**
 * What the runner counts of a plan with fed steps: the documents of each, the indexes the plan creates, and the `_id`s
 * inserted. It also watches the plan's steps, for the indexes.
 */
export class FedTally implements StepObserver {
  private readonly started: number;
  private readonly counts = new Map<number, Mutable<FedStepTotals>>();
  private created = 0;
  private readonly failedIndexes: { index: string; on: string; error: string }[] = [];
  private readonly ids = new Map<number, Json[]>();
  /** Called before each batch, when the undo history keeps what a batch replaces. */
  beforeBatch: BeforeBatch | undefined;

  /** Starts counting at `now`. */
  constructor(now: number) {
    this.started = now;
  }

  /** Nothing is looked at before a step. */
  readonly before = (): Promise<void> => Promise.resolve();

  /** After a step: an index created, or one that failed. */
  readonly after = (step: Step, _index: number, ended: StepEnded): Promise<void> => {
    if (step.kind === 'engine' && step.request.engine === 'mongodb' && step.request.method === 'createIndexes') {
      if (ended.kind === 'done') {
        this.created += 1;
      } else {
        const [indexes] = step.request.arguments;
        const first = Array.isArray(indexes) ? (indexes[0] as Readonly<Record<string, Json>> | undefined) : undefined;
        const name = typeof first?.['name'] === 'string' ? first['name'] : '';
        const error = ended.error instanceof Error ? ended.error.message : String(ended.error);
        this.failedIndexes.push({ index: name, on: step.request.collection ?? '', error });
      }
    }
    return Promise.resolve();
  };

  /** The counts of a fed step, made the first time. */
  countsOf(index: number, step: FedStep): Mutable<FedStepTotals> {
    let counts = this.counts.get(index);
    if (counts === undefined) {
      const request = step.request as MongoRequest;
      counts = {
        database: request.database,
        collection: request.collection ?? '',
        read: 0,
        inserted: 0,
        duplicates: 0,
        failed: 0,
      };
      this.counts.set(index, counts);
    }
    return counts;
  }

  /** Keeps the `_id`s a batch of a step inserted. */
  inserted(index: number, ids: readonly Json[]): void {
    this.ids.set(index, [...(this.ids.get(index) ?? []), ...ids]);
  }

  /** The `_id`s every fed step inserted, or those of one step. */
  insertedIds(index?: number): readonly Json[] {
    return index === undefined ? [...this.ids.values()].flat() : (this.ids.get(index) ?? []);
  }

  /** What was counted, once the plan ended. */
  totals(
    now: number,
    ended: { readonly kind: FedTotals['ended']; readonly error?: string },
    recorded: { readonly count: number; readonly not?: string },
  ): FedTotals {
    return {
      milliseconds: now - this.started,
      steps: [...this.counts.entries()].sort(([one], [other]) => one - other).map(([, counts]) => ({ ...counts })),
      indexes: { created: this.created, failed: [...this.failedIndexes] },
      ended: ended.kind,
      ...(ended.error === undefined ? {} : { error: ended.error }),
      recorded: recorded.count,
      ...(recorded.not === undefined ? {} : { notRecorded: recorded.not }),
    };
  }
}

/** The steps run with the fed step at `index`: the steps after it fed from the same archive, and itself. */
export function fedGroup(steps: readonly Step[], index: number): readonly number[] {
  const first = steps[index];
  if (first === undefined || !isFedStep(first) || first.feed.kind !== 'archive') {
    return [index];
  }
  const path = first.feed.path;
  const group: number[] = [];
  for (let at = index; at < steps.length; at += 1) {
    const step = steps[at];
    if (step === undefined || !isFedStep(step) || step.feed.kind !== 'archive' || step.feed.path !== path) {
      break;
    }
    group.push(at);
  }
  return group;
}

function idOf(document: Json): Json | undefined {
  return typeof document === 'object' && document !== null && !Array.isArray(document)
    ? (document as Readonly<Record<string, Json>>)['_id']
    : undefined;
}

/** The request of one batch: the step's own, with the batch's documents in place of its empty list. */
export function batchRequest(step: FedStep, documents: readonly Json[]): MongoRequest {
  const request = step.request as MongoRequest;
  const options = request.arguments[1] ?? {};
  if (request.method !== 'bulkWrite') {
    return { ...request, arguments: [documents, options] };
  }
  const operations = documents.map((document): Json => {
    const id = idOf(document);
    return id === undefined
      ? { insertOne: { document } }
      : { replaceOne: { filter: { _id: id }, replacement: document, upsert: true } };
  });
  return { ...request, arguments: [operations, options] };
}

/** What the server refused of a batch, from its error; none when the whole batch failed. */
interface Refused {
  readonly operations: readonly number[];
  readonly codes: readonly number[];
  readonly message: string;
}

function refusedOf(error: unknown): Refused | undefined {
  const facts = error as { failedOperations?: readonly number[]; failedCodes?: readonly number[] } | null;
  const operations = facts?.failedOperations ?? [];
  if (operations.length === 0) {
    return undefined;
  }
  const message = error instanceof Error ? error.message : String(error);
  return { operations, codes: facts?.failedCodes ?? [], message };
}

/** The `_id`s the server gave, by the index of the document, from the reply of an `insertMany`. */
function givenIds(reply: unknown): Readonly<Record<string, Json>> {
  const ids = (reply as { insertedIds?: unknown } | null)?.insertedIds;
  return typeof ids === 'object' && ids !== null ? (ids as Readonly<Record<string, Json>>) : {};
}

/** Counts what a batch did, from its reply or its error, and keeps the `_id`s it inserted. */
function countBatch(
  counts: Mutable<FedStepTotals>,
  documents: readonly Json[],
  ended: { readonly reply?: unknown; readonly refused?: Refused },
): readonly Json[] {
  const refused = new Set(ended.refused?.operations ?? []);
  const given = givenIds(ended.reply);
  counts.read += documents.length;
  counts.inserted += documents.length - refused.size;
  if (ended.refused !== undefined) {
    const { codes, message } = ended.refused;
    const duplicates = codes.filter((code) => code === duplicateKey).length;
    counts.duplicates += duplicates;
    counts.failed += refused.size - duplicates;
    counts.firstError ??= message;
    if (duplicates < refused.size) {
      counts.firstOtherError ??= message;
    }
  }
  return documents.flatMap((document, at) => {
    const id = idOf(document) ?? given[String(at)];
    return refused.has(at) || id === undefined ? [] : [id];
  });
}

/** Sends one batch: a whole batch that fails stops the plan; documents the server refused are counted. */
async function sendBatch(
  running: Running,
  step: FedStep,
  documents: readonly Json[],
): Promise<{ reply?: unknown; refused?: Refused }> {
  // The batch is sent whole even when Cancel is pressed meanwhile: the plan stops after it.
  const signal = new AbortController().signal;
  try {
    const reply = await running.ports.engines.send(
      { connection: step.connection, request: batchRequest(step, documents) },
      signal,
    );
    return { reply };
  } catch (error: unknown) {
    const refused = refusedOf(error);
    if (refused === undefined) {
      throw error;
    }
    return { refused };
  }
}

/** What the work in progress says after a batch of a step. */
function reportProgress(running: Running, step: FedStep, counts: FedStepTotals): void {
  const work = step.work;
  const done = counts.read + (work?.before ?? 0);
  if (work?.total !== undefined) {
    running.work.change({ title: work.title, done, total: work.total, unit: work.unit ?? '' });
    return;
  }
  const detail = `${counts.database}.${counts.collection}: ${counted(done, 'document')}`;
  running.work.change({ ...(work === undefined ? {} : { title: work.title }), detail });
}

/** Sends a batch to its step and counts it; stops after it when Cancel was pressed. */
async function sendFed(
  running: Running,
  group: { readonly steps: readonly FedStep[]; readonly indexes: readonly number[]; readonly tally: FedTally },
  batch: FedBatch,
): Promise<void> {
  const index = group.indexes[batch.feed];
  const step = group.steps[batch.feed];
  if (index === undefined || step === undefined) {
    return;
  }
  await group.tally.beforeBatch?.(step, batch.documents);
  const ended = await sendBatch(running, step, batch.documents);
  const counts = group.tally.countsOf(index, step);
  group.tally.inserted(index, countBatch(counts, batch.documents, ended));
  reportProgress(running, step, counts);
  if (running.work.signal.aborted) {
    throw new Cancelled();
  }
}

/**
 * Runs the fed steps at `indexes` of the plan: their feeds read together, each batch sent to its step, the documents
 * counted in `tally`. Cancelled between two batches.
 */
export async function runFed(
  running: Running,
  steps: readonly Step[],
  indexes: readonly number[],
  tally: FedTally,
): Promise<void> {
  const { ports, context, work } = running;
  const fed = indexes.map((index) => steps[index] as FedStep);
  const [first] = fed;
  if (first === undefined) {
    return;
  }
  if (ports.feeds === undefined) {
    throw new Error('Datardo cannot read the documents of this step.');
  }
  const connection = ports.connectionName(first.connection);
  writeLog(
    ports,
    fed.map((step) => ({ feature: context.feature, kind: 'step' as const, text: step.text, connection })),
  );
  if (first.work !== undefined) {
    work.change({ title: first.work.title });
  }
  for (const [at, index] of indexes.entries()) {
    tally.countsOf(index, fed[at] as FedStep);
  }
  try {
    for await (const batch of ports.feeds.read(
      fed.map((step) => step.feed),
      first.batches,
      work.signal,
    )) {
      await sendFed(running, { steps: fed, indexes, tally }, batch);
    }
  } catch (error: unknown) {
    // A feed whose reading was stopped by Cancel ends with its own error: the plan was cancelled.
    throw work.signal.aborted ? new Cancelled() : error;
  }
  if (work.signal.aborted) {
    throw new Cancelled();
  }
  writeLog(
    ports,
    indexes.map((index) => {
      const counts = tally.countsOf(index, steps[index] as FedStep);
      return {
        feature: context.feature,
        kind: 'outcome' as const,
        text: `${String(counts.inserted)} changed`,
        connection,
      };
    }),
  );
}
