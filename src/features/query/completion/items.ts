/**
 * The suggestions of a place of the text: keys and values (`query.suggestions`), ported from Mongoster's `keyItems`
 * and `valueItems`.
 */
import type { FieldHint } from '../field-hints';
import { formattedValue, keyText } from '../format';
import { textOfJson } from '../mongosh/ejson';
import type { Place } from './contexts';
import {
  accumulators,
  expressionOperators,
  metaItems,
  queryOperators,
  queryTop,
  searchMetaOptions,
  searchOperators,
  searchStageOptions,
  stages,
  updateOperators,
  variables,
  type Term,
} from './vocabulary';

/** The kinds of suggestion, each with its mark in the list. */
export type SuggestionKind = 'field' | 'operator' | 'stage' | 'value';

/** One suggestion. */
export interface Suggestion {
  readonly label: string;
  readonly detail?: string;
  readonly kind: SuggestionKind;
  /** The text that replaces what was typed. */
  readonly insert: string;
  /** Where the cursor goes in `insert`; at its end when absent. */
  readonly cursor?: number;
}

/** A key suggested, with the skeleton of its value. */
export interface KeySuggestion extends Suggestion {
  readonly template?: string;
}

/** A search index of the collection, for the `index` of `$search` and `$vectorSearch`. */
export interface SearchIndexHint {
  readonly name: string;
  readonly type: string;
  readonly status?: string;
}

