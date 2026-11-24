import { describe, expect, it } from 'vitest';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { indexLine } from '../../../src/features/mcp/data-tools';
import { answerOf, drive, failed, failureOf, long, nameOf } from './harness';

const orders = { name: 'orders', type: 'collection', options: {} };
const view = { name: 'paid', type: 'view', options: { viewOn: 'orders', pipeline: [] } };

function shop(overrides: (request: MongoRequest) => unknown = () => undefined) {
  return (request: MongoRequest): unknown => {
    const given = overrides(request);
    if (given !== undefined) {
      return given;
    }
    if (request.method === 'listCollections') {
      const name = (request.arguments[0] as { name?: string } | undefined)?.name;
      return [orders, view].filter((each) => name === undefined || each.name === name);
    }
    return { kind: 'error', message: `unexpected ${nameOf(request)}` };
  };
}

const allowed = new Set([
  'listDatabases',
  'listCollections',
  'aggregate',
  'listIndexes',
  'find',
  'countDocuments',
  'estimatedDocumentCount',
  'runCommand:listDatabases',
]);

describe('mcp.data-tools', () => {
  it('lists both engines, each with its engine, and never a connection string, a password or a user', () => {
    const text = answerOf(drive('list_connections', {}));
    expect(text).toContain('"name": "Local"');
    expect(text).toContain('"engine": "mongodb"');
    expect(text).toContain('"name": "Cache local"');
    expect(text).toContain('"engine": "redis"');
    expect(text).not.toContain('mongodb://');
    expect(text).not.toContain('ada');
    expect(text).not.toContain('redis://');
  });

  it('describes a collection: the estimate, the sample, the indexes and the fields', () => {
    const driven = drive(
      'describe_collection',
      { connection: 'Local', database: 'shop', collection: 'orders' },
      {
        mongo: shop((request) => {
          if (request.method === 'estimatedDocumentCount') {
            return 1234;
          }
          if (request.method === 'listIndexes') {
            return [
              { v: 2, key: { _id: 1 }, name: '_id_' },
              { v: 2, key: { email: 1 }, name: 'email_1', unique: true, sparse: true },
            ];
          }
          if (request.method === 'aggregate') {
            const [stage] = request.arguments[0] as Record<string, unknown>[];
            return stage !== undefined && '$listSearchIndexes' in stage
              ? failed('$listSearchIndexes is only valid on Atlas')
              : Array.from({ length: 200 }, (_, index) => ({
                  _id: index,
                  address: { city: index % 50 === 0 ? null : 'Paris' },
                }));
          }
          return undefined;
        }),
      },
    );
    const text = answerOf(driven);
    expect(text.split('\n')[0]).toBe('shop.orders: about 1,234 documents, 200 documents sampled.');
    expect(text).toContain('- email_1: { email: 1 } unique sparse');
    expect(text).toContain('- address.city: string 98%, null 2% (100%)');
    expect(text).not.toContain('Search indexes');
    for (const each of driven.sent) {
      expect(allowed.has(nameOf(each.request as MongoRequest))).toBe(true);
    }
  });

  it('says an unknown number when the estimate fails, and no index for a view', () => {
    const text = answerOf(
      drive(
        'describe_collection',
        { connection: 'Local', database: 'shop', collection: 'paid' },
        {
          mongo: shop((request) =>
            request.method === 'estimatedDocumentCount'
              ? failed('no')
              : request.method === 'aggregate' || request.method === 'listIndexes'
                ? []
                : undefined,
          ),
        },
      ),
    );
    expect(text.split('\n')[0]).toBe('shop.paid: unknown number of 0 documents sampled.');
    expect(text).toContain('- none (a view)');
  });

  it('writes an index with all its options', () => {
    expect(
      indexLine(
        {
          name: 'ttl',
          key: { at: 1 },
          unique: true,
          sparse: true,
          expireAfterSeconds: 3600,
          partialFilterExpression: { a: 1 },
          hidden: true,
        },
        true,
      ),
    ).toBe('- ttl: { at: 1 } unique sparse TTL 3600s partial { a: 1 } hidden');
  });

  it('writes a partial filter expression as its shape with datardo.mcp.readData off', () => {
    expect(
      indexLine({ name: 'active', key: { status: 1 }, partialFilterExpression: { status: 'active' } }, false),
    ).toBe('- active: { status: 1 } partial { status: ? }');
  });

  it('finds documents, with their BSON types kept', () => {
    const found = [
      {
        _id: { $oid: '65f1a2b3c4d5e6f708192a3b' },
        at: { $date: '2026-01-01T00:00:00Z' },
        n: long(5),
        price: { $numberDecimal: '9.99' },
      },
    ];
    const text = answerOf(
      drive(
        'find_documents',
        { connection: 'Local', database: 'shop', collection: 'orders' },
        {
          mongo: shop((request) =>
            request.method === 'find' ? [...found, {}, {}] : request.method === 'countDocuments' ? 3 : undefined,
          ),
        },
      ),
    );
    expect(text.split('\n')[0]).toBe('shop.orders: 3 documents match, showing 1–3.');
    expect(text).toContain('ObjectId("65f1a2b3c4d5e6f708192a3b")');
    expect(text).toContain('ISODate("2026-01-01T00:00:00');
    expect(text).toContain('NumberLong');
    // The card says Decimal128(…); the formatter of the query area writes NumberDecimal(…), which mongosh also reads.
    expect(text).toContain('NumberDecimal("9.99")');
  });

  it('says at least 100,000, an unknown number, or none returned', () => {
    const many = answerOf(
      drive(
        'find_documents',
        { connection: 'Local', database: 'shop', collection: 'orders' },
        {
          mongo: shop((request) =>
            request.method === 'find' ? [{}] : request.method === 'countDocuments' ? 100_000 : undefined,
          ),
        },
      ),
    );
    expect(many.split('\n')[0]).toBe('shop.orders: At least 100,000 documents match, showing 1–1.');
    const unknown = answerOf(
      drive(
        'find_documents',
        { connection: 'Local', database: 'shop', collection: 'orders' },
        {
          mongo: shop((request) =>
            request.method === 'find' ? [] : request.method === 'countDocuments' ? failed('slow') : undefined,
          ),
        },
      ),
    );
    expect(unknown).toBe('shop.orders: An unknown number of documents match, none returned.\n\n[]');
  });

  it('aggregates, saying when there are more results than the limit', () => {
    const text = answerOf(
      drive(
        'aggregate',
        { connection: 'Local', database: 'shop', collection: 'paid', pipeline: '[ { $match: {} } ]' },
        {
          mongo: shop((request) =>
            request.method === 'aggregate' ? Array.from({ length: 21 }, (_, index) => ({ index })) : undefined,
          ),
        },
      ),
    );
    expect(text.split('\n')[0]).toBe('shop.paid: 20 results (the first 20; there are more).');
  });

  it('refuses list_databases on a Redis connection', () => {
    expect(failureOf(drive('list_databases', { connection: 'Cache local' }))).toBe(
      'Cache local is a Redis connection: use the redis_ tools (redis_scan_keys, redis_key_details).',
    );
  });
});
