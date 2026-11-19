/**
 * Feature: index.search-form
 *
 * How the buttons and boxes of the search index dialog write the definition, and how the form reads it back. The
 * definition given is never changed: every result is a new one.
 */
import type { Json } from '../../shared/engine-request';
import { isDocumentType, mappedFields, mappingsOf, vectorFields } from './search-summary';
import { isDocument, type JsonDocument, type SampledField } from './types';

type Mutable = Record<string, unknown>;

/** A copy of a definition that can be changed without touching the one shown. */
function copyOf(definition: JsonDocument): Mutable {
  return JSON.parse(JSON.stringify(definition)) as Mutable;
}

function isMutable(value: unknown): value is Mutable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

/** Feature: index.search-form — **Dynamic mapping**: `{ mappings: { dynamic: true } }`. */
export function dynamicDefinition(): JsonDocument {
  return { mappings: { dynamic: true } };
}

/** Feature: index.search-form — the search types the sampled BSON types map to; empty when none can be indexed. */
export function searchFieldTypes(field: SampledField | undefined): readonly string[] {
  const types = new Set<string>();
  for (const type of field?.types ?? []) {
    if (type === 'string') {
      types.add('string');
    } else if (['int', 'long', 'double', 'decimal'].includes(type)) {
      types.add('number');
    } else if (['date', 'objectId'].includes(type)) {
      types.add(type);
    } else if (type === 'bool') {
      types.add('boolean');
    } else if (type === 'object') {
      types.add('document');
    }
  }
  return [...types];
}

function mappingFor(field: SampledField | undefined): unknown {
  const types = searchFieldTypes(field).map((type) => (type === 'document' ? { type, dynamic: true } : { type }));
  return types.length === 1 ? types[0] : types.length > 0 ? types : { type: 'string' };
}

function isDocumentMapping(mapping: unknown): mapping is Mutable {
  return isMutable(mapping) && isDocumentType(mapping['type'] as Json);
}

/** The document mapping of `name` in `fields`, created (or added to its mappings) when missing. */
function documentMapping(fields: Mutable, name: string): Mutable {
  const current = fields[name];
  let mapping = listOf(current).find(isDocumentMapping);
  if (mapping === undefined) {
    mapping = { type: 'document', fields: {} };
    fields[name] = current === undefined ? mapping : [...listOf(current), mapping];
  }
  if (!isMutable(mapping['fields'])) {
    mapping['fields'] = {};
  }
  return mapping;
}

function withOwnFields(mapping: unknown): mapping is Mutable & { fields: Mutable } {
  return isDocumentMapping(mapping) && isMutable(mapping['fields']) && Object.keys(mapping['fields']).length > 0;
}

function mapField(fields: Mutable, parts: readonly string[], field: SampledField | undefined): void {
  let level = fields;
  for (const part of parts.slice(0, -1)) {
    level = documentMapping(level, part)['fields'] as Mutable;
  }
  const leaf = parts[parts.length - 1] ?? '';
  const mapping = mappingFor(field);
  // A document already mapped through its fields maps the rest dynamically too.
  const existing = listOf(level[leaf]).find(isDocumentMapping);
  if (existing !== undefined && isMutable(mapping) && mapping['type'] === 'document') {
    existing['dynamic'] = true;
  } else {
    level[leaf] = mapping;
  }
}

/** Walks down to the field, removes its mapping, and drops what is left empty on the way back up. */
function unmapField(fields: Mutable, parts: readonly string[], at: number): void {
  const name = parts[at] ?? '';
  if (at === parts.length - 1) {
    const documents = listOf(fields[name]).filter(withOwnFields);
    if (documents.length === 0) {
      Reflect.deleteProperty(fields, name);
    }
    documents.forEach((document) => {
      Reflect.deleteProperty(document, 'dynamic');
    });
    return;
  }
  for (const mapping of listOf(fields[name])) {
    if (!isDocumentMapping(mapping) || !isMutable(mapping['fields'])) {
      continue;
    }
    unmapField(mapping['fields'], parts, at + 1);
    if (Object.keys(mapping['fields']).length === 0 && mapping['dynamic'] !== true) {
      const rest = listOf(fields[name]).filter((other) => other !== mapping);
      if (rest.length === 0) {
        Reflect.deleteProperty(fields, name);
      } else {
        fields[name] = rest.length === 1 ? rest[0] : rest;
      }
    }
  }
}

/**
 * Feature: index.search-form — the definition with the field `path` mapped (with the types of its sampled values) or
 * no longer mapped: a static mapping, nested fields under `document` mappings of each parent.
 */
