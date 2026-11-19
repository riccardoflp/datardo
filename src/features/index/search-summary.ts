/**
 * Feature: index.search-summary
 *
 * The lines the **Definition** column shows for a search index: what it maps, and with which analyzers; for a vector
 * search index, its vector fields and its filter fields.
 */
import type { Json } from '../../shared/engine-request';
import { text } from './text';
import { isDocument, jsonText, type JsonDocument } from './types';

/** A mapping or a list of them, as a list. */
export function mappingsOf(value: Json | undefined): readonly Json[] {
  return Array.isArray(value) ? (value as readonly Json[]) : value === undefined ? [] : [value];
}

/** Whether a type of mapping is a document's. */
export function isDocumentType(type: Json | undefined): boolean {
  return type === 'document' || type === 'embeddedDocuments';
}

/** Whether a mapping is a document mapped through fields of its own. */
export function hasOwnFields(mapping: Json): mapping is JsonDocument & { readonly fields: JsonDocument } {
  return (
    isDocument(mapping) &&
    isDocumentType(mapping['type']) &&
    isDocument(mapping['fields']) &&
    Object.keys(mapping['fields']).length > 0
  );
}

/** The fields of the mappings of a search definition. */
export function mappedFields(definition: JsonDocument): Json | undefined {
  const mappings = definition['mappings'];
  return isDocument(mappings) ? mappings['fields'] : undefined;
}

/** The types each mapped field is indexed as, by dotted path, in the order of the definition. */
function mappedTypes(fields: Json | undefined, prefix: string, into: Map<string, string[]>): Map<string, string[]> {
  if (!isDocument(fields)) {
    return into;
  }
  for (const [name, value] of Object.entries(fields)) {
    for (const mapping of mappingsOf(value).filter(isDocument)) {
      const type = typeof mapping['type'] === 'string' ? mapping['type'] : 'document';
      if (hasOwnFields(mapping)) {
        mappedTypes(mapping.fields, `${prefix}${name}.`, into);
      } else {
        into.set(prefix + name, [...(into.get(prefix + name) ?? []), type]);
      }
    }
  }
  return into;
}

function listed(items: readonly string[], most: number): string {
  return items.length > most ? `${items.slice(0, most).join(', ')} +${String(items.length - most)}` : items.join(', ');
}

/** The vector fields (`vector`, `autoEmbed`, `text`) and the paths of the filter fields of a definition. */
export function vectorFields(definition: JsonDocument): {
  readonly vectors: readonly JsonDocument[];
  readonly filters: readonly string[];
} {
  const fields = mappingsOf(definition['fields']).filter(isDocument);
  return {
    vectors: fields.filter((field) => ['vector', 'autoEmbed', 'text'].includes(jsonText(field['type']))),
    filters: fields.flatMap((field) =>
      field['type'] === 'filter' && typeof field['path'] === 'string' ? [field['path']] : [],
    ),
  };
}

function vectorLine(vector: JsonDocument): string {
  const parts = [typeof vector['path'] === 'string' ? vector['path'] : '?'];
  const dimensions = vector['numDimensions'];
  if (dimensions !== undefined) {
    parts.push(
      text.summary.dimensions(typeof dimensions === 'number' ? String(dimensions) : JSON.stringify(dimensions)),
    );
  }
  if (typeof vector['similarity'] === 'string') {
    parts.push(vector['similarity']);
  }
  const quantization = vector['quantization'];
  if (typeof quantization === 'string' && quantization !== 'none') {
    parts.push(text.summary.quantization(quantization));
  }
  if (vector['type'] !== 'vector') {
    parts.push(jsonText(vector['type']));
  }
  if (typeof vector['model'] === 'string') {
    parts.push(vector['model']);
  }
  return parts.join(' · ');
}

function vectorSummary(definition: JsonDocument): readonly string[] {
  const { vectors, filters } = vectorFields(definition);
  const lines = vectors.length === 0 ? [text.summary.noVector] : vectors.map(vectorLine);
  return filters.length === 0 ? lines : [...lines, text.summary.filter(listed(filters, 4))];
}

function extrasLine(definition: JsonDocument): string | undefined {
  const { analyzer, searchAnalyzer, analyzers, synonyms, storedSource } = definition;
  const extras = [
    ...(typeof analyzer === 'string' ? [text.summary.analyzer(analyzer)] : []),
    ...(typeof searchAnalyzer === 'string' && searchAnalyzer !== analyzer
      ? [text.summary.searchAnalyzer(searchAnalyzer)]
      : []),
    ...(Array.isArray(analyzers) && analyzers.length > 0 ? [text.summary.customAnalyzers(analyzers.length)] : []),
    ...(Array.isArray(synonyms) && synonyms.length > 0 ? [text.summary.synonyms] : []),
    ...(storedSource !== undefined && storedSource !== false ? [text.summary.storedSource] : []),
  ];
  return extras.length === 0 ? undefined : extras.join(' · ');
}

function mappingSummary(definition: JsonDocument): readonly string[] {
  const mappings = isDocument(definition['mappings']) ? definition['mappings'] : {};
  const types = mappedTypes(mappings['fields'], '', new Map());
  const fields = [...types].map(([path, each]) => `${path} (${[...new Set(each)].join(', ')})`);
  const dynamic = mappings['dynamic'] === true || isDocument(mappings['dynamic']);
  const first = dynamic
    ? fields.length === 0
      ? text.summary.dynamic
      : text.summary.dynamicPlus(listed(fields, 3))
    : fields.length === 0
      ? text.summary.noField
      : text.summary.fields(types.size, listed(fields, 4));
  const extras = extrasLine(definition);
  return extras === undefined ? [first] : [first, extras];
}

/** Feature: index.search-summary — the lines of a search index's definition, for the list. */
export function searchSummary(type: string, definition: JsonDocument): readonly string[] {
  return type === 'vectorSearch' ? vectorSummary(definition) : mappingSummary(definition);
}
