import { describe, expect, it } from 'vitest';
import { listSearchRequest, parse } from '../../../src/features/index/list-search';
import { mongoReply } from '../connection/replies';

describe('index.list-search', () => {
  it('tells the type of an index of mongot that reports none from its definition', () => {
    expect(
      listSearchRequest({ connection: 'c', database: 'shop', collection: 'movies', name: 'default' }).arguments,
    ).toEqual([[{ $listSearchIndexes: { name: 'default' } }]]);
    const result = parse([
      [
        {
          name: 'vectors',
          status: 'READY',
          queryable: true,
          latestDefinition: { fields: [{ type: 'vector', path: 'v' }] },
        },
        { name: 'default', status: 'READY', queryable: true, latestDefinition: { mappings: { dynamic: true } } },
      ],
    ]);
    expect(result.kind === 'indexes' ? result.indexes.map((index) => index.type) : []).toEqual([
      'vectorSearch',
      'search',
    ]);
  });

  it('returns a host with its main status and the status of its staged definition', () => {
    const result = parse([
      [
        {
          name: 'titles',
          status: 'READY',
          queryable: true,
          latestDefinition: { mappings: { dynamic: true } },
          statusDetail: [
            {
              hostname: 'mongot1:27028',
              mainIndex: { status: 'READY', queryable: true },
              stagedIndex: { status: 'BUILDING', queryable: false },
            },
          ],
        },
      ],
    ]);
    const host = result.kind === 'indexes' ? result.indexes[0]?.hosts?.[0] : undefined;
    expect(host).toMatchObject({ host: 'mongot1:27028', status: 'READY', staged: 'BUILDING' });
  });

  it('returns unsupported, with no indexes and no error, on a server without mongot', () => {
    const recorded = mongoReply('mongodb-8.2-index-list-search-error') as { message: string };
    const result = parse([new Error(recorded.message)]);
    expect(result).toEqual({ kind: 'unsupported', message: recorded.message });
  });

  it('returns an error, never unsupported, for a mongot that does not answer', () => {
    const error = Object.assign(new Error('Error connecting to Search Index Management service.'), { code: 508 });
    const result = parse([error]);
    expect(result.kind).toBe('error');
    expect(result.kind === 'error' ? result.message : '').toMatch(
      /^The server is set up for search but cannot reach mongot/u,
    );
  });
});
