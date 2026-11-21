import { describe, expect, it } from 'vitest';
import { newTokenAction, plan, sameToken, tokenBytes, tokenText } from '../../../src/features/mcp/access-token';
import { checkRequest } from '../../../src/features/mcp/server';
import { mcpContext, planOf } from './harness';

describe('mcp.access-token', () => {
  it('stores a new token of 32 bytes and says so; the main process writes the line of the Log under MCP', () => {
    const made = planOf(plan(mcpContext('mcp.access-token'), {}));
    expect(made.title).toBe('store a new access token of the MCP server');
    expect(made.steps).toEqual([
      {
        kind: 'app',
        action: newTokenAction,
        args: { bytes: tokenBytes },
        text: 'store a new access token of the MCP server',
      },
    ]);
    expect(made.after).toEqual([
      {
        kind: 'notify',
        level: 'info',
        text: "Datardo's MCP server has a new access token: copy the configuration again.",
      },
    ]);
    expect(made.undo).toEqual({ cannot: expect.stringContaining('Cannot be undone') as unknown });
  });

  it('starts nothing, also with the server off', () => {
    const made = planOf(plan(mcpContext('mcp.access-token'), {}));
    expect(made.steps.map((step) => (step.kind === 'app' ? step.action : step.kind))).toEqual(['mcp.new-token']);
  });

  it('writes 32 bytes as 43 characters of base64url', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (index * 37 + 251) % 256);
    const written = tokenText(bytes);
    expect(written).toHaveLength(43);
    expect(written).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(tokenText(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(tokenText(new TextEncoder().encode('Man'))).toBe('TWFu');
  });

  it('compares tokens whole', () => {
    expect(sameToken('abc', 'abc')).toBe(true);
    expect(sameToken('abd', 'abc')).toBe(false);
    expect(sameToken('ab', 'abc')).toBe(false);
    expect(sameToken('abcd', 'abc')).toBe(false);
    expect(sameToken('', '')).toBe(false);
  });

  it('refuses the old token at once once there is a new one', () => {
    const head = { method: 'POST', path: '/mcp', host: '127.0.0.1:37018', authorization: 'Bearer old' };
    expect(checkRequest(head, 37018, 'old')).toBeUndefined();
    expect(checkRequest(head, 37018, 'new')).toMatchObject({ status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  });
});
