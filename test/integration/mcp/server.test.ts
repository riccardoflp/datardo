/**
 * The MCP server over HTTP on 127.0.0.1 (M29): the checks of every request in their order (R14.7), the access token,
 * batches and notifications, a taken port with its one warning and its retries, two servers side by side with their
 * own tokens, and stopping while a call is in progress. The server listens on free ports of 127.0.0.1 only.
 */
import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenKey } from '../../../src/main/mcp/host';
import { freePort, httpRequest, liveMcp, type LiveMcp } from './live';

let live: LiveMcp;

function token(): string {
  return live.secrets.get(tokenKey) ?? '';
}

function hostHeader(port = live.port): string {
  return `127.0.0.1:${String(port)}`;
}

/** A request with the token and a right Host, which a test changes one header at a time. */
function asked(more: { headers?: Record<string, string>; method?: string; path?: string; body?: string } = {}) {
  return live.http({
    method: more.method ?? 'POST',
    path: more.path ?? '/mcp',
    headers: { Host: hostHeader(), Authorization: `Bearer ${token()}`, ...more.headers },
    body: more.body ?? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
}

/** The notifications whose text holds these words. */
function notices(words: string) {
  return live.state().runner.notifications.filter((item) => item.text.includes(words));
}

function occupy(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      resolve(server);
    });
  });
}

