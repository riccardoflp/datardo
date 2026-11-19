/**
 * Feature: pubsub.clear
 *
 * Empties the list of messages, with the messages a pause holds, to start watching from now. Nothing is sent to the
 * server: the subscriptions, the filter and the pause stay. No confirmation, as **Clear** of the Watch changes page;
 * the messages are kept nowhere else, so it cannot be undone.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { clearedKept } from './keep';
import { text } from './text';
import type { PubSubPage } from './types';
import { pageConnectionOf } from './types';

/** Whether **Clear** is offered: the list or the held messages are not empty. */
export function isClearOffered(page: PubSubPage): boolean {
  return page.kept.listed.length > 0 || page.kept.held.length > 0;
}

/** Feature: pubsub.clear — the app step `clear the messages of the Pub/Sub page of Cache local`. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const steps =
    connection === undefined
      ? []
      : [
          {
            kind: 'app' as const,
            text: text.clear.step(connection.name),
            action: 'pubsub.clear',
            args: { connection: connection.id },
          },
        ];
  return run({
    title: text.clear.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.clear.cannotUndo },
    publishes: false,
    after: [],
  });
}

/**
 * The page once `pubsub.clear` ran: no message listed or held, every count of **Subscriptions** back to 0, nothing
 * selected or inspected. The subscriptions, the filter and the pause stay.
 */
export function clearedPage(page: PubSubPage): PubSubPage {
  const { inspected: _gone, ...rest } = page;
  return {
    ...rest,
    kept: clearedKept(page.kept),
    subscriptions: page.subscriptions.map((each) => ({ ...each, received: 0 })),
    selected: [],
  };
}
