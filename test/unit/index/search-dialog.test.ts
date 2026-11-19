import { describe, expect, it } from 'vitest';
import {
  openSearchDialog,
  searchDialogNotes,
  switchedType,
  typedDefinition,
  view,
  withDefinitionTyped,
  withFieldTicked,
  withVector,
} from '../../../src/features/index/search-dialog';
import { inputOf, type JsonDocument, type SampledField } from '../../../src/features/index/types';

const fields: readonly SampledField[] = [
  { path: 'title', types: ['string'], ratio: 0.87 },
  { path: 'embedding', types: ['array'], vector: { min: 1536, max: 1536 } },
];

function typed(definition: JsonDocument): ReturnType<typeof inputOf> {
  return inputOf(JSON.stringify(definition), definition);
}

describe('index.search-dialog', () => {
  it('fills a new vector index with the path embedding and its 1536 dimensions', () => {
    const state = switchedType(openSearchDialog({ collection: 'movies', fields }), 'vectorSearch');
    const shown = view(state);
    expect(shown.vector?.path).toBe('embedding');
    expect(shown.vector?.numDimensions).toBe(1536);
    expect(shown.vector?.paths).toEqual([{ path: 'embedding', label: '1536 numbers' }]);
    expect(typedDefinition(state)).toEqual({
      fields: [{ type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' }],
    });
    expect(shown.definition).toBe(
      '{ fields: [{ type: "vector", path: "embedding", numDimensions: 1536, similarity: "cosine" }] }',
    );
  });

  it('adds title to the fields when ticked, and keeps dynamic: true', () => {
    const state = withFieldTicked(openSearchDialog({ collection: 'movies', fields }), 'title', true);
    expect(typedDefinition(state)).toEqual({ mappings: { dynamic: true, fields: { title: { type: 'string' } } } });
    const row = view(state).fields.find((each) => each.path === 'title');
    expect(row).toMatchObject({ ticked: true, tooltip: 'string · in 87% of the documents sampled' });
  });

  it('sets Quantization to scalar when it is typed into the vector field', () => {
    const vector = {
      type: 'vector',
      path: 'embedding',
      numDimensions: 1536,
      similarity: 'cosine',
      quantization: 'scalar',
    };
    const state = withDefinitionTyped(
      switchedType(openSearchDialog({ collection: 'movies', fields }), 'vectorSearch'),
      typed({ fields: [vector] }),
    );
    expect(view(state).vector?.quantization).toBe('scalar');
  });

  it('notes vectors of another length, and still lets the index be saved', () => {
    const state = withVector(switchedType(openSearchDialog({ collection: 'movies', fields }), 'vectorSearch'), {
      numDimensions: 768,
    });
    expect(searchDialogNotes(state)).toEqual([
      "The vectors of embedding in the documents sampled have 1536 numbers, not 768: documents whose vector has another length aren't indexed.",
    ]);
    expect(view(state).button).toEqual({ label: 'Create search index', enabled: true });
    const ranged = { ...state, fields: [{ path: 'embedding', types: ['array'], vector: { min: 384, max: 1536 } }] };
    expect(searchDialogNotes(ranged)[0]).toContain('have 384 to 1536 numbers, not 768');
  });

  it('notes that nothing is mapped for { mappings: { dynamic: false } }', () => {
    const state = withDefinitionTyped(
      openSearchDialog({ collection: 'movies', fields }),
      typed({ mappings: { dynamic: false } }),
    );
    expect(searchDialogNotes(state)).toEqual([
      'No field is mapped: the index would find nothing. Turn on the dynamic mapping or tick some fields.',
    ]);
  });

  it('shows the search definition as it was typed after switching to Vector Search and back', () => {
    const custom = typed({ mappings: { dynamic: false, fields: { title: { type: 'string' } } } });
    const state = withDefinitionTyped(openSearchDialog({ collection: 'movies', fields }), custom);
    const back = switchedType(switchedType(state, 'vectorSearch'), 'search');
    expect(back.definition).toEqual(custom);
  });

  it('fixes the name and the type when editing, and enables Save changes once the definition differs', () => {
    const editing = { name: 'titles', type: 'search' as const, definition: { mappings: { dynamic: true } } };
    const state = openSearchDialog({ collection: 'movies', editing, fields });
    const shown = view(state);
    expect(shown.title).toBe('Edit search index · titles');
    expect(shown.name.locked && shown.type.locked).toBe(true);
    expect(switchedType(state, 'vectorSearch')).toBe(state);
    expect(shown.button).toEqual({ label: 'Save changes', enabled: false });
    expect(shown.notes).toEqual(['No changes yet.']);
    const changed = withDefinitionTyped(state, typed({ mappings: { dynamic: false } }));
    expect(view(changed).button.enabled).toBe(true);
    expect(view(changed).command).toBe(
      'db.getCollection("movies").updateSearchIndex("titles", { mappings: { dynamic: false } })',
    );
  });
});
