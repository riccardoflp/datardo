/**
 * The part of the app's state about the Schema section of the collection tabs (`schema.show`): the last sample each
 * tab asked for (`schema.sample`), whether it runs, and what it gave, which the main process sets as its read starts
 * and ends, so that a sample started by the section, by Go to or after a click on a value (`schema.filter-from-value`)
 * is shown alike; and the filter a feature put in the query bar of a tab (`query.set-filter`), which the window then
 * shows there. Only the last sample of a tab counts: the end of an earlier one, arriving later, is dropped. Nothing of
 * it is saved.
 */
import type { Json } from '../engine-request';
import type { TabId } from '../ids';

/** How the last sample of a tab ended: what it read (the result of `schema.sample`), its error, or cancelled. */
export type SampleEnd =
  | { readonly kind: 'read'; readonly result: Json }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'cancelled' };

/** The last sample of a tab. */
export interface TabSample {
  /** The number of the request, which grows with each one. */
  readonly number: number;
  readonly running: boolean;
  /** The last result read, kept while a newer sample runs, so that the section shows it dimmed. */
  readonly result?: Json;
  /** The error of the last sample, or that it was cancelled. */
  readonly ended?: Exclude<SampleEnd, { readonly kind: 'read' }>;
}

/** A filter put in the query bar of a tab, with a new number each time. */
export interface FilterSet {
  readonly number: number;
  readonly filter: string;
}

/** This part of the state. */
export interface SchemaState {
  readonly samples: Readonly<Record<string, TabSample>>;
  readonly filters: Readonly<Record<string, FilterSet>>;
  /** The number the next sample or filter takes. */
  readonly next: number;
}

/** The events of this part of the state. */
export type SchemaEvent =
  | { readonly slice: 'schema'; readonly type: 'sample-started'; readonly tab: TabId }
  | {
      readonly slice: 'schema';
      readonly type: 'sample-ended';
      readonly tab: TabId;
      readonly number: number;
      readonly end: SampleEnd;
    }
  | { readonly slice: 'schema'; readonly type: 'filter-set'; readonly tab: TabId; readonly filter: string }
  /** The tabs that are still open: what was kept for the others is dropped. */
  | { readonly slice: 'schema'; readonly type: 'kept-for'; readonly tabs: readonly TabId[] };

/** No sample read, no filter set. */
export const initialSchemaState: SchemaState = { samples: {}, filters: {}, next: 1 };

function keptFor<T>(record: Readonly<Record<string, T>>, tabs: ReadonlySet<string>): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(record).filter(([tab]) => tabs.has(tab)));
}

function ended(sample: TabSample, end: SampleEnd): TabSample {
  const { ended: _before, ...rest } = sample;
  return end.kind === 'read'
    ? { ...rest, running: false, result: end.result }
    : { ...rest, running: false, ended: end };
}

/** Changes this part of the state. */
export function reduceSchema(state: SchemaState, event: SchemaEvent): SchemaState {
  switch (event.type) {
    case 'sample-started': {
      const before = state.samples[event.tab];
      const sample: TabSample = {
        number: state.next,
        running: true,
        ...(before?.result === undefined ? {} : { result: before.result }),
      };
      return { ...state, samples: { ...state.samples, [event.tab]: sample }, next: state.next + 1 };
    }
    case 'sample-ended': {
      const sample = state.samples[event.tab];
      if (sample?.number !== event.number) {
        return state;
      }
      return { ...state, samples: { ...state.samples, [event.tab]: ended(sample, event.end) } };
    }
    case 'filter-set':
      return {
        ...state,
        filters: { ...state.filters, [event.tab]: { number: state.next, filter: event.filter } },
        next: state.next + 1,
      };
    case 'kept-for': {
      const tabs = new Set<string>(event.tabs);
      return { ...state, samples: keptFor(state.samples, tabs), filters: keptFor(state.filters, tabs) };
    }
  }
}
