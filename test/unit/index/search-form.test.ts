import { describe, expect, it } from 'vitest';
import {
  dynamicDefinition,
  mappedPaths,
  staticDefinition,
  vectorForm,
  withFieldMapped,
  withVectorForm,
} from '../../../src/features/index/search-form';
import type { JsonDocument, SampledField } from '../../../src/features/index/types';

const fields: readonly SampledField[] = [
  { path: '_id', types: ['objectId'] },
  { path: 'title', types: ['string'] },
  { path: 'price', types: ['int', 'double'] },
  { path: 'code', types: ['string', 'int'] },
  { path: 'embedding', types: ['array'], vector: { min: 1536, max: 1536 } },
  { path: 'address', types: ['object'] },
  { path: 'address.city', types: ['string'] },
];

const empty: JsonDocument = { mappings: { dynamic: false, fields: {} } };
const vectorField = { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' };

describe('index.search-form', () => {
  it('gives the result of each row of the examples', () => {
    expect(withFieldMapped(dynamicDefinition(), 'title', true, fields)).toEqual({
      mappings: { dynamic: true, fields: { title: { type: 'string' } } },
    });
    expect(withFieldMapped({}, 'price', true, fields)).toEqual({
      mappings: { dynamic: false, fields: { price: { type: 'number' } } },
    });
    expect(withFieldMapped(empty, 'code', true, fields)).toEqual({
      mappings: { dynamic: false, fields: { code: [{ type: 'string' }, { type: 'number' }] } },
    });
    const city = withFieldMapped(empty, 'address.city', true, fields);
    expect(city).toEqual({
      mappings: {
        dynamic: false,
        fields: { address: { type: 'document', fields: { city: { type: 'string' } } } },
      },
    });
    expect(withFieldMapped(city, 'address.city', false, fields)).toEqual(empty);
    expect(withFieldMapped(empty, 'address', true, fields)).toEqual({
      mappings: { dynamic: false, fields: { address: { type: 'document', dynamic: true } } },
    });
    expect(staticDefinition(fields.filter((field) => field.path !== 'price' && field.path !== 'code'))).toEqual({
      mappings: {
        dynamic: false,
        fields: {
          title: { type: 'string' },
          address: { type: 'document', fields: { city: { type: 'string' } } },
        },
      },
    });
    const form = { path: 'embedding', numDimensions: 1536, similarity: 'cosine', quantization: 'none', filters: [] };
    const written = withVectorForm({ fields: [] }, form);
    expect(written).toEqual({ fields: [vectorField] });
    expect(withVectorForm(written, { ...form, quantization: 'scalar', filters: ['genre'] })).toEqual({
      fields: [
        { ...vectorField, quantization: 'scalar' },
        { type: 'filter', path: 'genre' },
      ],
    });
    const hnsw = { fields: [{ ...vectorField, hnswOptions: { maxEdges: 32 } }] };
    expect(withVectorForm(hnsw, { ...vectorForm(hnsw), similarity: 'euclidean' })).toEqual({
      fields: [{ ...vectorField, similarity: 'euclidean', hnswOptions: { maxEdges: 32 } }],
    });
  });

  it('reads back the ticks and the vector values the form wrote', () => {
    let definition: JsonDocument = empty;
    for (const path of ['title', 'address.city', 'price']) {
      definition = withFieldMapped(definition, path, true, fields);
    }
    expect([...mappedPaths(definition)].sort()).toEqual(['address.city', 'price', 'title']);
    const form = {
      path: 'embedding',
      numDimensions: 384,
      similarity: 'dotProduct',
      quantization: 'binary',
      filters: ['genre', 'year'],
    };
    expect(vectorForm(withVectorForm({ fields: [] }, form))).toEqual(form);
  });

  it('never changes the definition given', () => {
    const given: JsonDocument = { mappings: { dynamic: true, fields: { title: { type: 'string' } } } };
    const copy = JSON.parse(JSON.stringify(given)) as JsonDocument;
    withFieldMapped(given, 'title', false, fields);
    withFieldMapped(given, 'address.city', true, fields);
    withVectorForm(given, { path: 'embedding', similarity: 'cosine', quantization: 'none', filters: [] });
    expect(given).toEqual(copy);
  });
});
