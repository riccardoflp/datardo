/**
 * The events of redis-oplog, sent in the background after a write (`oplog.publish`): queued per MongoDB connection, so
 * that they go out in the order of the writes, in pipelines of at most 1,000 commands. A failure is a warning shown at
 * most every 30 seconds for each MongoDB connection (`oplog.publish-error`, R4.5); the write it follows stays done.
 */
import { publishPipeline } from '../features/oplog/publish';
import { view as publishError, withoutSecrets } from '../features/oplog/publish-error';
import type { RedisRequest } from '../shared/engine-request';
import { featureId, type ConnectionId } from '../shared/ids';
import { writeLog } from './log';
import { notify } from './notify';
import type { RunnerPorts } from './ports';

const publishFeature = featureId('oplog.publish');
const errorFeature = featureId('oplog.publish-error');

/** The commands of one batch, in pipelines of at most 1,000. */
function pipelines(requests: readonly RedisRequest[]): readonly (readonly RedisRequest[])[] {
  const out: RedisRequest[][] = [];
  for (let start = 0; start < requests.length; start += publishPipeline) {
    out.push(requests.slice(start, start + publishPipeline));
  }
  return out;
}

/**
 * Says that the events of a MongoDB connection could not be published: kept as its last error, written in the Log,
 * and shown as the warning of `oplog.publish-error` when none was shown for it in the last 30 seconds.
 */
export function warnPublishing(
  ports: RunnerPorts,
  mongo: ConnectionId,
  error: string,
  secrets: readonly string[] = [],
): void {
  const shown = publishError({
    oplog: ports.state.get().oplog,
    connection: mongo,
    name: ports.connectionName(mongo),
    error,
    secrets,
    now: ports.now(),
  });
  ports.state.dispatch(shown.event);
  if (shown.warning === undefined) {
    writeLog(ports, [{ feature: errorFeature, kind: 'error', text: withoutSecrets(error, secrets) }]);
    return;
  }
  notify(ports, { feature: errorFeature, level: 'warning', text: shown.warning.text });
}

/** The queues of the events of each MongoDB connection. */
export class PublishQueue {
  private readonly tails = new Map<ConnectionId, Promise<void>>();

  /** Made with the runner's ports, whose `oplog` sends the events. */
  constructor(private readonly ports: RunnerPorts) {}

  /** Sends the events of one write after those of the writes before it on the same MongoDB connection. */
  enqueue(mongo: ConnectionId, linked: ConnectionId, requests: readonly RedisRequest[]): void {
    if (requests.length === 0) {
      return;
    }
    const before = this.tails.get(mongo) ?? Promise.resolve();
    const tail = before.then(() => this.send(mongo, linked, requests));
    this.tails.set(mongo, tail);
    void tail.then(() => {
      if (this.tails.get(mongo) === tail) {
        this.tails.delete(mongo);
      }
    });
  }

  /** Resolves once every event queued so far has been sent or has failed: for the tests and at quit. */
  async idle(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }

  private async send(mongo: ConnectionId, linked: ConnectionId, requests: readonly RedisRequest[]): Promise<void> {
    const clients = this.ports.oplog;
    if (clients === undefined) {
      return;
    }
    try {
      for (const pipeline of pipelines(requests)) {
        await clients.send(mongo, linked, pipeline);
        writeLog(this.ports, [
          {
            feature: publishFeature,
            kind: 'info',
            text: `sent ${String(pipeline.length)} PUBLISH to ${this.ports.connectionName(linked)}`,
            connection: this.ports.connectionName(mongo),
          },
        ]);
      }
    } catch (error: unknown) {
      // The events of the failed batch are not sent again (oplog.publish-error); the write they follow stays done.
      warnPublishing(
        this.ports,
        mongo,
        error instanceof Error ? error.message : String(error),
        clients.secrets(linked),
      );
    }
  }
}
