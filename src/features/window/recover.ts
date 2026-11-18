/**
 * Feature: window.recover
 *
 * The window is drawn by a process of its own. When that process dies or hangs, Datardo says so in a dialog of the
 * system and brings the window back; the connections and the work in progress live in the main process and go on.
 */

/** What happened to the window process. */
export type WindowTrouble =
  | {
      readonly kind: 'gone';
      /** The reason the system gives: `crashed`, `killed`, `oom`. */
      readonly reason: string;
      /** How many times it was gone within the last minute, this one included. */
      readonly timesInMinute: number;
    }
  | { readonly kind: 'not-answering' };

/** A button of the dialog, and what it does. */
export interface RecoverButton {
  readonly title: string;
  readonly does: 'reload' | 'reload-without-tabs' | 'quit' | 'wait';
}

/** What the dialog of the system shows, and the line the Log gets. */
export interface RecoverView {
  readonly message: string;
  readonly detail?: string;
  readonly buttons: readonly RecoverButton[];
  /** The line written in the Log, without the prefix `[window.recover]` the runner's Log adds. */
  readonly logLine: string;
}

/** How many times within a minute the process may be gone before Datardo offers to reload without the tabs. */
export const timesBeforeWithoutTabs = 3;

/** The time within which those times are counted (Datardo's choice). */
export const timesWindowMs = 60_000;

/** How long **Wait** waits before the dialog comes back when the window still does not answer (Datardo's choice). */
export const waitMs = 30_000;

/** How many times the window process was gone within the last minute, from the times it was, as of `now`. */
export function timesInLastMinute(times: readonly number[], now: number): number {
  return times.filter((time) => now - time < timesWindowMs).length;
}

/**
 * Feature: window.recover
 *
 * *The window stopped working.* with **Reload** and **Quit**; *The window stopped working 3 times in a minute.* with
 * **Reload without the tabs** and **Quit**; *The window is not answering.* with **Wait** and **Reload**.
 */
export function view(trouble: WindowTrouble): RecoverView {
  if (trouble.kind === 'not-answering') {
    return {
      message: 'The window is not answering.',
      buttons: [
        { title: 'Wait', does: 'wait' },
        { title: 'Reload', does: 'reload' },
      ],
      logLine: 'the window process does not answer',
    };
  }
  const logLine = `the window process is gone: ${trouble.reason}`;
  if (trouble.timesInMinute >= timesBeforeWithoutTabs) {
    return {
      message: `The window stopped working ${timesBeforeWithoutTabs} times in a minute.`,
      buttons: [
        { title: 'Reload without the tabs', does: 'reload-without-tabs' },
        { title: 'Quit', does: 'quit' },
      ],
      logLine,
    };
  }
  return {
    message: 'The window stopped working.',
    detail:
      'Your connections are still open and the work in progress goes on. Reload brings the tabs back; text typed in ' +
      'the last second may be lost.',
    buttons: [
      { title: 'Reload', does: 'reload' },
      { title: 'Quit', does: 'quit' },
    ],
    logLine,
  };
}
