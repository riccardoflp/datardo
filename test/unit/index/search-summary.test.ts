import { describe, expect, it } from 'vitest';
import { statusBadges, view, type IndexSectionState } from '../../../src/features/index/show';
import { searchSummary } from '../../../src/features/index/search-summary';
import type { JsonDocument } from '../../../src/features/index/types';

const vector = { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' };

describe('index.search-summary', () => {
  it('gives the lines of each definition of the examples', () => {
    const six: JsonDocument = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => [name, { type: 'string' }]),
    );
    const rows: readonly (readonly [string, JsonDocument, readonly string[]])[] = [
      ['search', { mappings: { dynamic: true } }, ['dynamic mapping: every field']],
      [
        'search',
        { mappings: { dynamic: false, fields: { title: { type: 'string' }, year: { type: 'number' } } } },
        ['2 fields: title (string), year (number)'],
      ],
      [
        'search',
        {
          analyzer: 'lucene.english',
          mappings: { dynamic: true, fields: { title: [{ type: 'string' }, { type: 'autocomplete' }] } },
        },
        ['dynamic mapping, plus title (string, autocomplete)', 'analyzer lucene.english'],
      ],
      [
        'search',
        { mappings: { dynamic: false, fields: six } },
        ['6 fields: a (string), b (string), c (string), d (string) +2'],
      ],
      [
        'search',
        { mappings: { fields: { address: { type: 'document', fields: { city: { type: 'string' } } } } } },
        ['1 field: address.city (string)'],
      ],
      ['search', { mappings: { dynamic: false } }, ['no field mapped']],
      [
        'vectorSearch',
        { fields: [vector, { type: 'filter', path: 'genre' }] },
        ['embedding · 1536 dims · cosine', 'filter: genre'],
      ],
      [
        'vectorSearch',
        { fields: [{ ...vector, quantization: 'scalar' }] },
        ['embedding · 1536 dims · cosine · scalar quantization'],
      ],
      ['vectorSearch', { fields: [{ type: 'filter', path: 'genre' }] }, ['no vector field', 'filter: genre']],
    ];
    for (const [type, definition, lines] of rows) {
      expect(searchSummary(type, definition)).toEqual(lines);
    }
  });

  it('joins the lines with · in the Definition column', () => {
    const state: IndexSectionState = {
      collection: 'movies',
      readOnly: false,
      now: 0,
      shown: true,
      loading: false,
      changing: false,
      searchIndexes: {
        kind: 'indexes',
        indexes: [
          {
            name: 'titles',
            type: 'vectorSearch',
            status: 'READY',
            queryable: true,
            definition: { fields: [vector, { type: 'filter', path: 'genre' }] },
          },
        ],
      },
    };
    expect(view(state).search.rows[0]?.definition).toBe('embedding · 1536 dims · cosine · filter: genre');
    expect(statusBadges({ name: 'x', type: 'search', status: 'READY', definition: {} })[0]?.tone).toBe('good');
  });
});
