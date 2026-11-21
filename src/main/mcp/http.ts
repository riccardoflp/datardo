/**
 * The HTTP side of the MCP server (`mcp.server`, R14.7): Node's own `http` module, listening on `127.0.0.1` only. Each
 * request is checked by the pure `checkRequest` before its body is read (host, origin, path, token, method, size);
 * the body, at most 1 MB, is read as JSON and each of its messages answered; every answer is plain JSON with
 * `Connection: close` (the Streamable HTTP transport without server-sent events or sessions).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { RpcResponse } from '../../features/mcp/protocol';
import { batchBody } from '../../features/mcp/protocol';
import {
  bodyAnswer,
  checkRequest,
  listenHost,
  mostBodyBytes,
  parseErrorAnswer,
  tooLargeAnswer,
  type HttpAnswer,
  type HttpHead,
} from '../../features/mcp/server';

/** What the HTTP server needs: the token now, and the answer to one message. */
export interface HttpPorts {
  readonly token: () => string;
  readonly answerMessage: (message: unknown) => Promise<RpcResponse | undefined>;
}

/** The bytes of a refused request read and dropped before it is answered, so that its client reads the answer. */
const mostDiscardedBytes = 16 * 1024 * 1024;

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** What the checks read of a request. */
export function headOf(request: IncomingMessage): HttpHead {
  const length = Number(header(request, 'content-length') ?? Number.NaN);
  const host = header(request, 'host');
  const origin = header(request, 'origin');
  const authorization = header(request, 'authorization');
  return {
    method: request.method ?? 'GET',
    path: (request.url ?? '/').split('?')[0] ?? '/',
    ...(host === undefined ? {} : { host }),
    ...(origin === undefined ? {} : { origin }),
    ...(authorization === undefined ? {} : { authorization }),
    ...(Number.isFinite(length) ? { length } : {}),
  };
}

function send(response: ServerResponse, answer: HttpAnswer): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  const body = answer.body === undefined ? undefined : JSON.stringify(answer.body);
  response.writeHead(answer.status, {
    ...answer.headers,
    ...(body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(body)) }),
  });
  response.end(body);
}

/** The answer to a body read whole: 400 when it is not JSON, else the answers of its messages. */
async function answerBody(ports: HttpPorts, text: string): Promise<HttpAnswer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: the protocol's own answer, -32700.
    return parseErrorAnswer;
  }
  const wasArray = Array.isArray(parsed);
  const messages: readonly unknown[] = wasArray ? (parsed as readonly unknown[]) : [parsed];
  const answers = await Promise.all(messages.map((message) => ports.answerMessage(message)));
  return bodyAnswer(batchBody(answers, wasArray));
}

/** Answers one request: refused before its body is read, or its body answered. */
function handle(ports: HttpPorts, port: number, request: IncomingMessage, response: ServerResponse): void {
  const refused = checkRequest(headOf(request), port, ports.token());
  const chunks: Buffer[] = [];
  let size = 0;
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (refused !== undefined || size > mostBodyBytes) {
      chunks.length = 0;
      if (size > mostDiscardedBytes) {
        send(response, refused ?? tooLargeAnswer);
        request.destroy();
      }
      return;
    }
    chunks.push(chunk);
  });
  request.on('error', () => {
    // The client went away: there is no one left to answer.
    response.destroy();
  });
  request.on('end', () => {
    if (refused !== undefined) {
      send(response, refused);
    } else if (size > mostBodyBytes) {
      send(response, tooLargeAnswer);
    } else {
      void answerBody(ports, Buffer.concat(chunks).toString('utf8')).then((answer) => {
        send(response, answer);
      });
    }
  });
}

/** Listens on `127.0.0.1` on the port; rejects with the system's error (`EADDRINUSE`) when it cannot. */
export function listenOn(ports: HttpPorts, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      handle(ports, port, request, response);
    });
    server.once('error', reject);
    server.listen({ host: listenHost, port, exclusive: true }, () => {
      server.off('error', reject);
      server.on('error', () => {
        // An error after listening concerns one connection, which Node closes: the server goes on.
      });
      resolve(server);
    });
  });
}

/** Stops listening at once; the calls in progress finish and their connections close after their answer. */
export function stopListening(server: Server): void {
  server.close();
  server.closeIdleConnections();
}

/** Whether nothing listens on a port of `127.0.0.1`, by listening on it for a moment. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      resolve(false);
    });
    probe.listen({ host: listenHost, port, exclusive: true }, () => {
      probe.close(() => {
        resolve(true);
      });
    });
  });
}
