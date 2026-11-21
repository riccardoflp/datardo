/**
 * The last guard of the MCP server's promise (`src/features/mcp/tool/read-only.ts`): whatever a client crafts, no
 * request that writes, kills an operation or changes a server setting passes, and the reads the tools send do.
 */
import { describe, expect, it } from 'vitest';
import {
  isReadingPipeline,
  isReadingRequest,
  isToolTab,
  notSentSentence,
  toolActions,
} from '../../../src/features/mcp/tool/read-only';
import { redisCommand, type ConnectionRequest, type Json } from '../../../src/shared/engine-request';
import { cache, local } from './harness';

function mongo(method: string, args: Json[], collection: string | null = 'orders'): ConnectionRequest {
  return {
    connection: local.id,
    request: {
      engine: 'mongodb',
      database: 'shop',
      method,
      arguments: args,
      ...(collection === null ? {} : { collection }),
    },
  };
}

function command(body: Json): ConnectionRequest {
  return mongo('runCommand', [body], null);
}

function redis(...words: string[]): ConnectionRequest {
  return { connection: cache.id, request: redisCommand(0, ...words) };
}

describe('mcp.server', () => {
  it('the promise: no method of MongoDB that writes passes, whatever its arguments', () => {
    for (const method of [
      'insertOne',
      'insertMany',
      'updateOne',
      'updateMany',
      'replaceOne',
      'deleteOne',
      'deleteMany',
      'findOneAndUpdate',
      'findOneAndDelete',
      'findOneAndReplace',
      'bulkWrite',
      'createIndex',
      'dropIndex',
      'drop',
      'dropDatabase',
      'renameCollection',
      'createCollection',
      'eval',
    ]) {
      expect(isReadingRequest(mongo(method, [{}, {}])), method).toBe(false);
    }
    for (const method of ['find', 'findOne', 'countDocuments', 'estimatedDocumentCount', 'distinct', 'listIndexes']) {
      expect(isReadingRequest(mongo(method, [{}])), method).toBe(true);
    }
  });

  it('the promise: no command that writes, kills or changes a setting passes', () => {
    for (const body of [
      { insert: 'orders', documents: [{}] },
      { update: 'orders', updates: [] },
      { delete: 'orders', deletes: [] },
      { findAndModify: 'orders', remove: true },
      { drop: 'orders' },
      { dropDatabase: 1 },
      { killOp: 1, op: 12 },
      { killCursors: 'orders', cursors: [] },
      { killSessions: [] },
      { setParameter: 1, logLevel: 5 },
      { setFeatureCompatibilityVersion: '8.0' },
      { setProfilingLevel: 2 },
      { profile: 2 },
      { profile: 0 },
      { profile: { $numberInt: '1' } },
      { replSetStepDown: 60 },
      { shutdown: 1 },
      { fsync: 1, lock: true },
      { createUser: 'eve', pwd: 'x', roles: [] },
      { explain: { delete: 'orders', deletes: [] } },
      { explain: { update: 'orders', updates: [] } },
      { explain: { findAndModify: 'orders', remove: true } },
      { explain: { aggregate: 'orders', pipeline: [{ $out: 'copy' }], cursor: {} } },
      { explain: { aggregate: 'orders', pipeline: [{ ' $merge ': { into: 'copy' } }], cursor: {} } },
      { aggregate: 'orders', pipeline: [], cursor: {} },
      {},
      [],
    ] as Json[]) {
      expect(isReadingRequest(command(body)), JSON.stringify(body)).toBe(false);
    }
    for (const body of [
      { hello: 1 },
      { serverStatus: 1 },
      { currentOp: 1, $all: true },
      { profile: -1 },
      { profile: { $numberInt: '-1' } },
      { explain: { find: 'orders', filter: {} }, verbosity: 'executionStats' },
      { explain: { aggregate: 'orders', pipeline: [{ $match: {} }], cursor: {} } },
    ] as Json[]) {
      expect(isReadingRequest(command(body)), JSON.stringify(body)).toBe(true);
    }
  });

  it('the promise: a pipeline with $out or $merge, spaced or nested as a stage, never passes', () => {
    expect(isReadingPipeline([{ $match: {} }, { $out: 'copy' }])).toBe(false);
    expect(isReadingPipeline([{ ' $out ': 'copy' }])).toBe(false);
    expect(isReadingPipeline([{ $merge: { into: 'copy' } }])).toBe(false);
    expect(isReadingPipeline('[{ $out: "copy" }]')).toBe(false);
    expect(isReadingPipeline([5])).toBe(false);
    expect(isReadingRequest(mongo('aggregate', [[{ $out: 'copy' }]]))).toBe(false);
    expect(isReadingRequest(mongo('watch', [[{ $merge: { into: 'copy' } }]]))).toBe(false);
    expect(isReadingRequest(mongo('aggregate', [[{ $match: {} }, { $group: { _id: '$a' } }]]))).toBe(true);
  });

  it('the promise: only the Redis commands the tools read with pass, in any case, and CONFIG GET of one parameter', () => {
    for (const words of [
      ['SET', 'k', 'v'],
      ['set', 'k', 'v'],
      ['DEL', 'k'],
      ['UNLINK', 'k'],
      ['FLUSHALL'],
      ['FLUSHDB'],
      ['EXPIRE', 'k', '1'],
      ['RENAME', 'k', 'j'],
      ['EVAL', 'return 1', '0'],
      ['FUNCTION', 'FLUSH'],
      ['SCRIPT', 'FLUSH'],
      ['CONFIG', 'SET', 'slowlog-log-slower-than', '0'],
      ['CONFIG', 'GET', 'requirepass'],
      ['CONFIG', 'GET', '*'],
      ['CONFIG', 'GET', 'slowlog-log-slower-than', 'requirepass'],
      ['CONFIG', 'RESETSTAT'],
      ['CLIENT', 'KILL', 'ID', '1'],
      ['CLIENT', 'PAUSE', '1000'],
      ['SLOWLOG', 'RESET'],
      ['MEMORY', 'PURGE'],
      ['OBJECT', 'FREQ', 'k'],
      ['SELECT', '1'],
      ['SHUTDOWN'],
      ['DEBUG', 'SLEEP', '1'],
      ['MULTI'],
      ['GET', 'k'],
      [],
    ]) {
      expect(isReadingRequest(redis(...words)), words.join(' ')).toBe(false);
    }
    for (const words of [
      ['SCAN', '0', 'MATCH', 'orders:*'],
      ['scan', '0'],
      ['TYPE', 'k'],
      ['OBJECT', 'encoding', 'k'],
      ['MEMORY', 'USAGE', 'k'],
      ['SLOWLOG', 'GET', '20'],
      ['CLIENT', 'LIST'],
      ['CONFIG', 'GET', 'slowlog-log-slower-than'],
      ['INFO', 'memory'],
      ['GETRANGE', 'k', '0', '99'],
    ]) {
      expect(isReadingRequest(redis(...words)), words.join(' ')).toBe(true);
    }
  });

  it('says a request that was not sent in one sentence', () => {
    expect(notSentSentence(redis('flushall'))).toBe("Datardo's MCP server only reads: FLUSHALL was not sent.");
    expect(notSentSentence(command({ dropDatabase: 1 }))).toBe(
      "Datardo's MCP server only reads: dropDatabase was not sent.",
    );
    expect(notSentSentence(mongo('deleteMany', [{}]))).toBe(
      "Datardo's MCP server only reads: deleteMany was not sent.",
    );
  });

  it('answers only the app actions the tools ask, and opens no console or playground', () => {
    expect([...toolActions].sort()).toEqual([
      'mcp.connect',
      'mcp.open-tab',
      'mcp.undo-history',
      'mcp.undo-write',
      'saved-query.list',
    ]);
    expect(isToolTab({ feature: 'tab.open', args: { shows: { kind: 'collection' } } })).toBe(true);
    expect(isToolTab({ feature: 'tab.open', args: { shows: { kind: 'console' } } })).toBe(false);
    expect(isToolTab({ feature: 'tab.open', args: { shows: { kind: 'playground' } } })).toBe(false);
    expect(isToolTab({ feature: 'document.delete', args: { shows: { kind: 'collection' } } })).toBe(false);
    expect(isToolTab(null)).toBe(false);
  });
});
