/**
 * Why a filter cannot be matched in the window (`table.match`): thrown while the filter is made into a predicate, and
 * turned into the message the user reads under the condition.
 */

/** A filter the matcher refuses, with the message for the user. */
export class FilterRefusal extends Error {}

/** Refuses the filter being made into a predicate. */
export function refuseFilter(message: string): never {
  throw new FilterRefusal(message);
}
