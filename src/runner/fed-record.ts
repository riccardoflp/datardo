/**
 * Recording in the undo history the plans whose documents come from feeds (`undo.record`), which name what they keep
 * in two ways `undo.record` does not read before the steps:
 *
 * - `{ kind: 'replaced', … }`, a copy that replaces matching documents: before each batch, the documents with the
 *   batch's `_id`s are read as they are; when what is kept passes the limits of the undo history, the question of
 *   `undo.record` is asked once, before that batch, and the copy goes on without undo or stops there;
 * - `{ kind: 'per-collection', operations }`, a restore that adds documents: one operation per collection, each
 *   keeping the `_id`s its step inserted.
 *
 * A plan that keeps `{ kind: 'inserted' }` is recorded as any other, with the `_id`s its fed steps inserted.
 */
import { isFedStep, type FedStep } from '../features/backup/types';
import { recordArgsJson } from '../features/undo/plans/record-args';
import { overLimitReason, withImages, withoutUndoQuestion, type RecordArgs } from '../features/undo/record';
import { beforeReadOf, keepRead, type BeforeRead } from '../features/undo/reads/keep';
import { keepsOf, operationId, undoSettings, type Keeps } from '../features/undo/types';
import type { Json, MongoRequest } from '../shared/engine-request';
import type { After, Context, Plan } from '../shared/feature';
import { connectionId, featureId } from '../shared/ids';
import { Cancelled } from './cancel';
import type { Hook } from './decide';
import { FedTally } from './fed';
import { writeLog } from './log';
import type { RunnerPorts } from './ports';
import { recordAfter, type Recorded } from './record';
import type { StepsOutcome } from './steps';

/** The feature that records an operation. */
const recordFeature = featureId('undo.record');

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

function textOf(fields: Fields, name: string): string {
  const value = fields[name];
  return typeof value === 'string' ? value : '';
}

/** What a plan keeps that the runner records itself: its kind and its fields; none for every other plan. */
export function fedKeeps(
  plan: Plan,
): { readonly kind: 'replaced' | 'per-collection'; readonly fields: Fields } | undefined {
  if (!('keeps' in plan.undo)) {
    return undefined;
  }
  const fields = fieldsOf(plan.undo.keeps);
  const kind = fields['kind'];
  return kind === 'replaced' || kind === 'per-collection' ? { kind, fields } : undefined;
}

let made = 0;

function newId(now: number): string {
  made = (made + 1) % 1296;
  return `${now.toString(36)}-f${made.toString(36).padStart(2, '0')}`;
}

/** A hook of `undo.record` on a collection, as the runner's own recording makes it. */
function hookOn(
  ports: RunnerPorts,
  context: Context,
  on: { connection: string; database: string; collection: string },
): Hook {
  return {
    ports,
    context: {
      ...context,
      target: {
        kind: 'collection',
        connection: connectionId(on.connection),
        database: on.database,
        collection: on.collection,
      },
      state: ports.state.get(),
    },
    signal: new AbortController().signal,
  };
}

/**
 * The documents a copy replaces, read before each batch while the undo history keeps them; `stopped` once they passed
 * its limits and the user chose to go on without undo.
 */
export class ReplacedImages {
  private read: BeforeRead = { kind: 'documents', docs: [] };
  private ids: Json[] = [];
  stopped: string | undefined;

  /** Kept for the plan's write, in its collection. */
  constructor(
    private readonly ports: RunnerPorts,
    private readonly context: Context,
    private readonly keeps: Fields,
    private readonly button: string,
  ) {}

  /** Before a batch: reads what it replaces, and asks when that passes the limits; closing the question cancels. */
  readonly beforeBatch = async (step: FedStep, documents: readonly Json[]): Promise<void> => {
    if (this.stopped !== undefined) {
      return;
    }
    const ids = documents.flatMap((document) => {
      const id = fieldsOf(document)['_id'];
      return id === undefined ? [] : [id];
    });
    const request = step.request as MongoRequest;
    const keeps: Keeps = { kind: 'ids', database: request.database, collection: request.collection ?? '', ids };
    const action = this.ports.appActions.get(keepRead);
    const reply: unknown = await action?.(
      { phase: 'before', connection: step.connection, keeps, limit: ids.length + 1 },
      new AbortController().signal,
    );
    const batch = beforeReadOf(reply) ?? { kind: 'failed', error: '' };
    const read = batch.kind === 'failed' ? batch : withImages(this.read, batch);
    const reason = overLimitReason(read, undoSettings(this.ports.state.get().settings));
    if (read.kind === 'failed' || reason !== undefined) {
      const question = withoutUndoQuestion(this.args(), read, reason);
      const answers = question.kind === 'ask' ? await this.ports.dialogs.ask(recordFeature, question.question) : {};
      if (answers === undefined) {
        throw new Cancelled();
      }
      this.stopped = read.kind === 'failed' ? read.error : (reason ?? '');
      return;
    }
    this.read = read;
    this.ids = [...this.ids, ...ids];
  };

  private args(): RecordArgs {
    const keeps: Keeps = {
      kind: 'ids',
      database: textOf(this.keeps, 'database'),
      collection: textOf(this.keeps, 'collection'),
      ids: this.ids,
    };
    return { title: textOf(this.keeps, 'title'), keeps, count: this.ids.length, action: this.button };
  }

