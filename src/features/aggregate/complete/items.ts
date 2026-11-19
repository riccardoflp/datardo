/**
 * The suggestions of a context: the keys an object can have there, or the values it can take, ranked against what was
 * typed. Ported from Mongoster's `src/shared/complete.ts` (`keyItems`, `valueItems`, `finish`, `matchScore`).
 */
import { formattedValue, keyText } from '../mongosh/format';
import type { Place } from './contexts';
import { searchStageOptions } from './contexts';
import type { FieldHint, SearchIndexHint } from './fields';
import {
  accumulators,
  expressionOperators,
  metaItems,
  queryOperators,
  queryTop,
  searchOperators,
  stageWords,
  variables,
  type Word,
} from './vocabulary';

/** One suggestion. */
export interface Suggestion {
  readonly label: string;
  readonly detail?: string;
  readonly kind: 'field' | 'operator' | 'stage' | 'value';
  /** The text that replaces what was typed. */
  readonly insert: string;
  /** Where the cursor lands inside `insert`; at its end when absent. */
  readonly cursor?: number;
}

/** A suggestion of a key, with the template of its value. */
export type KeyItem = Suggestion & { readonly template?: string };

/** What the suggestions are made from: the fields, the search indexes, and the quote the cursor is in. */
export interface ItemSource {
  readonly fields: readonly FieldHint[];
  readonly searchIndexes: readonly SearchIndexHint[];
  readonly quote: string | undefined;
}

/** The text for inside a string delimited by `quote`. */
function escapeIn(text: string, quote: string): string {
  return text.replace(/\\/gu, '\\\\').split(quote).join(`\\${quote}`).replace(/\n/gu, '\\n');
}

function keyItem(name: string, kind: Suggestion['kind'], quote: string | undefined, word?: Partial<Word>): KeyItem {
  const insert = quote === undefined ? keyText(name) : escapeIn(name, quote) + quote;
  const [, detail, template] = word ?? [];
  return {
    label: name,
    kind,
    insert,
    ...(detail === undefined ? {} : { detail }),
    ...(template === undefined ? {} : { template }),
  };
}

/** What a field is, as the list says it: `string | null · 80%`. */
export function fieldDetail(hint: FieldHint): string {
  const share = Math.round(hint.ratio * 100);
  return `${hint.types.join(' | ') || 'field'}${share < 100 ? ` · ${share}%` : ''}`;
}

function fieldKeys(fields: readonly FieldHint[], prefix: string, quote: string | undefined): KeyItem[] {
  return fields
    .filter((hint) => hint.path.startsWith(prefix) && hint.path.length > prefix.length)
    .map((hint) => keyItem(hint.path.slice(prefix.length), 'field', quote, [hint.path, fieldDetail(hint)]));
}

function wordKeys(words: readonly Word[], quote: string | undefined, kind: Suggestion['kind'] = 'operator'): KeyItem[] {
  return words.map((word) => keyItem(word[0], kind, quote, word));
}

/** The keys an object can have in the context `place`. */
export function keyItems(place: Place, source: ItemSource): readonly KeyItem[] {
  const { fields, quote } = source;
  switch (place.kind) {
    case 'query':
      return [
        ...fieldKeys(fields, place.prefix, quote),
        ...wordKeys(place.element === undefined ? queryTop : [...queryOperators, ...queryTop], quote),
      ];
    case 'field':
      return wordKeys(queryOperators, quote);
    case 'sort':
    case 'project':
      return fieldKeys(fields, '', quote);
    case 'expression':
      return wordKeys(expressionOperators, quote);
    case 'stage':
      return wordKeys(stageWords, quote, 'stage');
    case 'group':
      return [keyItem('_id', 'field', quote, ['_id', 'group key', '"$|"'])];
    case 'accumulators':
      return wordKeys(accumulators, quote);
    case 'options':
      return place.words === undefined
        ? place.keys.map((key) => keyItem(key, 'operator', quote, [key, 'option']))
        : wordKeys(place.words, quote);
    case 'search':
      return [
        ...wordKeys(searchOperators, quote),
        ...(place.stage === undefined ? [] : wordKeys(searchStageOptions(place.stage), quote)),
      ];
    case 'value':
    case 'list':
    case 'enum':
    case 'outputs':
    case 'pipeline':
    case 'field-name':
    case 'search-index':
    case 'none':
      return [];
  }
}

function fieldValues(fields: readonly FieldHint[], field: string, quote: string | undefined): Suggestion[] {
  const hint = fields.find((each) => each.path === field);
  return (hint?.values ?? [])
    .filter((each) => quote === undefined || typeof each.value === 'string')
    .map((each) => {
      const shown = formattedValue(each.value, { kind: 'one-line' });
      const insert =
        quote === undefined || typeof each.value !== 'string' ? shown : escapeIn(each.value, quote) + quote;
      return { label: shown, detail: `×${String(each.count)}`, kind: 'value', insert };
    });
}

