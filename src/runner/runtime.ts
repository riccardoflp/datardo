/**
 * What the runner keeps while Datardo runs, for one set of ports: the work in progress, the queue of plans of each
 * connection and the events of redis-oplog waiting to be sent.
 */
import type { RunnerPorts } from './ports';
import { PublishQueue } from './oplog-queue';
import { ConnectionQueue } from './queue';
import { WorkRegistry } from './work';

/** The runner's own memory. */
export interface Runtime {
  readonly work: WorkRegistry;
  readonly queue: ConnectionQueue;
  /** The events of redis-oplog waiting to be sent, per MongoDB connection. */
  readonly publishing: PublishQueue;
}

const runtimes = new WeakMap<RunnerPorts, Runtime>();

/** The memory of the runner given these ports, made the first time it is asked for. */
export function runtimeOf(ports: RunnerPorts): Runtime {
  let runtime = runtimes.get(ports);
  if (runtime === undefined) {
    runtime = { work: new WorkRegistry(ports), queue: new ConnectionQueue(), publishing: new PublishQueue(ports) };
    runtimes.set(ports, runtime);
  }
  return runtime;
}
