/**
 * Feature: watch.stop
 *
 * **Stop** closes the change stream and its cursor on the server (the app step `watch.close-stream`): the page says
 * **Stopped**, a pause ends and what was held is added to the list, which stays. When the stream is stopped or in
 * error the button is **Start**: it opens the stream as `watch.stream` says, from now, with the **Filter** and the
 * options of the page; what was written in between is not shown (`watch.resume` is the way to see it).
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { pagePlan, pageStep, startStream } from './page/plans';
import { contextPage, type WatchPage } from './page/state';
import { streamArgs } from './stream';
import { controlText } from './text';

/** Whether the stream is open, or opening: the button is **Stop**; otherwise **Start**. */
export function isOpen(page: WatchPage): boolean {
  return page.status === 'starting' || page.status === 'watching';
}

/** The button: its text and tooltip. */
export function stopButton(page: WatchPage): { readonly label: string; readonly tooltip: string } {
  return isOpen(page)
    ? { label: controlText.stop, tooltip: controlText.stopTip }
    : { label: controlText.start, tooltip: controlText.startTip };
}

/** Feature: watch.stop — close the stream when it is open; otherwise open it from now. */
export function plan(context: Context, _answers: Answers): Outcome {
  const found = contextPage(context);
  if (found === undefined) {
    return pagePlan(controlText.stopTitle, []);
  }
  const { tab, page } = found;
  if (isOpen(page)) {
    return pagePlan(controlText.stopTitle, [pageStep(controlText.stopStep, 'watch.close-stream', { tab })]);
  }
  return pagePlan(controlText.startTitle, [], [startStream(tab, streamArgs(tab, page, 'now'))]);
}
