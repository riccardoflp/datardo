import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/create-search';
import { explainedSearchError } from '../../../src/features/index/search-checks';
import type { SearchIndexList } from '../../../src/features/index/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { mongoReply } from '../connection/replies';
import { contextOn, engineSteps, notices, planOf, refusalOf, started, value } from './harness';

const context = contextOn(false, 'index.create-search');
const none: SearchIndexList = { kind: 'indexes', indexes: [] };
const vector = { fields: [{ type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' }] };

function answered(type: string, definition: Json, list: SearchIndexList = none, name = ''): Answers {
  return {
    ...started({}, 'movies'),
    name,
    type,
    definition: value(definition),
    searchIndexes: list,
  };
}

describe('index.create-search', () => {
  it('names an empty name default, or vector_index for a vector index', () => {
    const search = planOf(plan(context, answered('search', { mappings: { dynamic: true } })));
    expect(engineSteps(search)[0]?.request).toMatchObject({
      collection: 'movies',
      method: 'createSearchIndex',
      arguments: ['default', { mappings: { dynamic: true } }],
    });
    expect(notices(search)).toEqual([
      'Created search index default: it is being built, and can be queried once its status is READY.',
    ]);
    const vectors = planOf(plan(context, answered('vectorSearch', vector)));
    expect(engineSteps(vectors)[0]?.request.arguments).toEqual(['vector_index', 'vectorSearch', vector]);
    const { searchIndexes: _list, ...unread } = answered('search', { mappings: { dynamic: true } });
    expect(plan(context, unread)).toEqual({
      kind: 'read',
      need: {
        key: 'searchIndexes',
        read: 'index.list-search',
        args: { connection: 'c-local', database: 'shop', collection: 'movies', name: 'default' },
      },
    });
  });

  it('refuses a name already taken, and creates nothing', () => {
    const taken: SearchIndexList = { kind: 'indexes', indexes: [{ name: 'default', type: 'search', definition: {} }] };
    expect(refusalOf(plan(context, answered('search', { mappings: { dynamic: true } }, taken)))).toEqual({
      code: 'index.create-search/name-taken',
      text: 'A search index named default already exists: open it in the list to change its definition, or choose another name.',
    });
  });

  it('refuses a fields list for a Search index', () => {
    const refused = refusalOf(plan(context, answered('search', vector)));
    expect(refused.code).toBe('index.create-search/type-mismatch');
    expect(refused.text).toMatch(/^A search index is defined by its mappings, /u);
  });

  it('shows the server error of an invalid field type without the path of the command', () => {
    const message = '"userCommand.indexes[0].mappings.fields.title.type" must be one of [string, number]';
    expect(explainedSearchError({ message })).toMatch(/^"mappings\.fields\.title\.type" must be one of/u);
    const typo = planOf(plan(context, answered('search', { mappings: { fields: { title: { type: 'strin' } } } })));
    expect(engineSteps(typo)).toHaveLength(1);
  });

  it('fails on a server without search with the help that says what it lacks', () => {
    const recorded = mongoReply('mongodb-8.2-index-list-search-error') as { message: string };
    expect(explainedSearchError(recorded)).toMatch(
      /^Search indexes need MongoDB Atlas, an Atlas local deployment \(atlas deployments setup --type local\) or MongoDB Community 8\.3 or later with mongot: this server has no search\./u,
    );
    const unsupported: SearchIndexList = { kind: 'unsupported', message: recorded.message };
    expect(
      engineSteps(planOf(plan(context, answered('search', { mappings: { dynamic: true } }, unsupported)))),
    ).toHaveLength(1);
  });

  it('is refused on a read-only connection, and refuses what the dialog would', () => {
    expect(refusalOf(plan(contextOn(true, 'index.create-search'), started({}, 'movies')))).toEqual({
      code: 'index.create-search/read-only',
      text: 'The connection Production is read-only.',
    });
    expect(refusalOf(plan(context, started({ view: true }, 'movies'))).code).toBe('index.create-search/view');
    expect(refusalOf(plan(context, answered('text', {}))).text).toBe(
      'Unknown search index type text: it is search or vectorSearch.',
    );
    expect(
      refusalOf(
        plan(context, { ...answered('search', {}), definition: { kind: 'invalid', message: 'Unexpected token' } }),
      ),
    ).toEqual({
      code: 'index.create-search/invalid',
      text: 'Definition: Unexpected token',
    });
    expect(refusalOf(plan(context, answered('search', [1]))).code).toBe('index.create-search/not-an-object');
  });
});
