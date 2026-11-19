import { describe, expect, it } from 'vitest';
import {
  bodyAnswer,
  checkRequest,
  listenHost,
  listenProblem,
  mostBodyBytes,
  notStartedAfter,
  parseErrorAnswer,
  plan,
  retryMs,
  tooLargeAnswer,
  type HttpHead,
} from '../../../src/features/mcp/server';
import { mcpContext, mcpState, planOf } from './harness';

const token = 'right-token';
const good: HttpHead = {
  method: 'POST',
  path: '/mcp',
  host: '127.0.0.1:37018',
  authorization: `Bearer ${token}`,
  length: 100,
};

/** A request like the good one with the headers given; a header given as `undefined` is left out. */
function check(head: { readonly [K in keyof HttpHead]?: HttpHead[K] | undefined }) {
  const merged: Record<string, unknown> = { ...good, ...head };
  const kept = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
  return checkRequest(kept as unknown as HttpHead, 37018, token);
}

describe('mcp.server', () => {
  it('plans to start on 127.0.0.1 at the port of the settings while enabled, and to stop otherwise', () => {
    const on = planOf(plan(mcpContext('mcp.server', mcpState({ settings: { 'datardo.mcp.enabled': true } })), {}));
    expect(on.steps).toEqual([
      {
        kind: 'app',
        action: 'mcp.start',
        args: { port: 37018 },
        text: 'start the MCP server on http://127.0.0.1:37018/mcp',
      },
    ]);
    const moved = planOf(
      plan(
        mcpContext('mcp.server', mcpState({ settings: { 'datardo.mcp.enabled': true, 'datardo.mcp.port': 37019 } })),
        {},
      ),
    );
    expect(moved.title).toBe('start the MCP server on http://127.0.0.1:37019/mcp');
    const off = planOf(plan(mcpContext('mcp.server'), {}));
    expect(off.steps).toEqual([{ kind: 'app', action: 'mcp.stop', args: {}, text: 'stop the MCP server' }]);
    expect(listenHost).toBe('127.0.0.1');
  });

  it('lets a local POST /mcp with the token through', () => {
    expect(check({})).toBeUndefined();
    expect(check({ host: 'localhost:37018', origin: 'http://localhost:5173' })).toBeUndefined();
    expect(check({ origin: 'https://127.0.0.1' })).toBeUndefined();
  });

  it('refuses in order: host, origin, path, token, method, size', () => {
    expect(check({ host: 'evil.example:37018', path: '/x', authorization: undefined })).toMatchObject({
      status: 403,
      body: { error: 'Forbidden host' },
    });
    expect(check({ host: '127.0.0.1:37017' })).toMatchObject({ status: 403, body: { error: 'Forbidden host' } });
    expect(check({ origin: 'https://evil.example', path: '/x' })).toMatchObject({
      status: 403,
      body: { error: 'Forbidden origin' },
    });
    expect(check({ path: '/mcp/release', authorization: undefined })).toMatchObject({
      status: 404,
      body: { error: 'Not found' },
    });
    expect(check({ authorization: 'Bearer wrong', method: 'GET' })).toMatchObject({
      status: 401,
      body: { error: 'Unauthorized' },
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
    expect(check({ authorization: undefined })?.status).toBe(401);
    expect(check({ authorization: `Basic ${token}` })?.status).toBe(401);
    expect(check({ method: 'GET', length: mostBodyBytes + 1 })).toMatchObject({
      status: 405,
      body: { error: 'Method not allowed' },
      headers: { Allow: 'POST' },
    });
    expect(check({ length: mostBodyBytes + 1 })).toMatchObject({ status: 413, body: { error: 'Request too large' } });
    expect(tooLargeAnswer.status).toBe(413);
  });

  it('answers plain JSON, each answer with Connection: close, and 202 with no body for notifications', () => {
    expect(bodyAnswer({ jsonrpc: '2.0', id: 1, result: {} })).toEqual({
      status: 200,
      headers: { Connection: 'close', 'Content-Type': 'application/json' },
      body: { jsonrpc: '2.0', id: 1, result: {} },
    });
    expect(bodyAnswer(undefined)).toEqual({ status: 202, headers: { Connection: 'close' } });
    expect(parseErrorAnswer).toMatchObject({
      status: 400,
      headers: { Connection: 'close' },
      body: { error: { code: -32700, message: 'Parse error' } },
    });
    expect(check({ host: 'x' })?.headers['Connection']).toBe('close');
  });

  it('says a port used by another program, and any other error with its own message', () => {
    expect(listenProblem(37018, 'EADDRINUSE', 'listen EADDRINUSE')).toBe('Port 37018 is used by another program.');
    expect(listenProblem(37018, 'EACCES', 'listen EACCES: permission denied')).toBe('listen EACCES: permission denied');
  });

  it('warns once per port, with Change port', () => {
    const why = 'Port 37018 is used by another program.';
    expect(notStartedAfter(mcpState(), 37018, why)).toEqual([
      {
        kind: 'notify',
        level: 'warning',
        text: "Datardo's MCP server is not running. Port 37018 is used by another program.",
        actions: [
          {
            label: 'Change port',
            element: 'mcp.change-port@notification',
            feature: 'mcp.change-port',
            target: { kind: 'app' },
          },
        ],
      },
    ]);
    expect(notStartedAfter(mcpState({ warnedPorts: [37018] }), 37018, why)).toEqual([]);
    expect(
      notStartedAfter(mcpState({ warnedPorts: [37018] }), 37019, 'Port 37019 is used by another program.'),
    ).toHaveLength(1);
    expect(retryMs).toBe(3000);
  });
});
