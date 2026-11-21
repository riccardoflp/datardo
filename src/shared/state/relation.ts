/**
 * The part of the app's state about the references between collections (`relation.read`): the references kept per
 * connection and database, which the collection tabs, the inspector island and the Relationship diagram use; and, for
 * each diagram tab, how its own sample goes (its progress, the server's message when it failed) and the box it was
 * asked to select. Nothing of it is saved.
 *
 * The references are kept as the relation area writes them (`KeptEntry` of `src/features/relation/kept/references`),
 * which this folder may not import (R1.3), without the sampled values of the fields, which only finding them needs.
 */
import type { Json } from '../engine-request';
import type { TabId } from '../ids';

/** How the sample of one diagram tab goes. */
export interface DiagramReading {
  /** While it reads: the progress of `relation.read`. */
  readonly progress?: string;
  /** The server's message of the last sample that failed. */
  readonly error?: string;
  /** The box to select and bring into view, a new number each time it is asked. */
  readonly select?: { readonly number: number; readonly collection: string };
}

/** This part of the state. */
export interface RelationState {
  /** The references kept, one entry per connection and database. */
  readonly kept: readonly Json[];
  readonly diagrams: Readonly<Record<string, DiagramReading>>;
  readonly nextSelect: number;
}

/** The events of this part of the state. */
export type RelationStateEvent =
  | { readonly slice: 'relation'; readonly type: 'kept'; readonly kept: readonly Json[] }
  | {
      readonly slice: 'relation';
      readonly type: 'diagram-read';
      readonly tab: TabId;
      readonly progress?: string;
      readonly error?: string;
    }
  | { readonly slice: 'relation'; readonly type: 'select'; readonly tab: TabId; readonly collection: string }
  | { readonly slice: 'relation'; readonly type: 'diagram-closed'; readonly tab: TabId };

/** Nothing kept. */
export const initialRelationState: RelationState = { kept: [], diagrams: {}, nextSelect: 1 };

/** Changes this part of the state. */
export function reduceRelation(state: RelationState, event: RelationStateEvent): RelationState {
  switch (event.type) {
    case 'kept':
      return { ...state, kept: event.kept };
    case 'diagram-read': {
      const before = state.diagrams[event.tab];
      const reading: DiagramReading = {
        ...(event.progress === undefined ? {} : { progress: event.progress }),
        ...(event.error === undefined ? {} : { error: event.error }),
        ...(before?.select === undefined ? {} : { select: before.select }),
      };
      return { ...state, diagrams: { ...state.diagrams, [event.tab]: reading } };
    }
    case 'select': {
      const before = state.diagrams[event.tab] ?? {};
      const select = { number: state.nextSelect, collection: event.collection };
      return {
        ...state,
        diagrams: { ...state.diagrams, [event.tab]: { ...before, select } },
        nextSelect: state.nextSelect + 1,
      };
    }
    case 'diagram-closed': {
      const diagrams = Object.fromEntries(Object.entries(state.diagrams).filter(([tab]) => tab !== event.tab));
      return { ...state, diagrams };
    }
  }
}
