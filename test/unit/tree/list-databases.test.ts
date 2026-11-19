import { describe, expect, it } from 'vitest';
import { databaseOfAddress, listDatabasesArgs, parse, request } from '../../../src/features/tree/list-databases';
import { view as mongodbView } from '../../../src/features/tree/mongodb';
import { contextOf, inputOf, linesOf, mongoConnection, recorded, stateOf } from './context';

describe('tree.list-databases', () => {
  it('asks db.adminCommand({ listDatabases: 1, authorizedDatabases: true }) on admin', () => {
    const read = request(contextOf('tree.list-databases'), { connection: 'c-local' });
    expect(read.kind === 'engine' ? read.requests[0]?.request : undefined).toMatchObject({
      engine: 'mongodb',
      database: 'admin',
      method: 'runCommand',
      arguments: [{ listDatabases: { $numberInt: '1' }, authorizedDatabases: true }],
    });
  });

  it('gives each database with its name and its sizeOnDisk, sorted by name (recorded from MongoDB 8.2)', () => {
    const databases = parse([recorded('mongodb-8.2-listDatabases-sizes.json')]);
    expect(databases.map((each) => each.name)).toEqual(['admin', 'config', 'local', 'tree_shop']);
    expect(databases[3]).toEqual({ name: 'tree_shop', sizeOnDisk: 53_248 });
  });

  it('sorts the names it is given, admin, config and local among the others', () => {
    const databases = parse([{ databases: [{ name: 'shop' }, { name: 'admin' }, { name: 'local' }, { name: 'app' }] }]);
    expect(databases.map((each) => each.name)).toEqual(['admin', 'app', 'local', 'shop']);
  });

  it('a user who may not list the databases gets the database of the connection string, with no size and no error', () => {
    const args = listDatabasesArgs(stateOf(), mongoConnection().id);
    expect(args).toEqual({ connection: 'c-local', fallback: 'app' });
    const refused = { kind: 'error', message: 'not authorized on admin to execute command { listDatabases: 1 }' };
    expect(parse([refused], args)).toEqual([{ name: 'app' }]);
  });

  it('with no database in the connection string, the database test', () => {
    const state = stateOf({ connections: [mongoConnection({ address: 'mongodb://db1:27017/?tls=true' })] });
    const args = listDatabasesArgs(state, mongoConnection().id);
    expect(parse([{ kind: 'error', message: 'Unauthorized' }], args)).toEqual([{ name: 'test' }]);
    expect(databaseOfAddress('mongodb+srv://ada@cluster0.example.net/shop%2Dprod?retryWrites=true')).toBe('shop-prod');
  });

  it('a user with roles on some databases only gets those the server lists', () => {
    expect(parse([{ databases: [{ name: 'shop', sizeOnDisk: 4096 }], ok: 1 }]).map((each) => each.name)).toEqual([
      'shop',
    ]);
  });

  it('a deployment with no database gives an empty list, which the tree shows as No databases', () => {
    expect(parse([{ databases: [], ok: 1 }])).toEqual([]);
    const input = inputOf({
      island: { mongodb: { databases: { kind: 'loaded', value: [] }, contents: {}, counts: {} } },
    });
    expect(linesOf(mongodbView(input, mongoConnection()))).toEqual(['No databases']);
  });

  it('on a sharded cluster the sizes are the totals listDatabases gives', () => {
    const reply = { databases: [{ name: 'shop', sizeOnDisk: { $numberLong: '3221225472' }, shards: { a: 1, b: 2 } }] };
    expect(parse([reply])).toEqual([{ name: 'shop', sizeOnDisk: 3_221_225_472 }]);
  });
});
