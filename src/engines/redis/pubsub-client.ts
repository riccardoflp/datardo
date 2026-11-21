/**
 * The Pub/Sub page's own connection to Redis (`pubsub.subscribe`): a socket of its own, through the same TLS options
 * and SSH tunnel as the connection, apart from the connection's ordinary client and from the console's, since a
 * connection that subscribes runs no other command on RESP2 and a flood of messages must not delay the keys tabs.
 *
 * It sends what it is given, as the console's connection does, and reads every reply with its RESP type kept
 * (`./resp.ts`). A message the server pushes (`message`, `pmessage`), as a RESP3 push or a RESP2 array, goes to the
 * listener with its bytes as they arrived; the confirmations of `SUBSCRIBE`, `PSUBSCRIBE`, `UNSUBSCRIBE` and
 * `PUNSUBSCRIBE`, one per name, answer their command together. An error of the server fails its command, with the
 * first word of the message as its code (`NOPERM`, `NOPROTO`, `ERR unknown command`).
 */
import type { Socket } from 'node:net';
import type { EngineRequest } from '../../shared/engine-request';
import { redisReplyOf, type TypedReply } from '../../shared/typed-reply';
import { EngineError, type ClientSettings, type EngineClient } from '../engine';
import { maskedError, secretsOf } from '../transport/mask';
import { openDirectOrThrough } from '../transport/tunnel';
import { redisAddress } from '.';
import { openSocket } from './console-client';
import { encodeCommand, RespReader } from './resp';

/** A message the server pushed to the page's connection: its channel, the pattern it matched, and its bytes. */
export interface PubSubPush {
  readonly channel: Uint8Array;
  readonly pattern?: Uint8Array;
  readonly message: Uint8Array;
}

/** The message of a command whose connection closed before its reply arrived. */
const closedBeforeReply = 'The Pub/Sub connection closed before the reply arrived.';

/** The commands answered by one confirmation per name. */
const confirmed = new Set(['SUBSCRIBE', 'PSUBSCRIBE', 'UNSUBSCRIBE', 'PUNSUBSCRIBE']);

/** The kinds of the confirmations the server sends for them. */
const confirmations = new Set(['subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe']);

/** A command sent and waiting for its replies. */
interface Waiting {
  readonly expected: number;
  readonly replies: TypedReply[];
  readonly resolve: (reply: unknown) => void;
  readonly reject: (error: Error) => void;
  done: boolean;
}

const decoder = new TextDecoder();

function wordOf(reply: TypedReply | undefined): string | undefined {
  return reply?.kind === 'bulk' ? decoder.decode(reply.bytes) : reply?.kind === 'simple' ? reply.text : undefined;
}

function bytesOf(reply: TypedReply | undefined): Uint8Array | undefined {
  return reply?.kind === 'bulk' ? reply.bytes : undefined;
}

/** What a push or an array of the server is: a message, a confirmation, or neither. */
function pushOf(
  reply: TypedReply,
): { readonly kind: 'message'; readonly push: PubSubPush } | 'confirmation' | undefined {
  if (reply.kind !== 'push' && reply.kind !== 'array') {
    return undefined;
  }
  const kind = wordOf(reply.items[0]);
  if (kind === 'message' && reply.items.length === 3) {
    const channel = bytesOf(reply.items[1]);
    const message = bytesOf(reply.items[2]);
    return channel === undefined || message === undefined ? undefined : { kind: 'message', push: { channel, message } };
  }
  if (kind === 'pmessage' && reply.items.length === 4) {
    const pattern = bytesOf(reply.items[1]);
    const channel = bytesOf(reply.items[2]);
    const message = bytesOf(reply.items[3]);
    return pattern === undefined || channel === undefined || message === undefined
      ? undefined
      : { kind: 'message', push: { channel, pattern, message } };
  }
  return kind !== undefined && confirmations.has(kind) ? 'confirmation' : undefined;
}

