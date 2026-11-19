import { describe, expect, it } from 'vitest';
import { allTools, toolsOffered } from '../../../src/features/mcp';
import { answer } from '../../../src/features/mcp/protocol';
import { commandShape, hiddenWithoutReadData, shapeOf, titleWithoutValues } from '../../../src/features/mcp/read-data';
import { text } from '../../../src/features/mcp/text';
import { mcpState } from './harness';

const off = mcpState({ settings: { 'datardo.mcp.readData': false } }).settings;
const on = mcpState().settings;

describe('mcp.read-data', () => {
  it('leaves the seven tools out of tools/list with the setting off, and refuses a call of one as unknown', () => {
    const offered = toolsOffered(off).map((tool) => tool.name);
    for (const name of hiddenWithoutReadData) {
      expect(offered).not.toContain(name);
    }
    expect(
      allTools
        .filter((tool) => tool.readsData)
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([...hiddenWithoutReadData].sort());
    const call = answer(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_documents', arguments: {} } },
      toolsOffered(off),
      { version: '0', instructions: text.instructions },
    );
    expect(call).toMatchObject({ kind: 'response', response: { error: { message: 'Unknown tool: find_documents' } } });
  });

  it('keeps the other tools offered with the setting off', () => {
    const offered = toolsOffered(off).map((tool) => tool.name);
    for (const name of [
      'describe_collection',
      'count_documents',
      'explain_query',
      'slow_queries',
      'index_advice',
      'server_status',
      'redis_scan_keys',
      'redis_key_details',
      'open_query',
      'datardo_writes',
    ]) {
      expect(offered).toContain(name);
    }
  });

  it('offers the seven tools again at the next request once the setting is on', () => {
    expect(toolsOffered(on)).toHaveLength(allTools.length);
  });

  it('writes the shapes of queries and commands with ? for every value', () => {
    expect(shapeOf({ status: 'paid', total: { $gt: 100 } })).toBe('{ status: ?, total: { $gt: ? } }');
    expect(shapeOf({ $or: [{ a: 1 }, { b: { $in: [1, 2] } }] })).toBe('{ $or: [ { a: ? }, { b: { $in: ? } } ] }');
    expect(shapeOf({ $set: { email: 'ada@example.com' } })).toBe('{ $set: { email: ? } }');
    expect(commandShape(['HSET', 'user:1', 'name', 'Ada'])).toBe('HSET ? ? ?');
  });

  it('takes the values out of a title of the undo history', () => {
    expect(titleWithoutValues('Delete document ObjectId("65f1…a2c")')).toBe('Delete document');
  });
});
