/**
 * The suggestions inside the arguments of a call on a collection or a cursor (`playground.autocomplete`): those of the
 * query bar for that argument, a filter, a projection, an update, a field name, an index key, a sort or a pipeline.
 * Until `query.autocomplete` exists, they are made with the suggestions of the pipeline editor
 * (`src/features/aggregate/complete`), from the context of the argument. Ported from Mongoster's
 * `src/playground/context.ts` (`argumentKind`) and `src/shared/complete.ts` (`rootContext`, `UPDATE_OPS`).
 */
import { child, type Place } from '../../aggregate/complete/contexts';
import type { FieldHint } from '../../aggregate/complete/fields';
import { keyItems, ranked, valueItems, type ItemSource, type Suggestion } from '../../aggregate/complete/items';
import { scan, wordCharacter } from '../../aggregate/complete/scan';
import type { CallAt } from './receiver';

/** What the argument at the caret is. */
export type ArgumentKind = 'filter' | 'projection' | 'update' | 'field' | 'index' | 'sort' | 'pipeline' | 'stage';

const collectionArguments: Readonly<Record<string, readonly (ArgumentKind | undefined)[]>> = {
  find: ['filter', 'projection'],
  findOne: ['filter', 'projection'],
  countDocuments: ['filter'],
  count: ['filter'],
  deleteOne: ['filter'],
  deleteMany: ['filter'],
  findOneAndDelete: ['filter'],
  updateOne: ['filter', 'update'],
  updateMany: ['filter', 'update'],
  findOneAndUpdate: ['filter', 'update'],
  replaceOne: ['filter'],
  findOneAndReplace: ['filter'],
  distinct: ['field', 'filter'],
  createIndex: ['index'],
  watch: ['pipeline'],
};

const cursorArguments: Readonly<Record<string, ArgumentKind>> = {
  sort: 'sort',
  project: 'projection',
  projection: 'projection',
  hint: 'index',
};

/** What the argument at the caret is, for the call it is in; undefined where nothing is suggested. */
export function argumentKind(call: CallAt, argumentText: string): ArgumentKind | undefined {
  if (call.cursorOf !== undefined) {
    return call.argumentIndex === 0 ? cursorArguments[call.method] : undefined;
  }
  if (call.method === 'aggregate') {
    // aggregate([…]) or aggregate({ $match }, { $group }, …).
    const list = argumentText.trimStart().startsWith('[') || (call.argumentIndex === 0 && argumentText.trim() === '');
    return list ? 'pipeline' : 'stage';
  }
  if (call.collection === undefined) {
    return undefined;
  }
  return Object.hasOwn(collectionArguments, call.method)
    ? collectionArguments[call.method]?.[call.argumentIndex]
    : undefined;
}

/** The operators of an update, each with what its value holds: fields with values, or numbers. */
const updateOperators: readonly (readonly [name: string, note: string, template: string, holds: Place])[] = [
  ['$set', 'set fields', '{ | }', { kind: 'project' }],
  ['$unset', 'remove fields', '{ |: "" }', { kind: 'project' }],
  ['$inc', 'increment', '{ |: 1 }', { kind: 'sort' }],
  ['$mul', 'multiply', '{ | }', { kind: 'sort' }],
  ['$rename', 'rename fields', '{ | }', { kind: 'project' }],
  ['$min', 'set if lower', '{ | }', { kind: 'project' }],
  ['$max', 'set if greater', '{ | }', { kind: 'project' }],
  ['$currentDate', 'set to the current date', '{ |: true }', { kind: 'project' }],
  ['$setOnInsert', 'set on upsert insert', '{ | }', { kind: 'project' }],
  ['$push', 'append to an array', '{ | }', { kind: 'project' }],
  ['$addToSet', 'add to an array if missing', '{ | }', { kind: 'project' }],
  ['$pull', 'remove matching elements', '{ | }', { kind: 'project' }],
  ['$pullAll', 'remove listed elements', '{ | }', { kind: 'project' }],
  ['$pop', 'remove first (-1) or last (1)', '{ |: 1 }', { kind: 'sort' }],
];

