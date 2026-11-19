/**
 * Feature: pubsub.unsubscribe
 *
 * Stops receiving the messages of one channel or pattern, or of all of them. The subscription leaves the list at once
 * (the app step `pubsub.remove`) and its messages stay in the list of messages; `UNSUBSCRIBE` or `PUNSUBSCRIBE` is
 * sent only while the page's connection is open, so that a subscription removed while disconnected is not subscribed
 * again when the connection comes back. With none left, the page's connection is closed.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, AppStep, Context, EngineStep, Outcome, Step } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { commandLine } from '../runner/step-text';
import { namesText } from './subscribe';
import { text } from './text';
import type { NamedSubscription, PubSubPage } from './types';
import {
  namedSubscription,
  pageConnectionOf,
  pubsubClient,
  pubsubPageOf,
  sameBytes,
  startArgs,
  subscriptionArgs,
} from './types';

function isOne(each: NamedSubscription, of: readonly NamedSubscription[]): boolean {
  return of.some((one) => one.kind === each.kind && sameBytes(one.name, each.name));
}

function commandStep(connection: ConnectionView, name: string, names: readonly NamedSubscription[]): EngineStep {
  const command = [new TextEncoder().encode(name), ...names.map((each) => each.name)];
  return {
    kind: 'engine',
    connection: pubsubClient(connection.id),
    request: { engine: 'redis', database: 0, command },
    writes: false,
    text: commandLine(command),
  };
}

/** `UNSUBSCRIBE` with the channels, then `PUNSUBSCRIBE` with the patterns, each left out when it has none. */
function unsubscribeSteps(connection: ConnectionView, names: readonly NamedSubscription[]): readonly EngineStep[] {
  const channels = names.filter((each) => each.kind === 'channel');
  const patterns = names.filter((each) => each.kind === 'pattern');
  return [
    ...(channels.length === 0 ? [] : [commandStep(connection, 'UNSUBSCRIBE', channels)]),
    ...(patterns.length === 0 ? [] : [commandStep(connection, 'PUNSUBSCRIBE', patterns)]),
  ];
}

function removeStep(connection: ConnectionView, names: readonly NamedSubscription[]): AppStep {
  return {
    kind: 'app',
    text: text.unsubscribe.remove(namesText(names), connection.name),
    action: 'pubsub.remove',
    args: { connection: connection.id, subscriptions: names.map(subscriptionArgs) },
  };
}

/** The app step that closes the page's connection. */
export function closeStep(connection: ConnectionView): AppStep {
  return {
    kind: 'app',
    text: text.unsubscribe.close(connection.name),
    action: 'pubsub.close',
    args: { connection: connection.id },
  };
}

/** The steps that remove the subscriptions named from the page. */
export function unsubscribeStepsOf(
  connection: ConnectionView,
  page: PubSubPage,
  names: readonly NamedSubscription[],
): readonly Step[] {
  if (names.length === 0) {
    return [];
  }
  const sending = page.pageConnection === 'open' || page.pageConnection === 'connecting';
  const left = page.subscriptions.filter((each) => !isOne(each, names));
  return [
    removeStep(connection, names),
    ...(sending ? unsubscribeSteps(connection, names) : []),
    ...(left.length === 0 && page.pageConnection !== 'closed' ? [closeStep(connection)] : []),
  ];
}

/** The subscriptions an intent names: `'all'` (the command `pubsub.unsubscribe:all`), or `{ kind, hex }`. */
function namedOf(page: PubSubPage, answers: Answers): readonly NamedSubscription[] {
  if (answers['args'] === 'all') {
    return page.subscriptions;
  }
  const named = namedSubscription(startArgs(answers));
  return named === undefined ? [] : page.subscriptions.filter((each) => isOne(each, [named]));
}

/** Feature: pubsub.unsubscribe — `{ kind, hex }`, or `'all'`: the steps that end those subscriptions. */
export function plan(context: Context, answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const page = id === undefined ? undefined : pubsubPageOf(context.state, id);
  const names = connection === undefined || page === undefined ? [] : namedOf(page, answers);
  const steps = connection === undefined || page === undefined ? [] : unsubscribeStepsOf(connection, page, names);
  return run({
    title: answers['args'] === 'all' ? text.unsubscribe.all : text.unsubscribe.title(namesText(names)),
    steps,
    danger: noDanger,
    undo: { cannot: text.unsubscribe.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The page once `pubsub.remove` ran: the subscriptions gone; the messages they brought stay, held ones too. */
export function pageWithout(page: PubSubPage, names: readonly NamedSubscription[]): PubSubPage {
  return { ...page, subscriptions: page.subscriptions.filter((each) => !isOne(each, names)) };
}