/** Text escaped for inside a string opened with `quote`. */
export function escapedIn(written: string, quote: string): string {
  return written.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`).replace(/\n/g, '\\n');
}

function keySuggestion(
  name: string,
  kind: SuggestionKind,
  quote: string | undefined,
  { detail, template }: { readonly detail?: string | undefined; readonly template?: string | undefined } = {},
): KeySuggestion {
  return {
    label: name,
    kind,
    insert: quote === undefined ? keyText(name) : escapedIn(name, quote) + quote,
    ...(detail === undefined ? {} : { detail }),
    ...(template === undefined ? {} : { template }),
  };
}

/** The detail of a field: its types and, when not every sampled document has it, the share that has: `string · 80%`. */
export function fieldDetail(hint: FieldHint): string {
  const percent = Math.round(hint.ratio * 100);
  const types = hint.types.length === 0 ? 'field' : hint.types.join(' | ');
  return percent < 100 ? `${types} · ${String(percent)}%` : types;
}

function fieldKeys(fields: readonly FieldHint[], prefix: string, quote: string | undefined): KeySuggestion[] {
  return fields
    .filter((hint) => hint.path.startsWith(prefix) && hint.path.length > prefix.length)
    .map((hint) => keySuggestion(hint.path.slice(prefix.length), 'field', quote, { detail: fieldDetail(hint) }));
}

function termKeys(
  terms: readonly Term[],
  quote: string | undefined,
  kind: SuggestionKind = 'operator',
): KeySuggestion[] {
  return terms.map(([name, detail, template]) => keySuggestion(name, kind, quote, { detail, template }));
}

function searchFieldKeys(fields: readonly FieldHint[], prefix: string, quote: string | undefined): KeySuggestion[] {
  return fields
    .filter(
      (hint) =>
        hint.path.startsWith(prefix) &&
        hint.path.length > prefix.length &&
        !hint.path.slice(prefix.length).includes('.'),
    )
    .map((hint) =>
      keySuggestion(hint.path.slice(prefix.length), 'field', quote, {
        detail: fieldDetail(hint),
        template: '{ type: "|" }',
      }),
    );
}

/** The keys that can stand at a place. */
export function keySuggestions(place: Place, fields: readonly FieldHint[], quote: string | undefined): KeySuggestion[] {
  switch (place.k) {
    case 'query':
      return [
        ...fieldKeys(fields, place.prefix, quote),
        ...termKeys(place.element === undefined ? queryTop : [...queryOperators, ...queryTop], quote),
      ];
    case 'field':
      return termKeys(queryOperators, quote);
    case 'sort':
    case 'project':
    case 'updateFields':
      return fieldKeys(fields, '', quote);
    case 'expr':
      return termKeys(expressionOperators, quote);
    case 'update':
      return termKeys(updateOperators, quote);
    case 'stageObject':
      return termKeys(stages, quote, 'stage');
    case 'group':
      return [keySuggestion('_id', 'field', quote, { detail: 'group key', template: '"$|"' })];
    case 'accumulators':
      return termKeys(accumulators, quote);
    case 'options':
      return place.info === undefined
        ? place.keys.map((key) => keySuggestion(key, 'operator', quote, { detail: 'option' }))
        : termKeys(place.info, quote);
    case 'document':
      return fieldKeys(fields, place.prefix, quote).filter((each) => !each.label.includes('.'));
    case 'searchOperators': {
      const stage =
        place.stage === undefined
          ? []
          : termKeys(place.stage === '$searchMeta' ? searchMetaOptions : searchStageOptions, quote);
      return [...termKeys(searchOperators, quote), ...stage];
    }
    case 'searchFields':
      return searchFieldKeys(fields, place.prefix, quote);
    case 'enum':
    case 'fieldName':
    case 'list':
    case 'none':
    case 'outputs':
    case 'pipeline':
    case 'searchIndex':
    case 'value':
      return [];
  }
}

function fieldValues(field: string | undefined, fields: readonly FieldHint[], quote: string | undefined): Suggestion[] {
  const hint = fields.find((each) => each.path === field);
  return (hint?.values ?? [])
    .filter((each) => quote === undefined || typeof each.value === 'string')
    .map((each) => {
      const written = formattedValue(each.value);
      return {
        label: written,
        detail: `×${String(each.count)}`,
        kind: 'value',
        insert: quote === undefined ? written : escapedIn(textOfJson(each.value), quote) + quote,
      };
    });
}

function expressionValues(include: boolean, fields: readonly FieldHint[], quote: string | undefined): Suggestion[] {
  const references = [
    ...fields.map((hint) => ({ reference: `$${hint.path}`, detail: fieldDetail(hint) })),
    ...variables.map((variable) => ({ reference: variable, detail: 'variable' })),
  ];
  const items: Suggestion[] = references.map(({ reference, detail }) => ({
    label: reference,
    detail,
    kind: 'field',
    insert: quote === undefined ? JSON.stringify(reference) : escapedIn(reference, quote) + quote,
  }));
  if (include && quote === undefined) {
    items.push(...['1', '0'].map((value): Suggestion => ({ label: value, kind: 'value', insert: value })));
    items.push(
      ...metaItems.map(([value, detail]): Suggestion => ({ label: value, detail, kind: 'value', insert: value })),
    );
  }
  return items;
}

function nameValues(vector: boolean, fields: readonly FieldHint[], quote: string | undefined): Suggestion[] {
  const ordered = vector
    ? [...fields.filter((hint) => hint.vector !== undefined), ...fields.filter((hint) => hint.vector === undefined)]
    : fields;
  return ordered.map((hint) => ({
    label: hint.path,
    detail: fieldDetail(hint),
    kind: 'field',
    insert: quote === undefined ? JSON.stringify(hint.path) : escapedIn(hint.path, quote) + quote,
  }));
}

function indexValues(type: string, indexes: readonly SearchIndexHint[], quote: string | undefined): Suggestion[] {
  return indexes
    .filter((index) => (index.type === '' ? 'search' : index.type) === type)
    .map((index) => ({
      label: JSON.stringify(index.name),
      detail: index.status === undefined ? index.type : `${index.type} · ${index.status}`,
      kind: 'value',
      insert: quote === undefined ? JSON.stringify(index.name) : escapedIn(index.name, quote) + quote,
    }));
}

/** The values that can stand at a place. */
export function valueSuggestions(
  place: Place,
  fields: readonly FieldHint[],
  quote: string | undefined,
  indexes: readonly SearchIndexHint[],
): Suggestion[] {
  switch (place.k) {
    case 'field':
    case 'value':
      return fieldValues(place.field, fields, quote);
    case 'document':
      return fieldValues(place.field, fields, quote);
    case 'enum':
      return place.values
        .filter((value) => quote === undefined || value.startsWith('"'))
        .map((value) => ({
          label: value,
          kind: 'value',
          insert: quote === undefined ? value : String(JSON.parse(value)) + quote,
        }));
    case 'expr':
      return expressionValues(place.include === true, fields, quote);
    case 'options':
      return place.value === undefined ? [] : valueSuggestions(place.value, fields, quote, indexes);
    case 'searchIndex':
      return indexValues(place.type, indexes, quote);
    case 'fieldName':
      return nameValues(place.vector === true, fields, quote);
    case 'accumulators':
    case 'group':
    case 'list':
    case 'none':
    case 'outputs':
    case 'pipeline':
    case 'project':
    case 'query':
    case 'searchFields':
    case 'searchOperators':
    case 'sort':
    case 'stageObject':
    case 'update':
    case 'updateFields':
      return [];
  }
}
