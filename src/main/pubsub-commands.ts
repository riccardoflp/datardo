/**
 * What the Pub/Sub pages add around the runner, in the main process: the `SUBSCRIBE` and `PSUBSCRIBE` sent to a
 * page's client are watched, so that a subscription is shown answered once the server confirms it, or leaves the list
 * with the server's error under the field (`pubsub.subscribe`); the reply of `PUBLISH` says how many clients received
 * the message (`pubsub.publish`); **Reconnect now** tries at once (`pubsub.reconnect`); and the file of an export is
 * written from the rows its plan names (`pubsub.export`).
 */
import type { Intent, IntentResult } from '../shared/bridge';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import { targetConnection } from '../shared/target';
import { jsonFields } from '../features/connection/types';
import { exportedText } from '../features/pubsub/export';
import { lastChannelKey, publishedText } from '../features/pubsub/publish';
import { pageWithAnswered, pageWithRefused, subscribeError } from '../features/pubsub/subscribe';
import { text } from '../features/pubsub/text';
import { keptRows, pubsubOwner, rowsNumbered, type NamedSubscription } from '../features/pubsub/types';
import type { EngineService } from '../engines';
import type { RunnerPorts } from '../runner/ports';
import { notify } from '../runner/notify';
import { startWithConsoles } from './console-commands';
import { changePage, pageNow, pubsubStarted, subscribeAgain } from './pubsub';

const decoder = new TextDecoder();

/** The connections a publish was started on from the window, with the reply of its `PUBLISH` once it came. */
const publishing = new Map<ConnectionId, { clients?: number }>();

/** The names of a `SUBSCRIBE` or a `PSUBSCRIBE`, with their kind; none for another command. */
function subscribedNames(command: readonly Uint8Array[]): readonly NamedSubscription[] | undefined {
  const name = decoder.decode(command[0] ?? new Uint8Array()).toUpperCase();
  const kind = name === 'SUBSCRIBE' ? 'channel' : name === 'PSUBSCRIBE' ? 'pattern' : undefined;
  return kind === undefined ? undefined : command.slice(1).map((each) => ({ kind, name: each }));
}

function isPublish(command: readonly Uint8Array[]): boolean {
  return decoder.decode(command[0] ?? new Uint8Array()).toUpperCase() === 'PUBLISH';
}

/** Sends a `SUBSCRIBE` or a `PSUBSCRIBE` of a page, and shows its names answered, or refused with the error. */
async function watchedSubscribe(
  send: () => Promise<unknown>,
  connection: ConnectionId,
  names: readonly NamedSubscription[],
): Promise<unknown> {
  try {
    const reply = await send();
    changePage(connection, (page) => ({
      ...pageWithAnswered(page, names),
      // A page coming back after its connection closed opens with the row of the gap (`pubsub.reconnect`).
      pageConnection:
        page.pageConnection === 'connecting' && page.disconnectedAt === undefined ? 'open' : page.pageConnection,
    }));
    return reply;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    changePage(connection, (page) => ({ ...pageWithRefused(page, names), fieldError: subscribeError(names, message) }));
    throw error;
  }
}

/** The engines as the runner uses them, with the commands of the Pub/Sub pages watched. */
export function withPubSub(engines: EngineService): EngineService {
  return {
    ...engines,
    send: async (request, signal) => {
      if (request.request.engine !== 'redis') {
        return engines.send(request, signal);
      }
      const owner = pubsubOwner(request.connection);
      const names = owner === undefined ? undefined : subscribedNames(request.request.command);
      if (owner !== undefined && names !== undefined && pageNow(owner) !== undefined) {
        return watchedSubscribe(() => engines.send(request, signal), owner, names);
      }
      const reply = await engines.send(request, signal);
      const publish = publishing.get(request.connection);
      if (publish !== undefined && isPublish(request.request.command) && typeof reply === 'number') {
        publish.clients = reply;
      }
      return reply;
    },
  };
}

function rememberedChannel(ports: RunnerPorts, connection: ConnectionId): string {
  const remembered = jsonFields(ports.state.get().runner.remembered[lastChannelKey])[connection];
  return typeof remembered === 'string' ? remembered : '';
}

/**
 * `pubsub.publish`: the notification says how many clients the server says received the message, and the page keeps
 * the channel for the next **Publish…**.
 */
async function publish(ports: RunnerPorts, intent: Intent, connection: ConnectionId): Promise<IntentResult> {
  const watched: { clients?: number } = {};
  publishing.set(connection, watched);
  const result = await startWithConsoles(ports, intent).finally(() => {
    publishing.delete(connection);
  });
  if (result.kind === 'done' && watched.clients !== undefined) {
    const channel = rememberedChannel(ports, connection);
    changePage(connection, (page) => ({ ...page, lastChannel: channel }));
    notify(ports, { feature: 'pubsub.publish', level: 'success', text: publishedText(channel, watched.clients) });
  }
  return result;
}

/**
 * Starts a feature from the window, with what the Pub/Sub pages add around their features; any other is started as
 * the consoles start it.
 */
export async function startWithPubSub(ports: RunnerPorts, intent: Intent): Promise<IntentResult> {
  const connection = targetConnection(intent.target) ?? ports.state.get().nav.current ?? undefined;
  if (connection === undefined || !pubsubStarted()) {
    return startWithConsoles(ports, intent);
  }
  switch (intent.feature) {
    case 'pubsub.reconnect':
      return subscribeAgain(connection);
    case 'pubsub.publish':
      return publish(ports, intent, connection);
    case 'pubsub.subscribe': {
      const result = await startWithConsoles(ports, intent);
      changePage(connection, (page) =>
        page.pageConnection === 'connecting' && result.kind !== 'done' ? { ...page, pageConnection: 'closed' } : page,
      );
      return result;
    }
    default:
      return startWithConsoles(ports, intent);
  }
}

/** `pubsub.messages` `{ connection, format, rows }`: the rows the plan of an export named, as they are now. */
export function messagesFile(args: Json): Promise<string> {
  const fields = jsonFields(args);
  const connection = fields['connection'];
  const page = typeof connection === 'string' ? pageNow(connection as ConnectionId) : undefined;
  if (page === undefined) {
    return Promise.reject(new Error(text.export.empty));
  }
  const numbers = Array.isArray(fields['rows']) ? fields['rows'].filter((each) => typeof each === 'number') : [];
  const format = (['jsonl', 'json', 'csv'] as const).find((each) => each === fields['format']) ?? 'jsonl';
  return Promise.resolve(exportedText(rowsNumbered(keptRows(page.kept), numbers), format, page.offsetMinutes));
}
