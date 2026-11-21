/**
 * What the runner counted of a plan with fed steps (`FedTotals`), as the messages that end it say it: the seconds,
 * the counts of all its steps together, and the sentences that follow the first.
 */
import type { FedStepTotals, FedTotals } from '../../backup/types';

/** The seconds a plan took, with one decimal: `1.2`. */
export function secondsOf(totals: FedTotals): string {
  return (totals.milliseconds / 1000).toFixed(1);
}

/** The counts of all the fed steps together. */
export function summed(totals: FedTotals): Omit<FedStepTotals, 'database' | 'collection'> {
  const steps = totals.steps;
  const firstError = steps.find((each) => each.firstError !== undefined)?.firstError;
  const firstOtherError = steps.find((each) => each.firstOtherError !== undefined)?.firstOtherError;
  return {
    read: steps.reduce((sum, each) => sum + each.read, 0),
    inserted: steps.reduce((sum, each) => sum + each.inserted, 0),
    duplicates: steps.reduce((sum, each) => sum + each.duplicates, 0),
    failed: steps.reduce((sum, each) => sum + each.failed, 0),
    ...(firstError === undefined ? {} : { firstError }),
    ...(firstOtherError === undefined ? {} : { firstOtherError }),
  };
}

/** A message made of its sentences: the first as it is, each other one ended with a full stop. */
export function sentences(first: string, more: readonly string[]): string {
  return [first, ...more.map((each) => (each.endsWith('.') ? each : `${each}.`))].join(' ');
}