const updatePlace: Place = {
  kind: 'options',
  keys: updateOperators.map(([name]) => name),
  children: Object.fromEntries(updateOperators.map(([name, , , holds]) => [name, holds])),
  words: updateOperators.map(([name, note, template]) => [name, note, template] as const),
};

/** The context an argument of a kind starts in. */
export function argumentPlace(kind: ArgumentKind): Place {
  switch (kind) {
    case 'filter':
      return { kind: 'query', prefix: '' };
    case 'projection':
      return { kind: 'project' };
    case 'update':
      return updatePlace;
    case 'field':
      return { kind: 'field-name' };
    case 'index':
    case 'sort':
      return { kind: 'sort' };
    case 'pipeline':
      return { kind: 'pipeline' };
    case 'stage':
      return { kind: 'stage' };
  }
}

/** The suggestions in an argument: what they replace and the list, best first. */
export interface ArgumentSuggestions {
  readonly from: number;
  readonly to: number;
  readonly prefix: string;
  readonly items: readonly Suggestion[];
}

function innermost(frames: ReturnType<typeof scan>['frames'], root: Place): Place {
  let place = root;
  for (let index = 1; index < frames.length; index += 1) {
    const parent = frames[index - 1];
    if (parent !== undefined && parent.type !== '(') {
      place = child(place, parent.type === '[' ? null : (frames[index]?.key ?? null));
    }
  }
  return place;
}

/** The items at the innermost container of the argument. */
function itemsAt(
  scanned: ReturnType<typeof scan>,
  root: Place,
  source: ItemSource,
  typed: { readonly colonFollows: boolean; readonly prefix: string },
): readonly Suggestion[] {
  const { colonFollows, prefix } = typed;
  const frame = scanned.frames[scanned.frames.length - 1];
  if (frame === undefined) {
    return scanned.done ? [] : ranked(valueItems(root, source), prefix, undefined);
  }
  const place = innermost(scanned.frames, root);
  if (frame.type === '(') {
    return [];
  }
  if (frame.type === '[') {
    return ranked(valueItems(child(place, null), source), prefix, undefined);
  }
  if (frame.state === 'key') {
    return ranked(keyItems(place, source), prefix, colonFollows);
  }
  return frame.state === 'value'
    ? ranked(valueItems(child(place, frame.currentKey ?? null), source), prefix, undefined)
    : [];
}

/**
 * The suggestions at `offset` in the argument that starts at `start` of `text`, of the kind given, with the fields of
 * the collection; undefined where nothing applies (in a comment, after a value).
 */
export function argumentSuggestions(
  text: string,
  offset: number,
  argument: { readonly start: number; readonly kind: ArgumentKind },
  fields: readonly FieldHint[],
): ArgumentSuggestions | undefined {
  const body = text.slice(argument.start, offset);
  const scanned = scan(body, body.length);
  if (scanned.quote !== undefined && !/^["'`]$/u.test(scanned.quote)) {
    return undefined;
  }
  const prefix = body.slice(scanned.tokenStart);
  if (scanned.quote === undefined && prefix !== '' && !wordCharacter.test(prefix.charAt(0))) {
    return undefined;
  }
  let to = offset;
  while (to < text.length && wordCharacter.test(text.charAt(to))) {
    to += 1;
  }
  to += scanned.quote !== undefined && text.charAt(to) === scanned.quote ? 1 : 0;
  const source: ItemSource = { fields, searchIndexes: [], quote: scanned.quote };
  const colonFollows = /^\s*:/u.test(text.slice(to));
  const items = itemsAt(scanned, argumentPlace(argument.kind), source, { colonFollows, prefix });
  return items.length === 0 ? undefined : { from: argument.start + scanned.tokenStart, to, prefix, items };
}
