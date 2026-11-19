/**
 * Feature: watch.resume
 *
 * Opens the stream right after the last change event the page received, with its resume token, so that what was
 * written while the stream was closed is not lost: `resumeAfter` after **Stop** or an error, `startAfter` after the
 * `invalidate` of a drop or a rename, which the server refuses to resume after. The token is kept with the tab while
 * Datardo runs; **Clear** does not forget it.
 */
import { refuse, type Answers, type Context, type Outcome } from '../../shared/feature';
import { errorFacts, type Refusal } from '../history/oplog-window';
import { pagePlan, startStream } from './page/plans';
import { contextPage, type WatchPage } from './page/state';
import { isOpen } from './stop';
import { streamArgs } from './stream';
import { controlText } from './text';

/** Whether **Start from the last change** is offered: the stream is stopped or in error, and gave a resume token. */
export function isOffered(page: WatchPage): boolean {
  return !isOpen(page) && page.resumeToken !== undefined;
}

/** Feature: watch.resume — open the stream after the last resume token; nothing when the page has none. */
export function plan(context: Context, _answers: Answers): Outcome {
  const found = contextPage(context);
  if (found === undefined || !isOffered(found.page)) {
    return pagePlan(controlText.resumeFromLastTitle, []);
  }
  const { tab, page } = found;
  return pagePlan(controlText.resumeFromLastTitle, [], [startStream(tab, streamArgs(tab, page, 'last'))]);
}

/** The refusal of an error of a stream resumed when the oplog no longer holds its point (286); `undefined` else. */
export function resumeError(error: unknown): Refusal | undefined {
  const facts = errorFacts(error);
  const lost = facts.code === 286 || /ChangeStreamHistoryLost/u.test(facts.text);
  return lost ? (refuse('watch.resume/history-lost', controlText.historyLost) as Refusal) : undefined;
}
