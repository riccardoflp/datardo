/**
 * Publishing the writes of a plan for redis-oplog (`runner.run`, step 5; `oplog.publish`): before an update or a
 * delete by filter, the `_id`s it matches; before and after a `bulkWrite`, the documents it may touch; after each
 * write, what it did (`effectOf`). Once the steps have run, `oplog.publish` turns each write into `PUBLISH` commands,
 * which go out in the background. Nothing here fails the plan: a read that fails leaves that write unpublished, and
 * says so in the Log.
 */
import { failedInsertIds } from '../features/undo/plans/record-args';
import { bulkWriteIds, effectOf, matchedIdsRequest, type WriteEffect } from '../features/oplog/publish';
import { oplogText } from '../features/oplog/text';
import { inScope } from '../features/oplog/scope';
import { oplogSettingsOf, publishingOf } from '../features/oplog/types';
import type { ConnectionRequest, Json, MongoRequest, RedisRequest } from '../shared/engine-request';
import type { Context, EngineStep, Plan, Step } from '../shared/feature';
import { featureId } from '../shared/ids';
import { savedConnection } from '../shared/state/connections';
import { decide } from './decide';
import { writeLog } from './log';
import { warnPublishing } from './oplog-queue';
import type { RunnerPorts } from './ports';
import { runtimeOf } from './runtime';
import type { StepEnded } from './steps';

const publishFeature = featureId('oplog.publish');

/** A step that writes to the documents of a collection. */
type DocumentWrite = EngineStep & { readonly request: MongoRequest & { readonly collection: string } };

/** What one write did, on its connection and collection. */
interface Written {
  readonly step: DocumentWrite;
  readonly effect: WriteEffect;
}

function documentsOf(reply: unknown): readonly Json[] {
  return Array.isArray(reply) ? (reply as readonly Json[]) : [];
}

function idsOf(documents: readonly Json[]): readonly Json[] {
  return documents.flatMap((document) => {
    const id =
      typeof document === 'object' && document !== null && !Array.isArray(document)
        ? (document as Readonly<Record<string, Json>>)['_id']
        : undefined;
    return id === undefined ? [] : [id];
  });
}

/** The writes of one plan, watched for redis-oplog. */
export class Publishing {
  private readonly before = new Map<number, readonly Json[]>();
  private readonly written: Written[] = [];

  private constructor(
    private readonly ports: RunnerPorts,
    private readonly context: Context,
    private readonly signal: AbortSignal,
  ) {}

  /** The watcher of a plan whose `publishes` is true; none for any other, or without the feature. */
  static of(ports: RunnerPorts, plan: Plan, context: Context, signal: AbortSignal): Publishing | undefined {
    return plan.publishes && ports.features.has(publishFeature) ? new Publishing(ports, context, signal) : undefined;
  }

  /** Whether a step writes to a collection whose writes are published, or would be but for a missing link. */
  private relevant(step: Step): DocumentWrite | undefined {
    if (step.kind !== 'engine' || !step.writes || step.request.engine !== 'mongodb') {
      return undefined;
    }
    const { database, collection } = step.request;
    const mongo = savedConnection(this.ports.state.get().connections, step.connection);
    if (collection === undefined || mongo?.engine !== 'mongodb' || mongo.publishesTo === undefined) {
      return undefined;
    }
    return inScope(oplogSettingsOf(mongo.oplog).scope, database, collection) ? (step as DocumentWrite) : undefined;
  }

  private async find(step: DocumentWrite, request: ConnectionRequest['request']): Promise<readonly Json[]> {
    return documentsOf(await this.ports.engines.send({ connection: step.connection, request }, this.signal));
  }

  private findByIds(step: DocumentWrite, ids: readonly Json[]): Promise<readonly Json[]> {
    const { database, collection } = step.request;
    return this.find(step, {
      engine: 'mongodb',
      database,
      collection,
      method: 'find',
      arguments: [{ _id: { $in: [...ids] } }],
    });
  }

  private failedRead(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    writeLog(this.ports, [
      { feature: publishFeature, kind: 'error', text: `read before publishing failed: ${message}` },
    ]);
  }

  /** Before a write: the `_id`s an update or a delete matches, or the documents a `bulkWrite` may touch. */
  async beforeStep(step: Step, index: number): Promise<void> {
    const write = this.relevant(step);
    if (write === undefined) {
      return;
    }
    try {
      if (write.request.method === 'bulkWrite') {
        this.before.set(index, await this.findByIds(write, bulkWriteIds(write.request)));
        return;
      }
      const matched = matchedIdsRequest(write.connection, write.request);
      if (matched !== undefined) {
        this.before.set(index, idsOf(await this.find(write, matched.request)));
      }
    } catch (error: unknown) {
      this.failedRead(error);
    }
  }

  /** After a write, done or failed: what it did. */
  async afterStep(step: Step, index: number, ended: StepEnded): Promise<void> {
    const write = this.relevant(step);
    if (write === undefined) {
      return;
    }
    try {
      const effect = await this.effectOf(write, index, ended);
      if (effect !== undefined && effect.kind !== 'none') {
        this.written.push({ step: write, effect });
      }
    } catch (error: unknown) {
      this.failedRead(error);
    }
  }

  private async effectOf(write: DocumentWrite, index: number, ended: StepEnded): Promise<WriteEffect | undefined> {
    const request = write.request;
    if (request.method === 'bulkWrite') {
      const before = this.before.get(index) ?? [];
      return { kind: 'changes', before, after: await this.findByIds(write, bulkWriteIds(request)) };
    }
    if (ended.kind === 'done') {
      return effectOf(request, (ended.reply ?? null) as Json, this.before.get(index) ?? []);
    }
    if (request.method !== 'insertOne' && request.method !== 'insertMany') {
      return undefined;
    }
    const failedOperations = (ended.error as { readonly failedOperations?: readonly number[] }).failedOperations;
    const failed = new Set(
      failedInsertIds(write, { kind: 'failed', failedOperations: failedOperations ?? [] }).map((id) =>
        JSON.stringify(id),
      ),
    );
    const all = request.method === 'insertOne' ? [request.arguments[0] ?? null] : documentsOf(request.arguments[0]);
    return { kind: 'inserted', ids: idsOf(all).filter((id) => !failed.has(JSON.stringify(id))) };
  }

  /** Once the steps have run: the `PUBLISH` commands of each write, queued to go out in the background. */
  async publish(): Promise<void> {
    for (const { step, effect } of this.written) {
      try {
        await this.publishOne(step, effect);
      } catch (error: unknown) {
        warnPublishing(this.ports, step.connection, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async publishOne(step: DocumentWrite, effect: WriteEffect): Promise<void> {
    const state = this.ports.state.get();
    const publishing = publishingOf(state, step.connection);
    if (publishing.kind === 'missing-link') {
      warnPublishing(this.ports, step.connection, oplogText.missingLink);
      return;
    }
    if (publishing.kind !== 'publishes') {
      return;
    }
    const { database, collection } = step.request;
    const decided = await decide(
      {
        ports: this.ports,
        context: {
          ...this.context,
          state,
          target: { kind: 'collection', connection: step.connection, database, collection },
        },
        signal: this.signal,
      },
      publishFeature,
      { args: { connection: step.connection, database, collection, effect: effect as unknown as Json } },
    );
    if (decided.kind !== 'plan') {
      return;
    }
    const requests = decided.plan.steps.flatMap((each): readonly RedisRequest[] =>
      each.kind === 'engine' && each.request.engine === 'redis' ? [each.request] : [],
    );
    runtimeOf(this.ports).publishing.enqueue(step.connection, publishing.linked.id, requests);
  }
}
