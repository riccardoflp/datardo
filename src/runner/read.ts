/**
 * Sends what a Read asks for (`runner.run`, "read"): to Datardo's own data through an app action, or to the engines,
 * one request after the other, each failure ending the read or given to `parse` as a reply when the Read asks so.
 */
import { withoutSecrets } from '../features/runner/error';
import type { ReadRequest } from '../shared/feature';
import type { ConnectionRequest } from '../shared/engine-request';
import { Cancelled } from './cancel';
import type { RunnerPorts } from './ports';

/** The replies of a read's requests, in order. */
export async function sendRead(ports: RunnerPorts, request: ReadRequest, signal: AbortSignal): Promise<unknown[]> {
  if (request.kind === 'app') {
    const action = ports.appActions.get(request.action);
    if (action === undefined) {
      throw new Error(`Datardo has no action named ${request.action}.`);
    }
    return [await action(request.args, signal)];
  }
  const replies: unknown[] = [];
  for (const each of request.requests) {
    replies.push(
      request.failedRequests === 'are-replies'
        ? await replyOrFailure(ports, each, signal)
        : await ports.engines.send(each, signal),
    );
  }
  return replies;
}

/**
 * The reply of one request, or its failure as `{ kind: 'error', message }` for a Read that takes failures as replies
 * (`failedRequests: 'are-replies'`): the server's message, without secrets. A cancelled read still ends.
 */
async function replyOrFailure(ports: RunnerPorts, request: ConnectionRequest, signal: AbortSignal): Promise<unknown> {
  try {
    return await ports.engines.send(request, signal);
  } catch (error: unknown) {
    if (signal.aborted) {
      throw new Cancelled();
    }
    // The read asked for its failures: its `parse` says what each one means, and the next request goes on.
    return { kind: 'error', message: withoutSecrets(error instanceof Error ? error.message : String(error)) };
  }
}