/** The code of an error of the server: what its message starts with. */
export function errorCode(message: string): string {
  if (message.startsWith('ERR unknown command')) {
    return 'ERR unknown command';
  }
  return message.split(' ', 1)[0] ?? message;
}

function answer(waiting: Waiting, reply: TypedReply): void {
  if (reply.kind === 'error') {
    waiting.done = true;
    waiting.reject(new EngineError(reply.message, errorCode(reply.message)));
    return;
  }
  waiting.replies.push(reply);
  if (waiting.replies.length >= waiting.expected) {
    waiting.done = true;
    const replies = waiting.replies.map(redisReplyOf);
    waiting.resolve(waiting.expected === 1 ? replies[0] : replies);
  }
}

/** How many replies a command gets: one per name for the commands of subscriptions, else one. */
function expectedReplies(command: readonly Uint8Array[]): number {
  const name = decoder.decode(command[0] ?? new Uint8Array()).toUpperCase();
  return confirmed.has(name) ? Math.max(1, command.length - 1) : 1;
}

/** What arrived: the messages go to the listener, the replies to the commands waiting, in order. */
function readChunk(
  reads: Iterable<{ readonly reply: TypedReply }>,
  waiting: Waiting[],
  listener: (push: PubSubPush) => void,
): void {
  for (const read of reads) {
    const push = pushOf(read.reply);
    if (push !== undefined && push !== 'confirmation') {
      listener(push.push);
      continue;
    }
    const head = waiting[0];
    if (head === undefined) {
      // A confirmation of a command already given up has nobody to answer.
      continue;
    }
    answer(head, read.reply);
    if (head.done) {
      waiting.shift();
    }
  }
}

/** The client of the page on an open socket. */
function clientOn(socket: Socket, listener: (push: PubSubPush) => void): EngineClient {
  const reader = new RespReader();
  const waiting: Waiting[] = [];
  const dropListeners: ((reason: string) => void)[] = [];
  let closed = false;
  let closing = false;
  socket.on('data', (chunk: Buffer) => {
    readChunk(reader.push(chunk), waiting, listener);
  });
  socket.on('error', () => {
    // The 'close' that follows says it where it matters: to the commands waiting, and to who listens for a drop.
  });
  socket.on('close', () => {
    closed = true;
    for (const each of waiting.splice(0)) {
      each.reject(new EngineError(closedBeforeReply));
    }
    if (!closing) {
      for (const each of dropListeners.splice(0)) {
        each('The Pub/Sub connection closed.');
      }
    }
  });
  const send = (request: EngineRequest, signal: AbortSignal): Promise<unknown> => {
    if (request.engine !== 'redis') {
      return Promise.reject(new EngineError('A MongoDB request cannot be sent to Redis.'));
    }
    if (closed) {
      return Promise.reject(new EngineError('The Pub/Sub connection is closed.'));
    }
    signal.throwIfAborted();
    return new Promise<unknown>((resolve, reject) => {
      waiting.push({ expected: expectedReplies(request.command), replies: [], resolve, reject, done: false });
      socket.write(encodeCommand(request.command));
    });
  };
  return {
    send,
    close: async () => {
      closing = true;
      socket.destroy();
      await Promise.resolve();
    },
    onDrop: (each) => {
      dropListeners.push(each);
    },
  };
}

/**
 * Opens the page's own connection, directly or through the SSH tunnel; the messages it receives go to `listener`.
 * Its errors hold no secret.
 */
export async function openPubSubClient(
  settings: ClientSettings,
  signal: AbortSignal,
  listener: (push: PubSubPush) => void,
): Promise<EngineClient> {
  const secrets = secretsOf(settings);
  try {
    signal.throwIfAborted();
    return await openDirectOrThrough(settings, signal, async (direct, servername) => {
      const address = redisAddress(direct.connectionString);
      return clientOn(await openSocket(direct, servername ?? address.host, signal), listener);
    });
  } catch (error: unknown) {
    throw maskedError(error, secrets);
  }
}
