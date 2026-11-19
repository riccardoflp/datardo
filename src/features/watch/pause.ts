/**
 * Feature: watch.pause
 *
 * Holds the new change events out of the list while the user reads it, without closing the stream; **Resume** adds
 * them to the list in order, under the cap of `watch.visible-events`. While paused the page holds at most 1,000
 * change events, the older ones dropped and counted (Datardo's choice). The app step `watch.pause` changes the page.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { pagePlan, pageStep } from './page/plans';
import { contextPage, type WatchPage } from './page/state';
import { controlText } from './text';

/** Whether **Pause** is offered: the stream is starting or watching, or the list is paused. */
export function isOffered(page: WatchPage): boolean {
  return page.paused || page.status === 'starting' || page.status === 'watching';
}

/** The text of the button: **Pause**, **Resume**, or **Resume (`<n>`)** with the number held. */
export function pauseLabel(page: WatchPage): string {
  if (!page.paused) {
    return controlText.pause;
  }
  return page.held.length === 0 ? controlText.resume : controlText.resumeHeld(page.held.length);
}

/** Feature: watch.pause — the app step that pauses the list, or resumes it when it is paused. */
export function plan(context: Context, _answers: Answers): Outcome {
  const found = contextPage(context);
  if (found === undefined || !isOffered(found.page)) {
    return pagePlan(controlText.pauseTitle, []);
  }
  const pausing = !found.page.paused;
  return pagePlan(pausing ? controlText.pauseTitle : controlText.resumeTitle, [
    pageStep(pausing ? controlText.pauseStep : controlText.resumeStep, 'watch.pause', {
      tab: found.tab,
      paused: pausing,
    }),
  ]);
}
