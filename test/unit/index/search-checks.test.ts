import { describe, expect, it } from 'vitest';
import {
  defaultSearchNames,
  explainedSearchError,
  isSearchUnreachable,
  isSearchUnsupported,
  searchErrorText,
  typeMismatch,
} from '../../../src/features/index/search-checks';
import { text } from '../../../src/features/index/text';
import { mongoReply } from '../connection/replies';

describe('index.search-checks', () => {
  it('gives the result of each row of the worked examples', () => {
    expect(typeMismatch('search', { mappings: { dynamic: true } })).toBeUndefined();
    expect(typeMismatch('vectorSearch', { fields: [] })).toBeUndefined();
    expect(typeMismatch('search', {})).toBeUndefined();
    expect(typeMismatch('search', { fields: [{ type: 'vector' }] })).toMatch(
      /^A search index is defined by its mappings, /u,
    );
    expect(typeMismatch('vectorSearch', { mappings: { dynamic: true } })).toMatch(
      /^A vector search index is defined by a fields list, /u,
    );
    expect(defaultSearchNames).toEqual({ search: 'default', vectorSearch: 'vector_index' });
    expect(explainedSearchError({ message: 'no search here', code: 31082 })).toBe(
      `${text.search.unsupportedHelp}\nno search here`,
    );
    expect(explainedSearchError({ message: 'Error connecting to mongot at localhost:27028', code: 508 })).toBe(
      `${text.search.unreachableHelp}\nError connecting to mongot at localhost:27028`,
    );
    expect(searchErrorText('"userCommand.indexes[0].mappings.fields.title.type" must be one of [string]')).toBe(
      '"mappings.fields.title.type" must be one of [string]',
    );
    const recorded = mongoReply('mongodb-8.2-index-list-search-error') as { message: string };
    expect(isSearchUnsupported(recorded)).toBe(true);
  });

  it('never reports a mongot that does not answer as a server without search', () => {
    const errors = [
      { message: 'Error connecting to Search Index Management service: mongot', code: 508 },
      { message: 'failed', codeName: 'SearchIndexManagementHostUnreachable' },
      { message: 'connectivity of gRPC channel to mongot failed' },
    ];
    for (const error of errors) {
      expect(isSearchUnreachable(error)).toBe(true);
      expect(explainedSearchError(error).startsWith(text.search.unreachableHelp)).toBe(true);
    }
  });

  it('shows a real error as it is', () => {
    for (const error of [
      { message: 'E11000 duplicate key error collection: shop.orders', code: 11000 },
      { message: 'connection 3 to 127.0.0.1:27017 closed' },
    ]) {
      expect(isSearchUnsupported(error)).toBe(false);
      expect(isSearchUnreachable(error)).toBe(false);
      expect(explainedSearchError(error)).toBe(error.message);
    }
  });
});
