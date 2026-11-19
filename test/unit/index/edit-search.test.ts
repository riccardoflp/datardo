import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/edit-search';
import { view, type IndexSectionState } from '../../../src/features/index/show';
import { contextOn, engineSteps, notices, planOf, refusalOf, started, value } from './harness';

const context = contextOn(false, 'index.edit-search');
const row = { index: 'titles', type: 'search', definition: { mappings: { dynamic: true } } };

describe('index.edit-search', () => {
  it('saves a new definition of titles, built while the old one answers queries', () => {
    const definition = { mappings: { dynamic: false, fields: { title: { type: 'string' } } } };
    const shown = planOf(plan(context, { ...started(row, 'movies'), definition: value(definition) }));
    expect(engineSteps(shown)[0]?.request).toMatchObject({
      method: 'updateSearchIndex',
      arguments: ['titles', definition],
    });
    expect(shown.danger).toEqual({ kind: 'none' });
    expect(notices(shown)).toEqual([
      'Search index titles: the new definition is being built. Queries keep using the previous one until it is ready.',
    ]);
  });

  it('sends the change of an index that no longer exists, for the server to name it', () => {
    const asked = plan(context, {
      ...started({ index: 'gone' }, 'movies'),
      searchIndexes: { kind: 'indexes', indexes: [] },
    });
    expect(asked.kind).toBe('ask');
    const sent = planOf(
      plan(context, {
        ...started({ index: 'gone' }, 'movies'),
        searchIndexes: { kind: 'indexes', indexes: [] },
        definition: value({ mappings: { dynamic: true } }),
      }),
    );
    expect(engineSteps(sent)[0]?.request.arguments[0]).toBe('gone');
  });

  it('refuses mappings for a vector search index', () => {
    const vectorRow = { index: 'vectors', type: 'vectorSearch', definition: { fields: [] } };
    const refused = refusalOf(
      plan(context, { ...started(vectorRow, 'movies'), definition: value({ mappings: { dynamic: true } }) }),
    );
    expect(refused.code).toBe('index.edit-search/type-mismatch');
    expect(refused.text).toMatch(/^A vector search index is defined by a fields list, /u);
  });

  it('has no Edit… on an index that is DELETING', () => {
    const state: IndexSectionState = {
      collection: 'movies',
      readOnly: false,
      now: 0,
      shown: true,
      loading: false,
      changing: false,
      searchIndexes: {
        kind: 'indexes',
        indexes: [{ name: 'titles', type: 'search', status: 'DELETING', definition: {} }],
      },
    };
    expect(view(state).search.rows[0]?.menu).toEqual([]);
    expect(refusalOf(plan(contextOn(true, 'index.edit-search'), started(row, 'movies'))).code).toBe(
      'index.edit-search/read-only',
    );
  });
});
