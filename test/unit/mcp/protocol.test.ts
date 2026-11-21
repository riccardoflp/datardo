import { describe, expect, it } from 'vitest';
import { allTools, serverInstructions, toolsOffered } from '../../../src/features/mcp';
import { answer, batchBody, callAnswer, parseErrorResponse, rpcErrors } from '../../../src/features/mcp/protocol';
import type { MessageAnswer } from '../../../src/features/mcp/protocol';
import { mcpState } from './harness';

const instructions = serverInstructions();
const info = { version: '0.1.0', instructions };

function responseOf(message: unknown): unknown {
  const answered: MessageAnswer = answer(message, allTools, info);
  if (answered.kind !== 'response') {
    throw new Error(`Expected a response, got ${answered.kind}`);
  }
  return answered.response;
}

describe('mcp.protocol', () => {
  it('gives a missing argument as a result with isError, not a protocol error', () => {
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_databases', arguments: {} } };
    const answered = answer(message, allTools, info);
    expect(answered).toMatchObject({
      kind: 'response',
      response: {
        id: 1,
        result: { content: [{ type: 'text', text: 'Missing argument: connection.' }], isError: true },
      },
      log: { kind: 'call', tool: 'list_databases', outcome: { kind: 'missing', keys: ['connection'] } },
    });
  });

  it('says several missing arguments together', () => {
    const message = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'find_documents', arguments: { connection: 'Local', database: '' } },
    };
    expect(responseOf(message)).toMatchObject({
      result: { content: [{ text: 'Missing arguments: database, collection.' }] },
    });
  });

  it('does not answer a notification', () => {
    expect(answer({ jsonrpc: '2.0', method: 'notifications/initialized' }, allTools, info)).toEqual({ kind: 'none' });
    expect(batchBody([undefined], false)).toBeUndefined();
  });

  it('refuses an unknown method', () => {
    expect(responseOf({ jsonrpc: '2.0', id: 2, method: 'resources/list' })).toEqual({
      jsonrpc: '2.0',
      id: 2,
      error: { code: rpcErrors.methodNotFound, message: 'Method not found: resources/list' },
    });
  });

  it('answers initialize with the latest version for one it does not know, and the instructions', () => {
    const result = responseOf({
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: { protocolVersion: '2023-01-01' },
    });
    expect(result).toMatchObject({
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'datardo', title: 'Datardo', version: '0.1.0' },
      },
    });
    expect(instructions.startsWith("Datardo is the database client open on the user's computer.")).toBe(true);
    expect(instructions).toContain('Start with list_connections: each connection says its engine.');
  });

  it('keeps a version it knows', () => {
    const result = responseOf({
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });
    expect(result).toMatchObject({ result: { protocolVersion: '2025-03-26' } });
  });

  it('answers ping with an empty object', () => {
    expect(responseOf({ jsonrpc: '2.0', id: 4, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 4, result: {} });
  });

  it('refuses what is not a request', () => {
    expect(responseOf('hello')).toMatchObject({ id: null, error: { code: rpcErrors.invalidRequest } });
    expect(responseOf({ id: 5, method: 'ping' })).toMatchObject({ id: 5, error: { code: rpcErrors.invalidRequest } });
    expect(parseErrorResponse).toMatchObject({ id: null, error: { code: rpcErrors.parse, message: 'Parse error' } });
  });

  it('refuses an unknown tool and arguments that are not an object', () => {
    const unknown = { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'drop_database' } };
    expect(responseOf(unknown)).toMatchObject({
      error: { code: rpcErrors.invalidParams, message: 'Unknown tool: drop_database' },
    });
    const notObject = {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'list_connections', arguments: [1] },
    };
    expect(responseOf(notObject)).toMatchObject({
      error: { code: rpcErrors.invalidParams, message: 'The arguments must be an object' },
    });
  });

  it('announces every tool as read-only and not destructive', () => {
    const listed = responseOf({ jsonrpc: '2.0', id: 8, method: 'tools/list' }) as {
      result: { tools: { annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] };
    };
    expect(listed.result.tools).toHaveLength(allTools.length);
    for (const tool of listed.result.tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });

  it('gives a tool that failed as a result with isError and its sentence', () => {
    const call = answer(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'list_databases', arguments: { connection: 'x' } },
      },
      allTools,
      info,
    );
    if (call.kind !== 'call') {
      throw new Error('Expected a call');
    }
    const ended = callAnswer(call, { kind: 'fail', message: 'No connection "x". Connections: Local, Cache local.' });
    expect(ended.response).toMatchObject({ result: { isError: true } });
    expect(ended.log).toMatchObject({ outcome: { kind: 'error' } });
  });

  it('names in its instructions only tools offered with readData on', () => {
    const offered = new Set(toolsOffered(mcpState().settings).map((tool) => tool.name));
    const named = instructions.match(/\b[a-z]+(?:_[a-z]+)+\b/gu) ?? [];
    expect(named.length).toBeGreaterThan(30);
    for (const name of named) {
      expect(offered.has(name), name).toBe(true);
    }
  });
});
