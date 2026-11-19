/**
 * Feature: pubsub.reconnect
 *
 * Opens the page's connection again and subscribes again to every channel and pattern of its list, and marks in the
 * list where messages may be missing: Redis keeps nothing of Pub/Sub, so a message published while the page was
 * disconnected is never received. It starts by itself when the page's connection closes while the page has
 * subscriptions, after 1, 2, 4, 8 and 16 seconds, then every 30 seconds, for as long as the saved connection is
 * connected and the tab is open; **Reconnect now** in the banner tries at once.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { messagesAfter, resumedKept } from './keep';
import { connectSteps, subscribeSteps } from './subscribe';
import { text } from './text';
import type { Gap, PubSubPage } from './types';
import { clockText, pageConnectionOf, pubsubPageOf } from './types';

/** The waits before the first tries, in seconds; then {@link retryEverySeconds} (all Datardo's choice). */
export const retryDelaysSeconds: readonly number[] = [1, 2, 4, 8, 16];

/** The wait between tries once the first ones failed, in seconds (Datardo's choice). */
export const retryEverySeconds = 30;

/** The wait before the try that follows `failed` failed tries, in milliseconds. */
export function retryDelayMs(failed: number): number {
  return (retryDelaysSeconds[failed] ?? retryEverySeconds) * 1000;
}

/**
 * Feature: pubsub.reconnect — the steps that open the page's connection again and subscribe again: `open a
 * connection…`, `HELLO 3 …`, `SUBSCRIBE` with every channel of the list, `PSUBSCRIBE` with every pattern. Nothing is
 * planned when the saved connection is not connected (the user disconnected it) or the page has no subscription.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const page = id === undefined ? undefined : pubsubPageOf(context.state, id);
  const connected =
    connection !== undefined && connectionState(context.state.connections, connection.id) === 'connected';
  const steps =
    !connected || page === undefined || page.subscriptions.length === 0
      ? []
      : [...connectSteps(connection), ...subscribeSteps(connection, page.subscriptions)];
  return run({
    title: text.reconnect.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.reconnect.cannotUndo },
    publishes: false,
    after: [],
  });
}

/**
 * The page once its connection closed by itself: disconnected since `at`, the first try in one second, the
 * subscriptions dimmed, and a pause ended with the messages it held in the list.
 */
export function disconnectedPage(page: PubSubPage, at: number): PubSubPage {
  const { retryError: _gone, ...rest } = page;
  return {
    ...rest,
    pageConnection: 'disconnected',
    disconnectedAt: page.disconnectedAt ?? at,
    tries: 0,
    retryAt: at + retryDelayMs(0),
    subscriptions: page.subscriptions.map((each) => ({ ...each, answered: false })),
    kept: resumedKept(page.kept),
  };
}

/** The page once a try failed at `now`: the next try later, and the error shown in the banner. */
export function retryFailedPage(page: PubSubPage, now: number, error: string): PubSubPage {
  const tries = page.tries + 1;
  return { ...page, tries, retryAt: now + retryDelayMs(tries), retryError: error };
}

/** The page once the user disconnected the saved connection: no retry, **■ Not connected** with **Connect**. */
export function notConnectedPage(page: PubSubPage, at: number): PubSubPage {
  const { retryAt: _retry, retryError: _error, ...rest } = page;
  return {
    ...rest,
    pageConnection: 'not-connected',
    disconnectedAt: page.disconnectedAt ?? at,
    subscriptions: page.subscriptions.map((each) => ({ ...each, answered: false })),
    kept: resumedKept(page.kept),
  };
}

/**
 * The page once a try succeeded at `now`: open, the banner gone, and a row that is not a message for the time it was
 * disconnected, kept, copied and exported with the others and counted by the limit.
 */
export function reconnectedPage(page: PubSubPage, now: number): PubSubPage {
  const { retryAt: _retry, retryError: _error, disconnectedAt, ...rest } = page;
  const gap = disconnectedAt === undefined ? [] : [{ kind: 'gap' as const, from: disconnectedAt, to: now }];
  return { ...rest, pageConnection: 'open', tries: 0, kept: messagesAfter(page.kept, gap) };
}

/** The banner over the list while disconnected, with the error of the last try under its first line. */
export function bannerOf(page: PubSubPage): readonly string[] | undefined {
  if (page.disconnectedAt === undefined || page.pageConnection === 'open') {
    return undefined;
  }
  const first = text.reconnect.banner(clockText(page.disconnectedAt, page.offsetMinutes));
  return page.retryError === undefined ? [first] : [first, page.retryError];
}

/** The row of a gap in words: *Disconnected from 14:05:09 to 14:05:12: messages published in between…* */
export function gapText(gap: Gap, offsetMinutes: number): string {
  return text.reconnect.gap(clockText(gap.from, offsetMinutes), clockText(gap.to, offsetMinutes));
}

/** The seconds until the next try, as the state counts them down: never below 1. */
export function secondsToRetry(page: PubSubPage, now: number): number | undefined {
  return page.retryAt === undefined ? undefined : Math.max(1, Math.ceil((page.retryAt - now) / 1000));
}