  /** Saves the operation, once the steps ran; nothing when it stopped keeping. */
  async record(): Promise<Recorded | undefined> {
    if (this.stopped !== undefined || this.ids.length === 0) {
      return undefined;
    }
    const args = { ...this.args(), id: operationId(newId(this.ports.now())) };
    const hook = hookOn(this.ports, this.context, {
      connection: textOf(this.keeps, 'connection'),
      database: args.keeps.kind === 'ids' ? args.keeps.database : '',
      collection: args.keeps.kind === 'ids' ? args.keeps.collection : '',
    });
    const answers = { args: recordArgsJson(args), before: this.read as unknown as Json };
    return recordAfter({ kind: 'on', hook, answers }, { failedIds: [], insertedIds: [] });
  }
}

/** The collection of a fed step, as `<database>.<collection>`. */
function namespaceOf(step: FedStep): string {
  const request = step.request as MongoRequest;
  return `${request.database}.${request.collection ?? ''}`;
}

/**
 * A restore that adds documents: one operation per collection, each with the `_id`s its step inserted; a collection
 * whose step inserted nothing records nothing.
 */
export async function recordPerCollection(
  ports: RunnerPorts,
  context: Context,
  plan: Plan,
  tally: FedTally,
): Promise<readonly Recorded[]> {
  const operations = fieldsOf(fedKeeps(plan)?.fields)['operations'];
  const kept = Array.isArray(operations) ? (operations as readonly Json[]) : [];
  const recorded: Recorded[] = [];
  for (const [index, step] of plan.steps.entries()) {
    if (!isFedStep(step)) {
      continue;
    }
    const operation = kept.find((each) => {
      const keeps = keepsOf(each);
      return (
        keeps !== undefined &&
        keeps.kind !== 'keys' &&
        keeps.kind !== 'images' &&
        `${keeps.database}.${keeps.collection}` === namespaceOf(step)
      );
    });
    const ids = tally.insertedIds(index);
    const keeps = keepsOf(operation);
    // A collection of more documents than an operation keeps is not recorded, and nothing is asked about it.
    const most = undoSettings(ports.state.get().settings).maxDocumentsPerOperation;
    if (operation === undefined || keeps?.kind !== 'inserted' || ids.length === 0 || ids.length > most) {
      continue;
    }
    const args: RecordArgs = {
      title: textOf(fieldsOf(operation), 'title'),
      keeps: { ...keeps, ids },
      count: ids.length,
      id: operationId(newId(ports.now())),
      ...(plan.danger.kind === 'none' ? {} : { action: plan.danger.button }),
    };
    const hook = hookOn(ports, context, {
      connection: step.connection,
      database: keeps.database,
      collection: keeps.collection,
    });
    const decided = { kind: 'on' as const, hook, answers: { args: recordArgsJson(args) } };
    recorded.push(await recordAfter(decided, { failedIds: [], insertedIds: [] }));
  }
  return recorded;
}

/** What the runner keeps while a plan with fed steps runs: what counts it, and what reads what it replaces. */
export interface FedRun {
  readonly tally: FedTally;
  readonly replaced?: ReplacedImages;
}

/** The fed run of a plan; none for a plan without fed steps. */
export function fedRunOf(ports: RunnerPorts, plan: Plan, context: Context): FedRun | undefined {
  if (!plan.steps.some(isFedStep)) {
    return undefined;
  }
  const tally = new FedTally(ports.now());
  const keeps = fedKeeps(plan);
  const recording = undoSettings(ports.state.get().settings).enabled;
  if (keeps?.kind !== 'replaced' || !recording) {
    return { tally };
  }
  const button = plan.danger.kind === 'none' ? '' : plan.danger.button;
  const replaced = new ReplacedImages(ports, context, keeps.fields, button);
  tally.beforeBatch = replaced.beforeBatch;
  return { tally, replaced };
}

/** Records what the runner records itself of a fed run, once its steps ran. */
export async function recordFedRun(
  ports: RunnerPorts,
  context: Context,
  plan: Plan,
  fed: FedRun | undefined,
): Promise<readonly Recorded[]> {
  if (fed === undefined) {
    return [];
  }
  try {
    if (fed.replaced !== undefined) {
      const recorded = await fed.replaced.record();
      return recorded === undefined ? [] : [recorded];
    }
    return fedKeeps(plan)?.kind === 'per-collection' ? await recordPerCollection(ports, context, plan, fed.tally) : [];
  } catch (error: unknown) {
    // recordAfter warns of its own failures; anything else is written in the Log, and the write stays done (R4.5).
    const text = error instanceof Error ? error.message : String(error);
    writeLog(ports, [{ feature: recordFeature, kind: 'error', text: `failed: ${text}` }]);
    return [];
  }
}

/** The message that ends a fed run, from its feature's card; none when the main process gives none. */
export function fedSummaryOf(
  ports: RunnerPorts,
  ran: { readonly context: Context; readonly plan: Plan },
  fed: FedRun | undefined,
  ended: { readonly outcome: StepsOutcome; readonly recorded: number },
): readonly After[] | undefined {
  if (fed === undefined || ports.fedSummary === undefined) {
    return undefined;
  }
  const failed = ended.outcome.failed;
  const kind = ended.outcome.cancelledAfter !== undefined ? 'cancelled' : failed === undefined ? 'done' : 'failed';
  const error =
    failed === undefined ? undefined : failed.error instanceof Error ? failed.error.message : String(failed.error);
  const totals = fed.tally.totals(
    ports.now(),
    { kind, ...(error === undefined ? {} : { error }) },
    { count: ended.recorded, ...(fed.replaced?.stopped === undefined ? {} : { not: fed.replaced.stopped }) },
  );
  return ports.fedSummary(ran.context, ran.plan, totals);
}
