/**
 * What the runner keeps while Datardo runs, for one set of ports: the work in progress and the queue of plans of each
 * connection.
 */
import type { RunnerPorts } from './ports';
import { ConnectionQueue } from './queue';
import { WorkRegistry } from './work';

/** The runner's own memory. */
export interface Runtime {
  readonly work: WorkRegistry;
  readonly queue: ConnectionQueue;
}

const runtimes = new WeakMap<RunnerPorts, Runtime>();

/** The memory of the runner given these ports, made the first time it is asked for. */
export function runtimeOf(ports: RunnerPorts): Runtime {
  let runtime = runtimes.get(ports);
  if (runtime === undefined) {
    runtime = { work: new WorkRegistry(ports), queue: new ConnectionQueue() };
    runtimes.set(ports, runtime);
  }
  return runtime;
}
