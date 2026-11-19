import { describe, expect, it } from 'vitest';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { distinctPipeline, relationLine } from '../../../src/features/mcp/data-model-tools';
import { validationLines } from '../../../src/features/mcp/tool/collection-options';
import { channelsOf, inScope, withoutRedisString } from '../../../src/features/mcp/tool/oplog-status';
import { mongoConnection } from '../connection/context';
import { answerOf, bytes, cache, drive, failed, failureOf, local, mcpState, nameOf } from './harness';

function items(overrides: (request: MongoRequest) => unknown) {
  return (request: MongoRequest): unknown => {
    if (request.method === 'listCollections') {
      return [{ name: (request.arguments[0] as { name: string }).name, type: 'collection', options: {} }];
    }
    return overrides(request) ?? failed(`unexpected ${nameOf(request)}`);
  };
}

const at = Date.parse('2026-11-17T10:20:30Z');

describe('mcp.data-model-tools', () => {
  it('counts a collection without a filter, with the estimate', () => {
    const text = answerOf(
      drive(
        'count_documents',
        { connection: 'Local', database: 'shop', collection: 'items' },
        {
          mongo: items((request) =>
            request.method === 'countDocuments' ? 5 : request.method === 'estimatedDocumentCount' ? 5 : undefined,
          ),
        },
      ),
    );
    expect(text).toBe("shop.items has 5 documents.\nEstimate from the collection's metadata: 5 documents.");
  });

  it('counts the documents of a filter, one in the singular', () => {
    const two = answerOf(
      drive(
        'count_documents',
        { connection: 'Local', database: 'shop', collection: 'items', filter: '{ status: "active" }' },
        {
          mongo: items((request) => (request.method === 'countDocuments' ? 2 : undefined)),
        },
      ),
    );
    expect(two).toBe('shop.items: 2 documents match { status: "active" }.');
    const one = answerOf(
      drive(
        'count_documents',
        { connection: 'Local', database: 'shop', collection: 'items', filter: '{ status: "active" }' },
        {
          mongo: items((request) => (request.method === 'countDocuments' ? 1 : undefined)),
        },
      ),
    );
    expect(one).toBe('shop.items: 1 document matches { status: "active" }.');
  });

  it('stops counting at 100,000 without exact, and says a failed count', () => {
    const capped = answerOf(
      drive(
        'count_documents',
        { connection: 'Local', database: 'shop', collection: 'items', filter: '{ a: 1 }' },
        {
          mongo: items((request) => (request.method === 'countDocuments' ? 100_000 : undefined)),
        },
      ),
    );
    expect(capped).toContain('at least 100,000 documents');
    expect(capped).toContain('(counting stopped there: pass exact: true for the exact number)');
    const failing = drive(
      'count_documents',
      { connection: 'Local', database: 'shop', collection: 'items' },
      {
        mongo: items((request) => (request.method === 'countDocuments' ? failed('operation exceeded time limit') : 5)),
      },
    );
    expect(failureOf(failing)).toBe('The count failed: operation exceeded time limit');
  });

  it('counts an array element once per document, and refuses a field that is not a path', () => {
    const pipeline = JSON.stringify(distinctPipeline('tags', {}, 50));
    expect(pipeline).toContain('$setUnion');
    const refused = drive('distinct_values', {
      connection: 'Local',
      database: 'shop',
      collection: 'items',
      field: '$status',
    });
    expect(failureOf(refused)).toBe('field must be a field path like address.city, not "$status".');
    expect(
      failureOf(
        drive('distinct_values', { connection: 'Local', database: 'shop', collection: 'items', field: 'a..b' }),
      ),
    ).toBe('field must be a field path like address.city, not "a..b".');
    const failing = drive(
      'distinct_values',
      { connection: 'Local', database: 'shop', collection: 'items', field: 'status' },
      {
        mongo: items(() => failed('too big')),
      },
    );
    expect(failureOf(failing)).toBe('The aggregation failed: too big');
  });

  it('cuts each distinct value at 300 characters', () => {
    const text = answerOf(
      drive(
        'distinct_values',
        { connection: 'Local', database: 'shop', collection: 'items', field: 'note' },
        {
          mongo: items(() => [
            {
              values: [{ _id: { v: 'n'.repeat(400), missing: false }, n: 3, types: ['string'] }],
              total: [{ n: 1 }],
              nulls: [],
              missing: [],
            },
          ]),
        },
      ),
    );
    expect(text).toContain(`- "${'n'.repeat(299)}…: 3 documents`);
  });

  it('writes a relation between collections', () => {
    expect(
      relationLine({
        kind: 'reference',
        from: 'orders',
        field: 'customerId',
        to: 'customers',
        matched: 20,
        tested: 20,
      }),
    ).toBe('- orders.customerId → customers._id (one per document; 20 of 20 sampled values found, 100%)');
  });

  it('explains the validation', () => {
    expect(validationLines(undefined, undefined)).toEqual([
      'validationLevel: strict (default): every insert and update is validated.',
      'validationAction: error (default): invalid writes are refused (error 121, Document failed validation).',
    ]);
    const text = answerOf(
      drive(
        'collection_options',
        { connection: 'Local', database: 'shop', collection: 'items' },
        {
          mongo: items((request) => (request.method === 'findOne' ? null : undefined)),
        },
      ),
    );
    expect(text).toContain('No validator: any document is accepted.');
  });

  it('lists the saved queries, those of the folder first, and checks the collection when there are none', () => {
    const reply = {
      connectionName: 'Local',
      folder: null,
      mine: [
        {
          name: 'Open orders',
          database: 'shop',
          collection: 'orders',
          at,
          query: {
            kind: 'find',
            filter: '{ status: "paid", total: { $gt: 100 } }',
            sort: '{ at: -1 }',
            projection: '',
          },
        },
      ],
      recent: [],
    };
    const driven = drive(
      'list_saved_queries',
      { connection: 'Local', database: 'shop', collection: 'orders' },
      {
        mongo: items(() => undefined),
        app: () => reply,
      },
    );
    const text = answerOf(driven);
    expect(text).toContain('- "Open orders", saved for the user 2026-11-17T10:20:30Z');
    expect(text).toContain('  filter: { status: "paid", total: { $gt: 100 } }');
    expect(text).toContain('  sort: { at: -1 }');
    const hidden = answerOf(
      drive(
        'list_saved_queries',
        { connection: 'Local', database: 'shop', collection: 'orders' },
        { mongo: items(() => undefined), app: () => reply },
        mcpState({ settings: { 'datardo.mcp.readData': false } }),
      ),
    );
    expect(hidden).toContain('  filter: { status: ?, total: { $gt: ? } }');
    const none = drive(
      'list_saved_queries',
      { connection: 'Local', database: 'shop', collection: 'orders' },
      {
        mongo: items(() => undefined),
        app: () => ({ connectionName: 'Local', folder: null, mine: [], recent: [] }),
      },
    );
    expect(none.sent.map((each) => (each.request as MongoRequest).method)).toEqual(['listCollections']);
    expect(answerOf(none)).toBe('No saved or recent queries for shop.orders on Local.');
  });

  it('says a connection that does not publish, and one that is read-only', () => {
    const readOnly = mongoConnection({ id: connectionId('c-prod'), name: 'Prod', readOnly: true });
    const text = answerOf(
      drive('redis_oplog_status', { connection: 'Prod' }, {}, mcpState({ connections: [readOnly, cache] })),
    );
    expect(text).toBe(
      "Prod doesn't publish Datardo's writes to Redis for redis-oplog (it can be turned on in the connection form).\nProd is read-only: Datardo makes no writes through it, so nothing is published.",
    );
  });

  it('names the linked connection, never its string, and the channels of a collection in scope', () => {
    const publishing = mongoConnection({
      publishesTo: cache.id,
      oplog: {
        enabled: true,
        prefix: '',
        namespaces: [],
        patterns: ['shop.*'],
        lastError: 'connect ECONNREFUSED redis://:secret@cache:6379',
      },
    });
    const state = mcpState({ connections: [publishing, cache] });
    const text = answerOf(
      drive(
        'redis_oplog_status',
        { connection: 'Local', database: 'shop', collection: 'orders', check: true },
        { redis: () => bytes('PONG') },
        state,
      ),
    );
    expect(text).toContain('Linked connection: Cache local.');
    expect(text).toContain('The writes on shop.orders go to the channels orders, orders::<_id>.');
    expect(text).toContain('<Redis connection string>');
    expect(text).not.toContain('secret');
    expect(text).toContain('Redis answers (PING).');
    const out = answerOf(
      drive('redis_oplog_status', { connection: 'Local', database: 'other', collection: 'orders' }, {}, state),
    );
    expect(out).toContain('The writes on other.orders are not published (no pattern matches).');
    const missing = mongoConnection({ oplog: { enabled: true } });
    expect(
      answerOf(drive('redis_oplog_status', { connection: 'Local' }, {}, mcpState({ connections: [missing] }))),
    ).toContain(
      'Linked connection: missing: nothing can be published until a Redis connection is linked again in the connection form.',
    );
  });

  it('reads the scope and the channels as oplog.scope and oplog.publish do', () => {
    expect(inScope([], 'shop', 'orders')).toBe(true);
    expect(inScope(['shop'], 'shop', 'orders')).toBe(true);
    expect(inScope(['shop.ord*'], 'shop', 'orders')).toBe(true);
    expect(inScope(['shop.items'], 'shop', 'orders')).toBe(false);
    expect(channelsOf({ enabled: true, prefix: 'app:', namespaces: ['ns'], patterns: [] }, 'orders')).toEqual([
      'app:orders',
      'app:ns::orders',
      'app:orders::<_id>',
    ]);
    expect(withoutRedisString('failed: rediss://u:p@host:6380/0 down')).toBe('failed: <Redis connection string> down');
    expect(local.name).toBe('Local');
  });
});
