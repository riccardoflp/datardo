import { describe, expect, it } from 'vitest';
import { allTools, builtTools, serverInstructions, toolsOffered, waitingTools } from '../../../src/features/mcp';
import { answer } from '../../../src/features/mcp/protocol';
import {
  commandShape,
  errorText,
  hiddenWithoutReadData,
  pipelineShape,
  shapeOf,
  titleWithoutValues,
  validatorShape,
} from '../../../src/features/mcp/read-data';
import type { MongoRequest } from '../../../src/shared/engine-request';
import type { AppState } from '../../../src/shared/state';
import { answerOf, drive, failed, failureOf, mcpState } from './harness';

const offState = mcpState({ settings: { 'datardo.mcp.readData': false } });
const off = offState.settings;
const on = mcpState().settings;

const filterRefused =
  'A filter is refused because datardo.mcp.readData is off: counting what matches a filter tells the values of the documents. Call it without a filter for the total, or use open_query to show the user the matching documents.';

const conversion = {
  ...failed("Failed to parse number 'ada@example.com' in $convert", 241),
  codeName: 'ConversionFailure',
};

const masked = 'server error 241 (ConversionFailure); its text is left out because datardo.mcp.readData is off';

const validator = {
  $jsonSchema: {
    required: ['plan'],
    properties: {
      plan: { bsonType: 'string', enum: ['free', 'pro'], description: 'the plan' },
      email: { bsonType: 'string', pattern: '^.+@example\\.com$', minLength: { $numberInt: '3' } },
      age: { bsonType: ['int', 'long'], minimum: 18 },
      tags: { bsonType: 'array', items: { bsonType: 'string', enum: ['a'] }, maxItems: 5 },
    },
  },
};

/** A collection `shop.orders`, or the view `shop.paid` on it, with an index and a validator full of values. */
function shop(rest: (request: MongoRequest) => unknown = () => undefined) {
  return (request: MongoRequest): unknown => {
    if (request.method === 'listCollections') {
      const name = (request.arguments[0] as { name: string }).name;
      return name === 'paid'
        ? [{ name, type: 'view', options: { viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] } }]
        : [{ name, type: 'collection', options: { validator } }];
    }
    if (request.method === 'listIndexes') {
      return [{ v: 2, key: { status: 1 }, name: 'active', partialFilterExpression: { status: 'active' } }];
    }
    return rest(request);
  };
}

function call(tool: string, collection: string, state: AppState, rest?: (request: MongoRequest) => unknown) {
  return drive(tool, { connection: 'Local', database: 'shop', collection }, { mongo: shop(rest) }, state);
}

