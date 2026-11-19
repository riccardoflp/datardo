/**
 * Feature: pubsub.pause
 *
 * Holds the new messages without unsubscribing, so that the list stands still while it is read. Nothing is sent to
 * the server: the subscriptions stay. **Pause** reads **Resume (42)** while paused, with the number of messages held,
 * as in Mongoster's Watch tab (`src/webview/watch.ts`). The pause is not kept with the tab.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { pausedKept, resumedKept } from './keep';
import { text } from './text';
import type { PubSubPage } from './types';
import { pageConnectionOf } from './types';

/** Pause, or resume. */
export type PauseVariant = 'pause' | 'resume';

/** What the button of the toolbar reads: **Pause**, **Resume (3)**, or **Resume** when nothing is held. */
export function pauseLabel(page: PubSubPage): string {
  if (!page.kept.paused) {
    return text.pause.pause;
  }
  const held = page.kept.held.length;
  return held === 0 ? text.pause.resume : text.pause.resumeHeld(held);
}

/** Whether **Pause** is offered: the page has a subscription, or is paused. */
export function isPauseOffered(page: PubSubPage): boolean {
  return page.subscriptions.length > 0 || page.kept.paused;
}

/** Feature: pubsub.pause — `'resume'` (the command `pubsub.pause:resume`) resumes; anything else pauses. */
export function plan(context: Context, answers: Answers): Outcome {
  const variant: PauseVariant = answers['args'] === 'resume' ? 'resume' : 'pause';
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const steps =
    connection === undefined
      ? []
      : [
          {
            kind: 'app' as const,
            text: variant === 'pause' ? text.pause.pauseStep(connection.name) : text.pause.resumeStep(connection.name),
            action: variant === 'pause' ? 'pubsub.pause' : 'pubsub.resume',
            args: { connection: connection.id },
          },
        ];
  return run({
    title: variant === 'pause' ? text.pause.pauseTitle : text.pause.resumeTitle,
    steps,
    danger: noDanger,
    undo: { cannot: text.pause.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The page once `pubsub.pause` ran. */
export function pausedPage(page: PubSubPage): PubSubPage {
  return { ...page, kept: pausedKept(page.kept) };
}

/** The page once `pubsub.resume` ran: the held messages join the list, with the times they arrived. */
export function resumedPage(page: PubSubPage): PubSubPage {
  return { ...page, kept: resumedKept(page.kept) };
}
