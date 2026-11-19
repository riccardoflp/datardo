import { describe, expect, it } from 'vitest';
import { logLine, logSource, stateLine } from '../../../src/features/mcp/log';
import { callAnswer } from '../../../src/features/mcp/protocol';
import { allTools } from '../../../src/features/mcp';
import { checkRequest } from '../../../src/features/mcp/server';

describe('mcp.log', () => {
  it('writes a call that succeeded with its arguments', () => {
    const line = logLine({
      kind: 'call',
      tool: 'find_documents',
      arguments: { connection: 'Local', database: 'shop', collection: 'orders' },
      outcome: { kind: 'ok' },
    });
    expect(line).toBe('find_documents {"connection":"Local","database":"shop","collection":"orders"} → ok');
    expect(logSource).toBe('MCP');
  });

  it('writes a call with a missing argument', () => {
    expect(
      logLine({
        kind: 'call',
        tool: 'list_databases',
        arguments: {},
        outcome: { kind: 'missing', keys: ['connection'] },
      }),
    ).toBe('list_databases {} → missing connection');
  });

  it('writes a call that failed with its message', () => {
    const tool = allTools.find((each) => each.name === 'aggregate');
    if (tool === undefined) {
      throw new Error('no aggregate');
    }
    const message = "$out writes to the database: Datardo's MCP server only reads.";
    const { log } = callAnswer(
      { kind: 'call', id: 1, tool, arguments: { pipeline: '[{$out:"x"}]' } },
      { kind: 'fail', message },
    );
    expect(logLine(log)).toBe(`aggregate {"pipeline":"[{$out:\\"x\\"}]"} → error: ${message}`);
  });

  it('cuts arguments of 500 characters at 300 with …', () => {
    const line = logLine({
      kind: 'call',
      tool: 'find_documents',
      arguments: { filter: 'f'.repeat(500) },
      outcome: { kind: 'ok' },
    });
    const json = JSON.stringify({ filter: 'f'.repeat(500) });
    expect(line).toBe(`find_documents ${json.slice(0, 300)}… → ok`);
  });

  it("writes the server's states, a port still taken once", () => {
    expect(logLine({ kind: 'listening', url: 'http://127.0.0.1:37018/mcp' })).toBe(
      'Listening on http://127.0.0.1:37018/mcp',
    );
    expect(logLine({ kind: 'stopped' })).toBe('Stopped');
    expect(logLine({ kind: 'new-token' })).toBe('New access token: the old one no longer works');
    const taken = { kind: 'not-started', why: 'Port 37018 is used by another program.' } as const;
    let last: string | undefined;
    const written: string[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const line = stateLine(taken, last);
      if (line !== undefined) {
        written.push(line);
        last = line;
      }
    }
    expect(written).toEqual(['Not started: Port 37018 is used by another program.']);
  });

  it('leaves no line for a request with a wrong token: the HTTP checks refuse it before the protocol', () => {
    const refused = checkRequest(
      { method: 'POST', path: '/mcp', host: '127.0.0.1:37018', authorization: 'Bearer wrong' },
      37018,
      'right-token',
    );
    expect(refused?.status).toBe(401);
  });
});
