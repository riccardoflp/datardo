/**
 * The console's own connection to Redis (`console.connect`): a socket of its own, through the same TLS options and SSH
 * tunnel as the connection, that sends each command as an array of bytes and reads each reply with every RESP type
 * kept apart (`./resp.ts`). It sends nothing by itself: no `HELLO`, no `AUTH`, no `SELECT`; the console says them as
 * steps of its plans. A server error is a reply, not a failure: the console shows it under its command.
 *
 * It is the one client of Datardo that sends `KEYS`, and only when the user types it in the console, which confirms it
 * on a large database (`console.classify`); the ordinary clients never do (R9.3).
 */
import { connect as connectTcp, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import type { EngineRequest } from '../../shared/engine-request';
import type { ConsoleAnswer } from '../../shared/typed-reply';
import { EngineError, type ClientSettings, type EngineClient } from '../engine';
import { maskedError, secretsOf } from '../transport/mask';
import { socketTlsOptions } from '../transport/tls';
import { openDirectOrThrough } from '../transport/tunnel';
import { redisAddress, type RedisAddress } from '.';
import { encodeCommand, RespReader } from './resp';

/** The message of a command whose connection closed before its reply arrived. */
export const closedBeforeReply = "The console's connection closed before the reply arrived.";

/** A command sent and waiting for its reply; an abandoned one has its reply read and dropped, so the order holds. */
interface Waiting {
  readonly resolve: (answer: ConsoleAnswer) => void;
  readonly reject: (error: Error) => void;
  abandoned: boolean;
}

function noAnswer(address: RedisAddress, settings: ClientSettings): EngineError {
  const seconds = String(Math.round(settings.connectTimeoutMs / 1000));
  return new EngineError(`Redis ${address.host}:${String(address.port)} didn't answer in ${seconds} seconds`);
}

/** Opens the socket, plain or TLS, and waits until it is connected, within the time to find the server. */
async function openSocket(settings: ClientSettings, servername: string, signal: AbortSignal): Promise<Socket> {
  const address = redisAddress(settings.connectionString);
  const tls = address.tls || settings.tls !== undefined;
  const socket = tls
    ? connectTls({
        host: address.host,
        port: address.port,
        ...(await socketTlsOptions(settings.tls ?? {}, servername)),
      })
    : connectTcp({ host: address.host, port: address.port });
  return new Promise<Socket>((resolve, reject) => {
    const fail = (error: Error): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      socket.destroy();
      reject(error);
    };
    const aborted = (): void => {
      fail(new EngineError('Cancelled.'));
    };
    const timer = setTimeout(() => {
      fail(noAnswer(address, settings));
    }, settings.connectTimeoutMs);
    signal.addEventListener('abort', aborted, { once: true });
    socket.once('error', fail);
    socket.once(tls ? 'secureConnect' : 'connect', () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      socket.off('error', fail);
      socket.setNoDelay(true);
      socket.setKeepAlive(true);
      resolve(socket);
    });
  });
}

/** How long a request may wait, when it says; a command typed in the console waits until it is stopped. */
function bound(waiting: Waiting, signal: AbortSignal, timeLimitMs: number | undefined): void {
  const give = (error: Error): void => {
    if (!waiting.abandoned) {
      waiting.abandoned = true;
      waiting.reject(error);
    }
  };
  if (signal.aborted) {
    give(new EngineError('Cancelled.'));
    return;
  }
  signal.addEventListener('abort', () => {
    give(new EngineError('Cancelled.'));
  });
  if (timeLimitMs !== undefined) {
    setTimeout(() => {
      give(new EngineError(`Redis did not answer in ${String(timeLimitMs / 1000)} seconds.`));
    }, timeLimitMs).unref();
  }
}

/** The client of the console on an open socket. */
function clientOn(socket: Socket): EngineClient {
  const reader = new RespReader();
  const waiting: Waiting[] = [];
  const dropListeners: ((reason: string) => void)[] = [];
  let closed = false;
  let closing = false;
  socket.on('data', (chunk: Buffer) => {
    for (const answer of reader.push(chunk)) {
      // A push the server sends by itself, with no command waiting, has nobody to answer.
      const first = waiting.shift();
      if (first !== undefined && !first.abandoned) {
        first.resolve({ reply: answer.reply, bytes: answer.bytes });
      }
    }
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
      for (const listener of dropListeners.splice(0)) {
        listener("The console's connection closed.");
      }
    }
  });
  const send = (request: EngineRequest, signal: AbortSignal): Promise<ConsoleAnswer> => {
    if (request.engine !== 'redis') {
      return Promise.reject(new EngineError('A MongoDB request cannot be sent to Redis.'));
    }
    if (closed) {
      return Promise.reject(new EngineError("The console's connection is closed."));
    }
    return new Promise<ConsoleAnswer>((resolve, reject) => {
      const each: Waiting = { resolve, reject, abandoned: false };
      waiting.push(each);
      socket.write(encodeCommand(request.command));
      bound(each, signal, request.timeLimitMs);
    });
  };
  return {
    send,
    close: async () => {
      closing = true;
      socket.destroy();
      await Promise.resolve();
    },
    onDrop: (listener) => {
      dropListeners.push(listener);
    },
  };
}

/** Opens the console's own connection, directly or through the SSH tunnel; its errors hold no secret. */
export async function openConsoleClient(settings: ClientSettings, signal: AbortSignal): Promise<EngineClient> {
  const secrets = secretsOf(settings);
  try {
    signal.throwIfAborted();
    return await openDirectOrThrough(settings, signal, async (direct, servername) => {
      const address = redisAddress(direct.connectionString);
      return clientOn(await openSocket(direct, servername ?? address.host, signal));
    });
  } catch (error: unknown) {
    throw maskedError(error, secrets);
  }
}
