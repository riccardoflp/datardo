/**
 * What a Search documents tab keeps and is told (`search.show`): its input kept with the tab as one choice, `search`,
 * in the text of JSON, and read back made valid; the search of the tab as the app's state holds it; and what an ask
 * of the main process does to the input (a scope from a node of the tree, or a whole input to search with, from the
 * tool `open_search`).
 */
import type { Json } from '../../../shared/engine-request';
import type { SearchTabState } from '../../../shared/state/search';
import { readLimits, type CollectionScan, type SearchInput, type SearchRun } from '../types';
import { firstInput } from '../types';

/** The name of the tab's choice that keeps the input. */
export const inputChoice = 'search';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An input from what was kept or asked, each part that is missing or not valid as it starts. */
export function inputOf(value: unknown): SearchInput {
  if (!isRecord(value)) {
    return firstInput;
  }
  const database = typeof value['database'] === 'string' ? value['database'] : undefined;
  const ticked = Array.isArray(value['collections'])
    ? value['collections'].filter((name): name is string => typeof name === 'string')
    : [];
  return {
    text: typeof value['text'] === 'string' ? value['text'] : '',
    mode: value['mode'] === 'regex' ? 'regex' : 'contains',
    ...(database === undefined ? {} : { database }),
    collections: database === undefined ? [] : ticked,
    matchCase: value['matchCase'] === true,
    fieldNames: value['fieldNames'] === true,
    views: value['views'] === true,
    read: readLimits.find((limit) => limit === value['read']) ?? 0,
  };
}

/** The input as JSON, for the arguments of a feature. */
export function inputJson(input: SearchInput): Json {
  return {
    text: input.text,
    mode: input.mode,
    ...(input.database === undefined ? {} : { database: input.database }),
    collections: [...input.collections],
    matchCase: input.matchCase,
    fieldNames: input.fieldNames,
    views: input.views,
    read: input.read,
  };
}

/** The input a tab kept in its choices; the first input when it kept none. */
export function keptInput(choices: Readonly<Record<string, string>> | undefined): SearchInput {
  const kept = choices?.[inputChoice];
  if (kept === undefined) {
    return firstInput;
  }
  try {
    return inputOf(JSON.parse(kept) as unknown);
  } catch {
    // A choice that is not JSON was not written by this page: the page starts as it does the first time.
    return firstInput;
  }
}

/** The choices that keep an input with the tab. */
export function inputChoices(input: SearchInput): Readonly<Record<string, string>> {
  return { [inputChoice]: JSON.stringify(inputJson(input)) };
}

/** The search of a tab, whole, as the app's state holds it; none before the first **Search**. */
export function runOfTab(tab: SearchTabState | undefined): SearchRun | undefined {
  if (tab?.run === undefined || !isRecord(tab.run)) {
    return undefined;
  }
  return { ...(tab.run as unknown as Omit<SearchRun, 'scans'>), scans: tab.scans as unknown as CollectionScan[] };
}

/** The head of a search as the app's state keeps it: everything but its collections. */
export function headOf(run: SearchRun): Json {
  const { scans: _scans, ...head } = run;
  return JSON.parse(JSON.stringify(head)) as Json;
}

/** A collection's scan as the app's state keeps it. */
export function scanJson(scan: CollectionScan): Json {
  return JSON.parse(JSON.stringify(scan)) as Json;
}

/** What an ask of the main process does: the input after it, and whether the page searches at once. */
export interface AskedInput {
  readonly input: SearchInput;
  readonly start: boolean;
}

/**
 * The input after an ask: `{ scope: { database, collections } }` sets **In** and the collections ticked, leaving the
 * rest; `{ input }` replaces the whole input and searches.
 */
export function inputAfterAsk(input: SearchInput, ask: Json): AskedInput {
  if (!isRecord(ask)) {
    return { input, start: false };
  }
  const scope = ask['scope'];
  if (isRecord(scope) && typeof scope['database'] === 'string') {
    const collections = Array.isArray(scope['collections'])
      ? scope['collections'].filter((name): name is string => typeof name === 'string')
      : [];
    return { input: { ...input, database: scope['database'], collections }, start: false };
  }
  return isRecord(ask['input']) ? { input: inputOf(ask['input']), start: true } : { input, start: false };
}