describe('mcp.read-data', () => {
  it('leaves the eight tools out of tools/list with the setting off, and refuses a call of any as unknown', () => {
    expect([...hiddenWithoutReadData].sort()).toEqual(
      [
        'find_documents',
        'aggregate',
        'distinct_values',
        'explain_query',
        'watch_changes',
        'write_history',
        'datardo_write_details',
        'redis_read_value',
      ].sort(),
    );
    const offered = toolsOffered(off).map((tool) => tool.name);
    for (const name of hiddenWithoutReadData) {
      expect(offered).not.toContain(name);
      const refused = answer(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } },
        toolsOffered(off),
        { version: '0', instructions: serverInstructions() },
      );
      expect(refused).toMatchObject({
        kind: 'response',
        response: { error: { code: -32602, message: `Unknown tool: ${name}` } },
      });
    }
    expect(
      allTools
        .filter((tool) => tool.readsData)
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([...hiddenWithoutReadData].sort());
  });

  it('keeps the other tools offered with the setting off', () => {
    const offered = toolsOffered(off).map((tool) => tool.name);
    for (const name of [
      'describe_collection',
      'count_documents',
      'slow_queries',
      'index_advice',
      'server_status',
      'sharding_status',
      'redis_scan_keys',
      'redis_key_details',
      'redis_slow_log',
      'open_query',
      'datardo_writes',
    ]) {
      expect(offered).toContain(name);
    }
  });

  it('offers the eight tools again at the next request once the setting is on', () => {
    expect(toolsOffered(on)).toHaveLength(builtTools.length);
    const hiddenBuilt = hiddenWithoutReadData.filter((name) => !waitingTools.has(name));
    expect(toolsOffered(off)).toHaveLength(builtTools.length - hiddenBuilt.length);
  });

  it('counts 42 tools, 32 for MongoDB and Datardo, 10 for Redis, and offers every one, their cards being built', () => {
    expect(allTools).toHaveLength(42);
    expect(
      allTools.filter((tool) => tool.name.startsWith('redis_') && tool.name !== 'redis_oplog_status'),
    ).toHaveLength(10);
    expect([...waitingTools.keys()]).toEqual([]);
    expect(builtTools).toHaveLength(42);
    const offered = toolsOffered(on).map((tool) => tool.name);
    for (const name of ['open_explain', 'open_watch', 'describe_relations', 'open_search']) {
      expect(offered).toContain(name);
      expect(serverInstructions()).toContain(name);
    }
  });

  it('refuses a count with a filter that is not empty before anything is sent, and gives the total without one', () => {
    for (const filter of ['{ status: "active" }', '{ email: /^a/ }']) {
      const driven = drive(
        'count_documents',
        { connection: 'Local', database: 'shop', collection: 'orders', filter },
        {},
        offState,
      );
      expect(failureOf(driven)).toBe(filterRefused);
      expect(driven.sent).toEqual([]);
      expect(driven.apps).toEqual([]);
    }
    for (const filter of [undefined, '{}']) {
      const text = answerOf(
        drive(
          'count_documents',
          { connection: 'Local', database: 'shop', collection: 'orders', ...(filter === undefined ? {} : { filter }) },
          { mongo: shop((request) => (request.method === 'countDocuments' ? 2 : 2)) },
          offState,
        ),
      );
      expect(text).toBe("shop.orders has 2 documents.\nEstimate from the collection's metadata: 2 documents.");
    }
  });

  it('gives a validator as field names and types and a pipeline as its shape in collection_options', () => {
    const options = answerOf(call('collection_options', 'orders', offState, () => null));
    expect(options).toContain(
      'Validator ($jsonSchema; field names and types only, datardo.mcp.readData is off): { $jsonSchema: { required: ["plan"], properties: { plan: { bsonType: "string", enum: ?, description: ? }, email: { bsonType: "string", pattern: ?, minLength: 3 }, age: { bsonType: ["int", "long"], minimum: ? }, tags: { bsonType: "array", items: { bsonType: "string", enum: ? }, maxItems: 5 } } } }',
    );
    expect(options).not.toContain('free');
    const view = answerOf(call('collection_options', 'paid', offState, () => null));
    expect(view).toContain(
      'Pipeline (values replaced by ?, datardo.mcp.readData is off): [ { $match: { status: ? } } ]',
    );
    expect(view).not.toContain('"paid"');
  });

  it('gives a partial filter expression and a view pipeline as their shapes in describe_collection and collection_stats', () => {
    const described = answerOf(
      call('describe_collection', 'orders', offState, (request) =>
        request.method === 'estimatedDocumentCount' ? 1 : request.method === 'aggregate' ? [] : undefined,
      ),
    );
    expect(described).toContain('- active: { status: 1 } partial { status: ? }');
    const stats = answerOf(
      call('collection_stats', 'orders', offState, (request) =>
        request.method === 'aggregate' ? [{ storageStats: { count: 1, size: 10, storageSize: 10 } }] : undefined,
      ),
    );
    expect(stats).toContain('partial { status: ? }');
    expect(answerOf(call('collection_stats', 'paid', offState))).toBe(
      'shop.paid is a view on orders with the pipeline [ { $match: { status: ? } } ]: it stores no documents and has no indexes of its own; use collection_stats on orders.',
    );
  });

  it("replaces a server's error by its code, and keeps the text of errors that are not the server's", () => {
    const count = (state: AppState, reply: unknown) =>
      failureOf(
        drive(
          'count_documents',
          { connection: 'Local', database: 'shop', collection: 'orders' },
          { mongo: shop((request) => (request.method === 'countDocuments' ? reply : 1)) },
          state,
        ),
      );
    expect(count(offState, conversion)).toBe(`The count failed: ${masked}`);
    expect(count(mcpState(), conversion)).toBe(`The count failed: ${conversion.message}`);
    expect(count(offState, failed('connection 1 to 127.0.0.1:27017 closed'))).toBe(
      'The count failed: connection 1 to 127.0.0.1:27017 closed',
    );
    expect(count(offState, failed('MongoDB did not answer in time.'))).toBe(
      'The count failed: MongoDB did not answer in time.',
    );
    const unparsed = drive(
      'count_documents',
      { connection: 'Local', database: 'shop', collection: 'orders', filter: '{ a: ' },
      {},
      offState,
    );
    expect(failureOf(unparsed)).toMatch(/^filter: /u);
    const missing = drive(
      'describe_collection',
      { connection: 'Local', database: 'shop', collection: 'nope' },
      { mongo: (request) => (request.method === 'listCollections' ? [] : undefined) },
      offState,
    );
    expect(failureOf(missing)).toBe("shop.nope doesn't exist on Local: use list_collections.");
    expect(errorText(conversion, { readData: false })).toBe(masked);
    expect(errorText({ kind: 'error', message: 'ERR wrong type' }, { readData: false })).toBe('ERR wrong type');
  });

  it('with the setting on, gives the validators, pipelines, partial filters and error texts in full', () => {
    const state = mcpState();
    const options = answerOf(call('collection_options', 'orders', state, () => null));
    expect(options).toContain('enum: ["free", "pro"], description: "the plan"');
    expect(options).toContain('pattern: "^.+@example\\\\.com$"');
    const view = answerOf(call('collection_options', 'paid', state, () => null));
    expect(view).toContain('Pipeline: ');
    expect(view).toContain('status: "paid"');
    expect(answerOf(call('collection_stats', 'paid', state))).toContain('status: "paid"');
    const stats = answerOf(
      call('collection_stats', 'orders', state, (request) =>
        request.method === 'aggregate' ? [{ storageStats: { count: 1, size: 10, storageSize: 10 } }] : undefined,
      ),
    );
    expect(stats).toContain('status: "active"');
  });

  it('gives the worked examples', () => {
    expect(
      validatorShape({
        $jsonSchema: { required: ['plan'], properties: { plan: { bsonType: 'string', enum: ['free', 'pro'] } } },
      }),
    ).toBe('{ $jsonSchema: { required: ["plan"], properties: { plan: { bsonType: "string", enum: ? } } } }');
    expect(validatorShape({ status: { $in: ['a', 'b'] }, total: { $gte: 0 } })).toBe(
      '{ status: { $in: ? }, total: { $gte: ? } }',
    );
    expect(pipelineShape([{ $match: { status: 'paid' } }])).toBe('[ { $match: { status: ? } } ]');
    expect(shapeOf({ _id: 7 })).toBe('{ _id: ? }');
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
