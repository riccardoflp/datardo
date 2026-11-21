/**
 * The calls of the MCP server carried out in the main process (`src/main/mcp/calls.ts`), with engines that a test
 * answers: a Redis server that does not answer, an error that carries a password, the Log line of each call, and the
 * read-only guard in front of every request.
 */
import { describe, expect, it } from 'vitest';
import { builtTools } from '../../../src/features/mcp';
import type { McpLogEvent } from '../../../src/features/mcp/log';
import { isReadingRequest } from '../../../src/features/mcp/tool/read-only';
import { answerMessage, runTool, type CallPorts } from '../../../src/main/mcp/calls';
import type { ConnectionRequest, Json } from '../../../src/shared/engine-request';
import { bytes, mcpState, now } from './harness';

type Send = (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;

function portsWith(send: Send, more: Partial<CallPorts> = {}) {
  const sent: ConnectionRequest[] = [];
  const logged: McpLogEvent[] = [];
  const ports: CallPorts = {
    state: () => mcpState(),
    engines: {
      send: (request, signal) => {
        sent.push(request);
        return send(request, signal);
      },
    },
    appAction: () => Promise.reject(new Error('No app action in this test.')),
    log: (event) => {
      logged.push(event);
    },
    version: '0.1.0',
    platform: 'windows',
    now: () => now,
    redisWaitMs: 20,
    ...more,
  };
  return { ports, sent, logged };
}

function toolNamed(name: string) {
  const tool = builtTools.find((each) => each.name === name);
  if (tool === undefined) {
    throw new Error(`No tool ${name}.`);
  }
  return tool;
}

function call(name: string, args: Json, id = 1): unknown {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
}

const emptyScan: Send = () => Promise.resolve([bytes('0'), []]);

describe('mcp.output-limits', () => {
  it('a Redis server that does not answer makes the tool fail with the sentence, and the next call works again', async () => {
    let answering = false;
    const { ports } = portsWith((request, signal) =>
      answering
        ? emptyScan(request, signal)
        : new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
    );
    const silent = await runTool(ports, toolNamed('redis_scan_keys'), { connection: 'Cache local' });
    expect(silent).toEqual({ kind: 'fail', message: 'Cache local did not answer within 30 s.' });
    answering = true;
    const next = await runTool(ports, toolNamed('redis_scan_keys'), { connection: 'Cache local' });
    expect(next.kind).toBe('answer');
  });

  it('gives up a MongoDB request only after its maxTimeMS, and every request it sends carries it', async () => {
    const { ports, sent } = portsWith(() => Promise.resolve({ cursor: { firstBatch: [], id: 0 } }));
    await runTool(ports, toolNamed('find_documents'), { connection: 'Local', database: 'shop', collection: 'orders' });
    const mongo = sent.filter((each) => each.request.engine === 'mongodb');
    expect(mongo.length).toBeGreaterThan(0);
    for (const each of mongo) {
      expect(each.request).toMatchObject({ timeLimitMs: 30_000 });
    }
  });
});

describe('mcp.server', () => {
  it('every request a tool sends passes the read-only guard', async () => {
    const { ports, sent } = portsWith(() => Promise.resolve({ cursor: { firstBatch: [], id: 0 } }));
    for (const tool of builtTools.filter((each) => !each.name.startsWith('redis_'))) {
      await runTool(ports, tool, { connection: 'Local', database: 'shop', collection: 'orders', pipeline: '[]' });
    }
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((each) => !isReadingRequest(each))).toEqual([]);
  });

  it('never answers with the password an error of the driver carried', async () => {
    const { ports } = portsWith(() =>
      Promise.reject(new Error('connect failed for mongodb://ada:s3cret-unit@db1:27017/?authSource=admin')),
    );
    const answer = await answerMessage(ports, call('list_databases', { connection: 'Local' }));
    const text = JSON.stringify(answer);
    expect(text).toContain('isError');
    expect(text).not.toContain('s3cret-unit');
  });

  it('a tool that is not offered is an unknown tool, and nothing is sent', async () => {
    const { ports, sent } = portsWith(emptyScan, {
      state: () => mcpState({ settings: { 'datardo.mcp.readData': false } }),
    });
    const answer = (await answerMessage(ports, call('find_documents', { connection: 'Local' }))) as {
      error?: { code: number; message: string };
    };
    expect(answer.error).toEqual({ code: -32602, message: 'Unknown tool: find_documents' });
    expect(sent).toEqual([]);
  });
});

describe('mcp.log', () => {
  it('writes one line for each call of a known tool, with how it ended', async () => {
    const { ports, logged } = portsWith(emptyScan);
    await answerMessage(ports, call('redis_scan_keys', { connection: 'Cache local' }));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ kind: 'call', tool: 'redis_scan_keys', outcome: { kind: 'ok' } });
    expect(await answerMessage(ports, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
    expect(logged).toHaveLength(1);
  });
});