function expressionValues(place: Extract<Place, { kind: 'expression' }>, source: ItemSource): Suggestion[] {
  const { fields, quote } = source;
  const references = [
    ...fields.map((hint) => ({ reference: `$${hint.path}`, detail: fieldDetail(hint) })),
    ...variables.map((variable) => ({ reference: variable, detail: 'variable' })),
  ];
  const items: Suggestion[] = references.map(({ reference, detail }) => ({
    label: reference,
    detail,
    kind: 'field',
    insert: quote === undefined ? JSON.stringify(reference) : escapeIn(reference, quote) + quote,
  }));
  if (place.include === true && quote === undefined) {
    items.push(...['1', '0'].map((value): Suggestion => ({ label: value, kind: 'value', insert: value })));
    items.push(
      ...metaItems.map(([value, detail]): Suggestion => ({ label: value, detail, kind: 'value', insert: value })),
    );
  }
  return items;
}

function indexValues(type: string, source: ItemSource): Suggestion[] {
  const { quote } = source;
  return source.searchIndexes
    .filter((index) => (index.type || 'search') === type)
    .map((index) => ({
      label: JSON.stringify(index.name),
      detail: index.status === undefined ? index.type : `${index.type} · ${index.status}`,
      kind: 'value',
      insert: quote === undefined ? JSON.stringify(index.name) : escapeIn(index.name, quote) + quote,
    }));
}

function fieldNames(vector: boolean, source: ItemSource): Suggestion[] {
  const { fields, quote } = source;
  const ordered = vector ? [...fields.filter((hint) => hint.vector), ...fields.filter((hint) => !hint.vector)] : fields;
  return ordered.map((hint) => ({
    label: hint.path,
    detail: fieldDetail(hint),
    kind: 'field',
    insert: quote === undefined ? JSON.stringify(hint.path) : escapeIn(hint.path, quote) + quote,
  }));
}

/** The values a value can take in the context `place`. */
export function valueItems(place: Place, source: ItemSource): readonly Suggestion[] {
  const { quote } = source;
  switch (place.kind) {
    case 'field':
    case 'value':
      return fieldValues(source.fields, place.field, quote);
    case 'enum':
      return place.values
        .filter((value) => quote === undefined || value.startsWith('"'))
        .map((value) => ({
          label: value,
          kind: 'value',
          insert: quote === undefined ? value : `${String(JSON.parse(value))}${quote}`,
        }));
    case 'expression':
      return expressionValues(place, source);
    case 'options':
      return place.value === undefined ? [] : valueItems(place.value, source);
    case 'search-index':
      return indexValues(place.type, source);
    case 'field-name':
      return fieldNames(place.vector === true, source);
    case 'query':
    case 'list':
    case 'sort':
    case 'project':
    case 'pipeline':
    case 'stage':
    case 'group':
    case 'accumulators':
    case 'outputs':
    case 'search':
    case 'none':
      return [];
  }
}

/** How well a label matches what was typed; 0 for not at all. A prefix beats a later segment, which beats a part. */
export function matchScore(label: string, prefix: string): number {
  if (prefix === '') {
    return 1;
  }
  const needle = prefix.toLowerCase();
  const bare = label.replace(/^"/u, '');
  // "$" asks for operators or field references.
  if (needle.startsWith('$') && !bare.startsWith('$')) {
    return 0;
  }
  const lower = bare.toLowerCase().replace(/^\$+/u, '');
  const word = needle.replace(/^\$+/u, '');
  if (label.startsWith(prefix) || bare.startsWith(prefix)) {
    return 6;
  }
  if (lower.startsWith(word)) {
    return 5;
  }
  if (lower.split('.').some((segment) => segment.startsWith(word))) {
    return 3;
  }
  return word.length >= 2 && lower.includes(word) ? 2 : 0;
}

/**
 * The suggestions that match `prefix`, best first. `colonFollows` is set for keys only: a key gets `: value`, with
 * the template of its value and the cursor where the template says, unless a colon already follows it.
 */
export function ranked(
  items: readonly KeyItem[],
  prefix: string,
  colonFollows: boolean | undefined,
): readonly Suggestion[] {
  const scored = items
    .map((item, order) => ({ item, order, score: matchScore(item.label, prefix) }))
    .filter((each) => each.score > 0 && each.item.label !== prefix)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map(({ item }) => {
    const { template, ...suggestion } = item;
    if (colonFollows !== false) {
      return suggestion;
    }
    const caret = (template ?? '').indexOf('|');
    const value = (template ?? '').replace('|', '');
    const cursor = item.insert.length + 2 + (caret < 0 ? value.length : caret);
    return { ...suggestion, insert: `${item.insert}: ${value}`, cursor };
  });
}
