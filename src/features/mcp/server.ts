/**
 * Feature: mcp.server
 *
 * While `datardo.mcp.enabled` is on, Datardo answers the Model Context Protocol on `127.0.0.1`, on the port of
 * `datardo.mcp.port`. The plan is one app step, `start the MCP server on http://127.0.0.1:37018/mcp` or `stop the
 * MCP server`; the HTTP server itself is the main process's (`src/main/mcp`). What it decides is here and pure: the
 * checks of each request, in their order, the HTTP answer of a body, and the warning of a port another program uses.
 *
 * No MCP SDK is used: the protocol is JSON-RPC 2.0 over plain HTTP POST (the Streamable HTTP transport without
 * server-sent events or sessions), answered by `mcp.protocol`.
 */
import type { Json } from '../../shared/engine-request';
import { noDanger, run, type After, type Answers, type Context, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appTarget } from '../../shared/target';
import type { AppState } from '../../shared/state';
import { sameToken } from './access-token';
import { parseErrorResponse } from './protocol';
import { mcpSettings } from './read-data';
import { text } from './text';
import { mcpStateOf, urlOf } from './tool/server-state';
import { mcpPath } from './types';

/** The only address the server listens on. */
export const listenHost = '127.0.0.1';

/** How long the server waits before it tries a port again, while it is on and could not start. */
export const retryMs = 3000;

/** The largest body read: 1 MB. */
export const mostBodyBytes = 1024 * 1024;

/** The app action that starts (or starts again) the server on a port: `{ port }`. */
export const startAction = 'mcp.start';

/** The app action that stops the server, letting the calls in progress finish. */
export const stopAction = 'mcp.stop';

/** Feature: mcp.server — start the server on the port of the settings, or stop it. */
export function plan(context: Context, _answers: Answers): Outcome {
  const settings = mcpSettings(context.state.settings);
  const url = urlOf(context.state);
  const step = settings.enabled
    ? { kind: 'app' as const, action: startAction, args: { port: settings.port }, text: text.server.startTitle(url) }
    : { kind: 'app' as const, action: stopAction, args: {}, text: text.server.stopTitle };
  return run({
    title: step.text,
    steps: [step],
    danger: noDanger,
    undo: { cannot: text.server.nothingToUndo },
    publishes: false,
    after: [],
  });
}

/** What the checks read of a request: its method, path and headers (lower-case names), and its announced length. */
export interface HttpHead {
  readonly method: string;
  /** The path without its query: `/mcp`. */
  readonly path: string;
  readonly host?: string;
  readonly origin?: string;
  readonly authorization?: string;
  /** `Content-Length`, when given; the main process also stops reading past {@link mostBodyBytes}. */
  readonly length?: number;
}

/** An HTTP answer: its status, its headers, and its body as JSON (none for 202). */
export interface HttpAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Json;
}

const closing = { Connection: 'close' };

function refusal(status: number, error: string, headers: Readonly<Record<string, string>> = {}): HttpAnswer {
  return { status, headers: { ...closing, 'Content-Type': 'application/json', ...headers }, body: { error } };
}

const localOrigin = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/u;

/**
 * The refusal of a request, or `undefined` when it may reach the protocol. In this order: a `Host` other than
 * `127.0.0.1:<port>` or `localhost:<port>` (403), an `Origin` that is not local (403), a path other than `/mcp` (404),
 * a missing or wrong token (401, compared in constant time), a method other than POST (405), a body over 1 MB (413).
 */
export function checkRequest(head: HttpHead, port: number, token: string): HttpAnswer | undefined {
  const hosts = [`127.0.0.1:${String(port)}`, `localhost:${String(port)}`];
  if (head.host === undefined || !hosts.includes(head.host.toLowerCase())) {
    return refusal(403, 'Forbidden host');
  }
  if (head.origin !== undefined && !localOrigin.test(head.origin.toLowerCase())) {
    return refusal(403, 'Forbidden origin');
  }
  if (head.path !== mcpPath) {
    return refusal(404, 'Not found');
  }
  const given = /^Bearer (.+)$/u.exec(head.authorization ?? '')?.[1];
  if (given === undefined || !sameToken(given, token)) {
    return refusal(401, 'Unauthorized', { 'WWW-Authenticate': 'Bearer' });
  }
  if (head.method.toUpperCase() !== 'POST') {
    return refusal(405, 'Method not allowed', { Allow: 'POST' });
  }
  if (head.length !== undefined && head.length > mostBodyBytes) {
    return refusal(413, 'Request too large');
  }
  return undefined;
}

/** The answer to a body larger than 1 MB, once the main process has read that much of it. */
export const tooLargeAnswer: HttpAnswer = refusal(413, 'Request too large');

/** The answer to a body that is not JSON: 400 with the JSON-RPC error -32700. */
export const parseErrorAnswer: HttpAnswer = {
  status: 400,
  headers: { ...closing, 'Content-Type': 'application/json' },
  body: parseErrorResponse,
};

/** The answer that carries what `mcp.protocol` answered: 200 with it, or 202 with no body for notifications only. */
export function bodyAnswer(body: Json | undefined): HttpAnswer {
  return body === undefined
    ? { status: 202, headers: closing }
    : { status: 200, headers: { ...closing, 'Content-Type': 'application/json' }, body };
}

/** Why a port cannot be used: `Port 37018 is used by another program.` for `EADDRINUSE`, else the system's message. */
export function listenProblem(port: number, code: string | undefined, message: string): string {
  return code === 'EADDRINUSE' ? text.server.taken(port) : message;
}

/**
 * What follows a start that failed: the warning *Datardo's MCP server is not running. Port 37018 is used by another
 * program.* with **Change port**, once per port until Datardo quits (`warnedPorts`); nothing for a port already
 * warned of, or while the server tries the port again.
 */
export function notStartedAfter(state: AppState, port: number, why: string): readonly After[] {
  if (mcpStateOf(state).warnedPorts.includes(port)) {
    return [];
  }
  return [
    {
      kind: 'notify',
      level: 'warning',
      text: text.server.warning(why),
      actions: [
        {
          label: text.server.changePort,
          element: 'mcp.change-port@notification',
          feature: featureId('mcp.change-port'),
          target: appTarget,
        },
      ],
    },
  ];
}