function release(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

async function until(test: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) {
      throw new Error('Timed out.');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

beforeAll(async () => {
  live = await liveMcp();
});

afterAll(async () => {
  await live.close();
});

describe('mcp.server', () => {
  it('listens on 127.0.0.1 at once on the port it is given, and nothing listens while it is off', async () => {
    expect(live.host.listening()).toBe(live.port);
    expect(live.state().mcp.server).toEqual({ kind: 'running', port: live.port });
    expect(live.mcpLines()).toContain(`Listening on http://127.0.0.1:${String(live.port)}/mcp`);
    const other = await freePort();
    await expect(httpRequest(other, { body: '{}' })).rejects.toThrow();
  });

  it('answers POST /mcp with the token in plain JSON, each answer with Connection: close', async () => {
    const reply = await asked();
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toMatch(/^application\/json/u);
    expect(reply.headers['connection']).toBe('close');
    expect(JSON.parse(reply.text)).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('checks Host, then Origin, then the path, then the token, then the method, then the size, then the JSON', async () => {
    const wrongHost = await asked({ headers: { Host: 'evil.example:80', Authorization: 'Bearer nope' }, path: '/x' });
    expect([wrongHost.status, JSON.parse(wrongHost.text)]).toEqual([403, { error: 'Forbidden host' }]);
    expect((await asked({ headers: { Host: `localhost:${String(live.port)}` } })).status).toBe(200);
    const wrongOrigin = await asked({ headers: { Origin: 'https://evil.example', Authorization: 'Bearer nope' } });
    expect([wrongOrigin.status, JSON.parse(wrongOrigin.text)]).toEqual([403, { error: 'Forbidden origin' }]);
    expect((await asked({ headers: { Origin: 'http://localhost:5173' } })).status).toBe(200);
    expect((await asked({ headers: { Origin: 'https://127.0.0.1' } })).status).toBe(200);
    const wrongPath = await asked({ path: '/other', headers: { Authorization: 'Bearer nope' } });
    expect([wrongPath.status, JSON.parse(wrongPath.text)]).toEqual([404, { error: 'Not found' }]);
    const wrongToken = await asked({ method: 'GET', headers: { Authorization: 'Bearer nope' } });
    expect(wrongToken.status).toBe(401);
    const wrongMethod = await asked({ method: 'PUT' });
    expect([wrongMethod.status, wrongMethod.headers['allow'], JSON.parse(wrongMethod.text)]).toEqual([
      405,
      'POST',
      { error: 'Method not allowed' },
    ]);
    const tooLarge = await asked({ body: `"${'x'.repeat(1024 * 1024 + 10)}"` });
    expect([tooLarge.status, JSON.parse(tooLarge.text)]).toEqual([413, { error: 'Request too large' }]);
    const notJson = await asked({ body: '{ not json' });
    expect(notJson.status).toBe(400);
    expect(JSON.parse(notJson.text)).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32700 } });
  });

  it('answers an array of messages with the array of their answers, and only notifications with 202', async () => {
    const batch = await asked({
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
      ]),
    });
    expect(batch.status).toBe(200);
    expect(JSON.parse(batch.text)).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, result: {} },
    ]);
    const notifications = await asked({
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect([notifications.status, notifications.text]).toEqual([202, '']);
  });

  it('runs beside another server, each with its own token', async () => {
    const other = await liveMcp();
    try {
      const mine = token();
      const theirs = other.secrets.get(tokenKey) ?? '';
      expect(theirs).not.toBe(mine);
      const crossed = await other.http({
        headers: { Host: hostHeader(other.port), Authorization: `Bearer ${mine}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      expect(crossed.status).toBe(401);
      expect((await other.rpc('ping'))['result']).toEqual({});
      expect((await live.rpc('ping'))['result']).toEqual({});
    } finally {
      await other.close();
    }
  });

  it('on a taken port does not start, warns once, tries again every few seconds and starts when it is free', async () => {
    const port = await freePort();
    const blocker = await occupy(port);
    await live.host.start(port);
    const said = `Not started: Port ${String(port)} is used by another program.`;
    await until(() => live.mcpLines().includes(said));
    expect(live.state().mcp.server).toMatchObject({ kind: 'not-running', port, taken: true });
    const warnings = notices(`Port ${String(port)} is used`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.count).toBe(1);
    expect(warnings[0]?.text).toBe(
      `Datardo's MCP server is not running. Port ${String(port)} is used by another program.`,
    );
    expect(JSON.stringify(warnings[0]?.actions)).toContain('Change port');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(live.mcpLines().filter((line) => line === said)).toHaveLength(1);
    await release(blocker);
    await until(() => live.host.listening() === port);
    const after = notices(`Port ${String(port)} is used`);
    expect(after).toHaveLength(1);
    expect(after[0]?.count).toBe(1);
    expect(live.state().mcp.server).toEqual({ kind: 'running', port });
    await live.host.start(live.port);
    await until(() => live.host.listening() === live.port);
  });

  it('says any other error of listening with its own message', async () => {
    const before = live.mcpLines().length;
    await live.host.start(70_000);
    await until(() =>
      live
        .mcpLines()
        .slice(before)
        .some((line) => line.startsWith('Not started: ')),
    );
    const line = live
      .mcpLines()
      .slice(before)
      .find((each) => each.startsWith('Not started: '));
    expect(line).not.toContain('used by another program');
    await live.host.start(live.port);
    await until(() => live.host.listening() === live.port);
  });

  it('stops listening at once and lets the calls in progress finish', async () => {
    const sent = live.sent.length;
    const call = live.tool('list_databases', { connection: 'Local' });
    await until(() => live.sent.length > sent);
    live.host.stop();
    expect(live.host.listening()).toBeUndefined();
    expect(live.state().mcp.server).toEqual({ kind: 'off' });
    expect(live.mcpLines()).toContain('Stopped');
    const reply = await call;
    expect(reply.isError).toBe(false);
    await expect(httpRequest(live.port, { body: '{}' })).rejects.toThrow();
    await live.host.start(live.port);
    await until(() => live.host.listening() === live.port);
  });
});

describe('mcp.access-token', () => {
  it('stores a token at the first start, and never logs it', () => {
    expect(token()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(JSON.stringify(live.state())).not.toContain(token());
  });

  it('refuses a request without the token, with another scheme or another token with 401, before any tool runs, logging nothing', async () => {
    const sent = live.sent.length;
    const lines = live.state().runner.log.length;
    const call = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_databases', arguments: { connection: 'Local' } },
    });
    for (const authorization of [undefined, `Basic ${token()}`, `Bearer ${token()}x`, 'Bearer ']) {
      const reply = await live.http({
        headers: { Host: hostHeader(), ...(authorization === undefined ? {} : { Authorization: authorization }) },
        body: call,
      });
      expect([reply.status, reply.headers['www-authenticate'], JSON.parse(reply.text)]).toEqual([
        401,
        'Bearer',
        { error: 'Unauthorized' },
      ]);
    }
    expect(live.sent.length).toBe(sent);
    expect(live.state().runner.log.length).toBe(lines);
  });

  it('after a new token the old one gets 401 at once, and the new one is 43 characters of base64url', async () => {
    const old = token();
    live.host.newToken();
    const fresh = token();
    expect(fresh).not.toBe(old);
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const refused = await live.http({
      headers: { Host: hostHeader(), Authorization: `Bearer ${old}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(refused.status).toBe(401);
    expect((await live.rpc('ping'))['result']).toEqual({});
    expect(live.mcpLines()).toContain('New access token: the old one no longer works');
    expect(JSON.stringify(live.state())).not.toContain(fresh);
  });

  it('with the server off, a new token is stored and nothing starts', async () => {
    live.host.stop();
    const old = token();
    live.host.newToken();
    expect(token()).not.toBe(old);
    expect(live.host.listening()).toBeUndefined();
    expect(live.state().mcp.server).toEqual({ kind: 'off' });
    await live.host.start(live.port);
    await until(() => live.host.listening() === live.port);
  });
});

describe('mcp.change-port', () => {
  it('moves to a new port, says where it moved from, and the old one no longer answers', async () => {
    const port = await freePort();
    await live.host.start(port);
    await until(() => live.host.listening() === port);
    const moved = notices(`port ${String(port)}`).filter((item) => item.text.includes(String(live.port)));
    expect(moved).toHaveLength(1);
    expect(moved[0]?.feature).toBe('mcp.change-port');
    await expect(httpRequest(live.port, { body: '{}' })).rejects.toThrow();
    await live.host.start(live.port);
    await until(() => live.host.listening() === live.port);
  });
});

describe('mcp.log', () => {
  it('writes a line for each call under the source MCP, never the token', async () => {
    await live.tool('list_connections');
    const lines = live.mcpLines();
    expect(lines.some((line) => line.includes('list_connections'))).toBe(true);
    expect(lines.join('\n')).not.toContain(token());
  });
});
