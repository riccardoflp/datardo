/**
 * The choices of the toolbars of the Monitor page that its tab keeps (`parts/choices.ts`): the intervals of **Auto**
 * (`monitor.show`) and of **Since**, and **By query** or **All** (`monitor.slow-queries`). Here, apart from the
 * Views that show them, so that what a tab keeps reads them without reading the Views.
 */

/** The intervals of **Auto**, in seconds; 0 is **Off**. */
export const autoIntervals = [0, 2, 5, 15] as const;

/** An interval of **Auto**. */
export type AutoInterval = (typeof autoIntervals)[number];

/** **Auto** to start with: 5 s. */
export const defaultAuto: AutoInterval = 5;

/** The choices of **Since**, in minutes, in their order; 0 is **All**. */
export const sinceChoices = [15, 60, 1440, 0] as const;

/** A choice of **Since**. */
export type SinceMinutes = (typeof sinceChoices)[number];

/** **Since** to start with: 1 hour. */
export const firstSince: SinceMinutes = 60;

/** **By query** or **All**. */
export type Grouping = 'by-query' | 'all';
