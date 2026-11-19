import { describe, expect, it } from 'vitest';
import { bucketNames, parse, request } from '../../../src/features/tree/list-collections';
import { contextOf, recorded } from './context';

describe('tree.list-collections', () => {
  it('asks getCollectionInfos({}, { nameOnly: true, authorizedCollections: true }) of the database: no option, index or count', () => {
    const read = request(contextOf('tree.list-collections'), { connection: 'c-local', database: 'shop' });
    expect(read.kind === 'engine' ? read.requests : []).toEqual([
      {
        connection: 'c-local',
        request: expect.objectContaining({
          engine: 'mongodb',
          database: 'shop',
          method: 'listCollections',
          arguments: [{}, { nameOnly: true, authorizedCollections: true }],
        }) as unknown,
      },
    ]);
  });

  it('gives each entry with its name and its kind from type, in the order of the tree (recorded from MongoDB 8.2)', () => {
    const contents = parse([recorded('mongodb-8.2-tree-listCollections.json')]);
    expect(contents.entries.map((each) => `${each.name} ${each.kind}`)).toEqual([
      'active_orders view',
      'Customers collection',
      'fs.chunks collection',
      'fs.files collection',
      'img.files collection',
      'orders collection',
      'weather timeseries',
      'system.buckets.weather collection',
      'system.views collection',
    ]);
    expect(contents.entries.filter((each) => each.system).map((each) => each.name)).toEqual([
      'system.buckets.weather',
      'system.views',
    ]);
  });

  it('the buckets are the names X with both X.files and X.chunks: fs.files, fs.chunks and img.files give fs only', () => {
    expect(parse([recorded('mongodb-8.2-tree-listCollections.json')]).buckets).toEqual(['fs']);
    expect(bucketNames(['b.files', 'b.chunks', 'a.files', 'a.chunks', 'c.chunks'])).toEqual(['a', 'b']);
  });

  it('a user who may read some collections only gets those the server lists', () => {
    expect(parse([[{ name: 'orders', type: 'collection' }]]).entries.map((each) => each.name)).toEqual(['orders']);
  });

  it('a database with no collection gives an empty list', () => {
    expect(parse([[]])).toEqual({ buckets: [], entries: [] });
  });

  it('a list that is refused fails with the message of the server', () => {
    const message = 'not authorized on shop to execute command { listCollections: 1, … }';
    expect(() => parse([{ kind: 'error', message }])).toThrow(message);
  });
});