export function withFieldMapped(
  definition: JsonDocument,
  path: string,
  on: boolean,
  fields: readonly SampledField[],
): JsonDocument {
  const copy = copyOf(definition);
  const mappings = isMutable(copy['mappings']) ? copy['mappings'] : (copy['mappings'] = {});
  if (on && mappings['dynamic'] === undefined) {
    mappings['dynamic'] = false;
  }
  if (!isMutable(mappings['fields'])) {
    mappings['fields'] = {};
  }
  const parts = path.split('.');
  if (on) {
    mapField(
      mappings['fields'] as Mutable,
      parts,
      fields.find((field) => field.path === path),
    );
  } else {
    unmapField(mappings['fields'] as Mutable, parts, 0);
  }
  return copy as JsonDocument;
}

/** Whether a sampled field goes in **Static mappings**: not `_id`, not a vector, not only an object. */
function isStaticCandidate(field: SampledField): boolean {
  const types = searchFieldTypes(field);
  return (
    field.path !== '_id' &&
    field.vector === undefined &&
    types.length > 0 &&
    !(types.length === 1 && types[0] === 'document')
  );
}

/** Feature: index.search-form — **Static mappings**: the first 30 sampled fields that can be indexed. */
export function staticDefinition(fields: readonly SampledField[]): JsonDocument {
  const chosen = fields
    .filter(isStaticCandidate)
    .map((field) => field.path)
    .slice(0, 30);
  return chosen.reduce<JsonDocument>((definition, path) => withFieldMapped(definition, path, true, fields), {
    mappings: { dynamic: false, fields: {} },
  });
}

/**
 * Feature: index.search-form — the ticked fields of a definition, its mapped paths: a document mapped through fields
 * of its own is ticked only when it also maps the rest dynamically or has another mapping.
 */
export function mappedPaths(definition: JsonDocument): readonly string[] {
  const paths = new Set<string>();
  const visit = (fields: Json | undefined, prefix: string): void => {
    if (!isDocument(fields)) {
      return;
    }
    for (const [name, value] of Object.entries(fields)) {
      const mappings = mappingsOf(value);
      const documents = mappings.filter(
        (mapping) => isDocument(mapping) && isDocumentType(mapping['type']) && isDocument(mapping['fields']),
      ) as readonly JsonDocument[];
      const withFields = documents.filter((document) => Object.keys(document['fields'] as JsonDocument).length > 0);
      const other = mappings.some((m) => isDocument(m) && (!isDocumentType(m['type']) || m['dynamic'] === true));
      if (withFields.length === 0 || other) {
        paths.add(prefix + name);
      }
      withFields.forEach((document) => {
        visit(document['fields'], `${prefix}${name}.`);
      });
    }
  };
  visit(mappedFields(definition), '');
  return [...paths];
}

/** The similarities of a vector field, in the order the form lists them. */
export const similarities = ['cosine', 'euclidean', 'dotProduct'] as const;

/** The quantizations of a vector field, in the order the form lists them. */
export const quantizations = ['none', 'scalar', 'binary'] as const;

/** What the vector part of the form shows. */
export interface VectorForm {
  readonly path: string;
  readonly numDimensions?: number;
  readonly similarity: string;
  readonly quantization: string;
  readonly filters: readonly string[];
}

/** Feature: index.search-form — the first vector field and the filter fields of a definition, as the form shows. */
export function vectorForm(definition: JsonDocument): VectorForm {
  const { vectors, filters } = vectorFields(definition);
  const vector = vectors.find((field) => field['type'] === 'vector') ?? {};
  const { path, numDimensions, similarity, quantization } = vector;
  return {
    path: typeof path === 'string' ? path : '',
    ...(typeof numDimensions === 'number' ? { numDimensions } : {}),
    similarity: typeof similarity === 'string' ? similarity : 'cosine',
    quantization: typeof quantization === 'string' ? quantization : 'none',
    filters,
  };
}

/**
 * Feature: index.search-form — the form written into a copy of the definition: its first vector field (other options
 * of it, such as `hnswOptions`, and the other fields kept) and its filter fields, the new ones at the end.
 */
export function withVectorForm(definition: JsonDocument, form: VectorForm): JsonDocument {
  const copy = copyOf(definition);
  const fields = listOf(copy['fields']).filter(isMutable);
  const at = fields.findIndex((field) => field['type'] === 'vector');
  const { quantization: _quantization, ...previous } = at >= 0 ? (fields[at] ?? {}) : {};
  const vector: Mutable = {
    ...previous,
    type: 'vector',
    path: form.path,
    numDimensions: form.numDimensions ?? 0,
    similarity: form.similarity,
    ...(form.quantization !== '' && form.quantization !== 'none' ? { quantization: form.quantization } : {}),
  };
  if (at >= 0) {
    fields[at] = vector;
  } else {
    fields.unshift(vector);
  }
  const kept = fields.filter((field) => field['type'] !== 'filter' || form.filters.includes(String(field['path'])));
  const present = new Set(kept.filter((field) => field['type'] === 'filter').map((field) => field['path']));
  const added = form.filters.filter((path) => !present.has(path)).map((path) => ({ type: 'filter', path }));
  return { ...(copy as JsonDocument), fields: [...kept, ...added] as Json };
}
