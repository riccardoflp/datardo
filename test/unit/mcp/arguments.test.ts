import { describe, expect, it } from 'vitest';
import { connectionId } from '../../../src/shared/ids';
import {
  boolArg,
  intArg,
  listArg,
  oneOfArg,
  resumeToken,
  stringArg,
  timeArg,
  toolTarget,
} from '../../../src/features/mcp/arguments';
import { ToolProblem } from '../../../src/features/mcp/tool/program';
import { mongoConnection } from '../connection/context';
import { answerOf, cache, drive, failureOf, local, mcpState, now } from './harness';

function problemOf(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof ToolProblem) {
      return error.message;
    }
    throw error;
  }
  throw new Error('Expected a refusal');
}

describe('mcp.arguments', () => {
  it('finds a connection by id before its name, and by name in any case', () => {
    const named = mongoConnection({ id: connectionId('c-other'), name: 'c-local' });
    expect(toolTarget({ connection: 'c-local' }, [named, local])).toBe(local);
    expect(toolTarget({ connection: 'LOCAL' }, [named, local])).toBe(local);
  });

  it('refuses a name used twice with the ids to choose from', () => {
    const twin = mongoConnection({ id: connectionId('c-twin'), name: 'Local' });
    expect(problemOf(() => toolTarget({ connection: 'Local' }, [local, twin]))).toBe(
      'More than one connection is named "Local": use the id (c-local, c-twin).',
    );
  });

  it('refuses an unknown name with the names there are, or none', () => {
    const test = mongoConnection({ name: 'test' });
    expect(problemOf(() => toolTarget({ connection: 'nope' }, [test]))).toBe(
      'No connection "nope". Connections: test.',
    );
    expect(problemOf(() => toolTarget({ connection: 'nope' }, []))).toBe('No connection "nope". Connections: none.');
  });

  it('reads a time ago or an ISO date, and refuses anything else', () => {
    expect(timeArg('15m', 'since', now)).toBe(now - 15 * 60_000);
    expect(timeArg('2024-05-01T10:00:00Z', 'since', now)).toBe(Date.parse('2024-05-01T10:00:00Z'));
    expect(problemOf(() => timeArg('yesterday', 'since', now))).toBe(
      'since must be an ISO date (e.g. 2024-05-01T10:00:00Z) or a time ago like "15m", "2h", "1d".',
    );
  });

  it('reads a resume token in each of its forms', () => {
    expect(resumeToken('{ _data: "82AB" }')).toEqual({ _data: '82AB' });
    expect(resumeToken('82AB')).toEqual({ _data: '82AB' });
    expect(resumeToken({ _data: '82AB' })).toEqual({ _data: '82AB' });
    expect(resumeToken(undefined)).toBeUndefined();
    expect(problemOf(() => resumeToken('not a token'))).toBe(
      'resumeAfter must be the resume token returned by watch_changes: its _data string (hex), or { _data: "…" }.',
    );
  });

  it('reads whole numbers given as numbers or digits, within their range', () => {
    expect(intArg({ limit: '5' }, 'limit', [20, 1, 100])).toBe(5);
    expect(intArg({}, 'limit', [20, 1, 100])).toBe(20);
    expect(problemOf(() => intArg({ limit: 500 }, 'limit', [20, 1, 100]))).toBe('limit must be between 1 and 100.');
    expect(problemOf(() => intArg({ limit: 1.5 }, 'limit', [20, 1, 100]))).toBe('limit must be a whole number.');
  });

  it('reads strings, switches, lists and names of a fixed set', () => {
    expect(stringArg({ name: '  x ' }, 'name')).toBe('x');
    expect(stringArg({ name: '' }, 'name')).toBeUndefined();
    expect(problemOf(() => stringArg({ name: 3 }, 'name'))).toBe('name must be a string.');
    expect(problemOf(() => boolArg({ exact: 'yes' }, 'exact', false))).toBe('exact must be true or false.');
    expect(listArg({ operations: 'insert, update' }, 'operations', ['insert', 'update'])).toEqual(['insert', 'update']);
    expect(problemOf(() => listArg({ operations: ['drop'] }, 'operations', ['insert', 'update']))).toBe(
      'operations: unknown drop. Use insert, update.',
    );
    expect(problemOf(() => oneOfArg({ source: 'disk' }, 'source', ['auto', 'log']))).toBe(
      'source must be one of auto, log.',
    );
  });

  it('refuses a tool of the other engine before anything is sent', () => {
    const mongo = drive('find_documents', { connection: 'Cache local', database: 'shop', collection: 'orders' });
    expect(failureOf(mongo)).toBe(
      'Cache local is a Redis connection: use the redis_ tools (redis_scan_keys, redis_key_details).',
    );
    expect(mongo.sent).toEqual([]);
    const redis = drive('redis_scan_keys', { connection: 'Local' });
    expect(failureOf(redis)).toBe(
      'Local is a MongoDB connection: use list_databases, list_collections and the other tools without redis_.',
    );
    expect(redis.sent).toEqual([]);
  });

  it('refuses a Redis database the server does not have', () => {
    const driven = drive(
      'redis_key_details',
      { connection: 'Cache local', database: 16, key: 'orders:42' },
      { redis: () => ({ kind: 'error', message: 'ERR DB index is out of range' }) },
    );
    expect(failureOf(driven)).toBe(`${cache.name} has no database 16.`);
  });

  it('refuses a collection that does not exist, and a collection without its database', () => {
    const missing = drive(
      'find_documents',
      { connection: 'Local', database: 'shop', collection: 'nope' },
      { mongo: () => [] },
    );
    expect(failureOf(missing)).toBe("shop.nope doesn't exist on Local: use list_collections.");
    const noDatabase = drive('watch_changes', { connection: 'Local', collection: 'orders' });
    expect(failureOf(noDatabase)).toBe('collection needs database.');
  });

  it('connects a connection that is not connected, and refuses one only the user can connect, without a dialog', () => {
    const state = mcpState({ connected: false });
    const connects = drive(
      'list_databases',
      { connection: 'Local' },
      {
        app: (action) => (action === 'mcp.connect' ? 'connected' : null),
        mongo: () => ({ databases: [{ name: 'shop', sizeOnDisk: 1024 }], ok: 1 }),
      },
      state,
    );
    expect(connects.apps).toEqual([{ action: 'mcp.connect', args: { connection: 'c-local' } }]);
    expect(answerOf(connects)).toContain('shop');
    const refused = drive('list_databases', { connection: 'Local' }, { app: () => 'needs-the-user' }, state);
    expect(failureOf(refused)).toBe('Local is not connected and needs the user to connect it in Datardo.');
  });
});
