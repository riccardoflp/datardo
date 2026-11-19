/**
 * Feature: pubsub.subscribe
 *
 * Starts receiving the messages of one or more channels, or of every channel whose name matches a pattern. The names
 * typed are read as `console.parse-line` reads a line; with the kind **Auto**, a name that holds `*`, `?` or `[` is a
 * pattern. The first subscription opens the page's own connection (`HELLO 3 … SETNAME datardo-pubsub`, as
 * `console.connect` does), and every new channel goes in one `SUBSCRIBE`, every new pattern in one `PSUBSCRIBE`.
 * Allowed on a read-only connection: a subscription writes nothing to a deployment.
 *
 * The main process keeps the page's list of subscriptions with the functions below: the app step `pubsub.add` adds
 * the names, dimmed until the server answers their command; a reply marks them answered, and an error of the server
 * removes them and is shown under the field (`subscribeError`).
 */
import type { ConnectionView } from '../../shared/connection';
import { redisCommand } from '../../shared/engine-request';
import type { Answers, AppStep, Context, EngineStep, Outcome, Step } from '../../shared/feature';
import { ask, noDanger, refuse, run } from '../../shared/feature';
import type { Question } from '../../shared/question';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { defaultUser, savedUser } from '../console/connect';
import { commandArguments } from '../console/parse-line';
import { maskedArgument } from '../console/secret-arguments';
import { commandLine } from '../runner/step-text';
import { text } from './text';
import type { NamedSubscription, NameKind, PubSubPage, Subscription, SubscriptionKind } from './types';
import {
  nameText,
  openedPage,
  pageConnectionOf,
  pubsubClient,
  pubsubClientName,
  pubsubPageOf,
  sameBytes,
  startArgs,
  subscriptionArgs,
} from './types';

/** A Pub/Sub page holds up to this many subscriptions (Datardo's choice). */
export const subscriptionsMost = 100;

/** A name typed, with the kind it was read as. */
export type TypedName = NamedSubscription;

/** What the text typed reads as: the names, or why it cannot be read. */
export type TypedNames =
  | { readonly kind: 'names'; readonly names: readonly TypedName[] }
  | { readonly kind: 'invalid'; readonly message: string };

const globBytes = new Set([0x2a, 0x3f, 0x5b]);

/** Whether **Auto** reads a name as a pattern: it holds `*`, `?` or `[`. */
export function isPattern(name: Uint8Array): boolean {
  return name.some((byte) => globBytes.has(byte));
}

/** The names of the text typed, each once, with their kinds. */
export function typedNames(typed: string, nameKind: NameKind): TypedNames {
  const read = commandArguments(typed);
  if (read.kind === 'invalid') {
    return { kind: 'invalid', message: read.message };
  }
  const names: TypedName[] = [];
  for (const name of read.arguments) {
    const kind: SubscriptionKind = nameKind === 'auto' ? (isPattern(name) ? 'pattern' : 'channel') : nameKind;
    if (!names.some((each) => each.kind === kind && sameBytes(each.name, name))) {
      names.push({ kind, name });
    }
  }
  return { kind: 'names', names };
}

/** Whether the page has a subscription of that kind and name. */
export function isSubscribed(page: PubSubPage, typed: TypedName): boolean {
  return page.subscriptions.some((each) => each.kind === typed.kind && sameBytes(each.name, typed.name));
}

/** The names as a title or a step says them: `orders, invoices and news:*`. */
export function namesText(names: readonly { readonly name: Uint8Array }[]): string {
  const texts = names.map((each) => nameText(each.name));
  return texts.length <= 1 ? (texts[0] ?? '') : `${texts.slice(0, -1).join(', ')} and ${texts[texts.length - 1] ?? ''}`;
}

function appStep(stepText: string, action: string, args: AppStep['args']): AppStep {
  return { kind: 'app', text: stepText, action, args };
}

/** The user `HELLO` and `AUTH` name, or none when the connection has no password. */
function authUser(connection: ConnectionView): string | undefined {
  if (!connection.secrets.password) {
    return undefined;
  }
  const user = savedUser(connection);
  return user === '' ? defaultUser : user;
}

/** The steps that open the page's connection: `open a connection to … for Pub/Sub`, then `HELLO 3 … SETNAME`. */
export function connectSteps(connection: ConnectionView): readonly Step[] {
  const user = authUser(connection);
  const args = { connection: connection.id, ...(user === undefined ? {} : { user }) };
  const setName: EngineStep = {
    kind: 'engine',
    connection: pubsubClient(connection.id),
    request: redisCommand(0, 'CLIENT', 'SETNAME', pubsubClientName),
    writes: false,
    text: `CLIENT SETNAME ${pubsubClientName}`,
  };
  const instead: Step[] = [
    ...(user === undefined ? [] : [appStep(`AUTH ${user} ${maskedArgument}`, 'pubsub.auth', args)]),
    setName,
  ];
  const auth = user === undefined ? '' : ` AUTH ${user} ${maskedArgument}`;
  return [
    appStep(text.subscribe.open(connection.hosts), 'pubsub.open', { connection: connection.id }),
    {
      ...appStep(`HELLO 3${auth} SETNAME ${pubsubClientName}`, 'pubsub.hello', args),
      onFailure: { kind: 'instead', steps: instead, codes: ['NOPROTO', 'ERR unknown command'] },
    },
  ];
}

function commandStep(connection: ConnectionView, name: string, names: readonly TypedName[]): EngineStep {
  const command = [new TextEncoder().encode(name), ...names.map((each) => each.name)];
  return {
    kind: 'engine',
    connection: pubsubClient(connection.id),
    request: { engine: 'redis', database: 0, command },
    writes: false,
    text: commandLine(command),
    // An error of the server for one command leaves the other to run: its names are not added (After).
    onFailure: { kind: 'go-on' },
  };
}

/** `SUBSCRIBE` with every channel, then `PSUBSCRIBE` with every pattern, each left out when it has no name. */
export function subscribeSteps(connection: ConnectionView, names: readonly TypedName[]): readonly EngineStep[] {
  const channels = names.filter((each) => each.kind === 'channel');
  const patterns = names.filter((each) => each.kind === 'pattern');
  return [
    ...(channels.length === 0 ? [] : [commandStep(connection, 'SUBSCRIBE', channels)]),
    ...(patterns.length === 0 ? [] : [commandStep(connection, 'PSUBSCRIBE', patterns)]),
  ];
}

/** The app step that adds the names to the page's list, dimmed until the server answers. */
export function addStep(connection: ConnectionView, names: readonly TypedName[]): AppStep {
  return appStep(text.subscribe.add(namesText(names), connection.name), 'pubsub.add', {
    connection: connection.id,
    subscriptions: names.map(subscriptionArgs),
  });
}

/**
 * The steps of new subscriptions: the page's connection opened first when it has none; then the names added, and
 * sent at once while it is open or opening. While it is disconnected the names are only added, and
 * `pubsub.reconnect` subscribes to them with the others.
 */
export function newSubscriptionSteps(
  connection: ConnectionView,
  page: PubSubPage,
  names: readonly TypedName[],
): readonly Step[] {
  const waiting = page.pageConnection === 'disconnected' || page.pageConnection === 'not-connected';
  return [
    ...(page.pageConnection === 'closed' ? connectSteps(connection) : []),
    addStep(connection, names),
    ...(waiting ? [] : subscribeSteps(connection, names)),
  ];
}

/** The question of Go to: the names, and their kind. */
export function subscribeQuestion(nameKind: NameKind): Question {
  return {
    title: text.subscribe.question,
    button: text.show.subscribe,
    fields: [
      {
        kind: 'text',
        key: 'names',
        label: text.show.nameField,
        rules: [{ kind: 'not-empty', message: text.show.nameField }],
      },
      {
        kind: 'pick-one',
        key: 'kind',
        label: text.subscribe.kind,
        default: nameKind,
        choices: (['auto', 'channel', 'pattern'] as const).map((each) => ({
          value: each,
          label: text.show.kinds[each],
        })),
      },
    ],
  };
}

function nameKindOf(value: unknown, fallback: NameKind): NameKind {
  return value === 'auto' || value === 'channel' || value === 'pattern' ? value : fallback;
}

/** Why the names cannot be subscribed to: all subscribed already, or too many. */
function refusalOf(page: PubSubPage, names: readonly TypedName[], fresh: readonly TypedName[]): Outcome | undefined {
  if (fresh.length === 0) {
    return refuse('pubsub.subscribe/already-subscribed', text.subscribe.alreadySubscribed(namesText(names)));
  }
  return page.subscriptions.length + fresh.length > subscriptionsMost
    ? refuse('pubsub.subscribe/too-many', text.subscribe.tooMany)
    : undefined;
}

/**
 * Feature: pubsub.subscribe — `{ names, kind }` from the toolbar or an active channel: the steps that subscribe to the
 * names the page is not subscribed to yet. From Go to, it asks for them.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection === undefined || connectionState(context.state.connections, connection.id) !== 'connected') {
    return refuse('pubsub.subscribe/not-connected', text.subscribe.notConnected(connection?.name ?? ''));
  }
  const page = pubsubPageOf(context.state, connection.id) ?? openedPage(connection.id, 0);
  const args = startArgs(answers);
  const typed = args['names'] ?? answers['names'];
  if (typeof typed !== 'string' || typed.trim() === '') {
    return ask(subscribeQuestion(page.nameKind));
  }
  const read = typedNames(typed, nameKindOf(args['kind'] ?? answers['kind'], page.nameKind));
  if (read.kind === 'invalid') {
    return refuse('pubsub.subscribe/invalid-name', read.message);
  }
  const fresh = read.names.filter((each) => !isSubscribed(page, each));
  return (
    refusalOf(page, read.names, fresh) ??
    run({
      title: text.subscribe.title(namesText(fresh)),
      steps: newSubscriptionSteps(connection, page, fresh),
      danger: noDanger,
      undo: { cannot: text.subscribe.nothingWritten },
      publishes: false,
      after: [],
    })
  );
}

/** The page once `pubsub.add` ran: the names at the end of the list, dimmed until the server answers. */
export function pageWithAdded(page: PubSubPage, names: readonly TypedName[]): PubSubPage {
  const added: Subscription[] = names
    .filter((each) => !isSubscribed(page, each))
    .map((each) => ({ kind: each.kind, name: each.name, answered: false, received: 0 }));
  return { ...page, subscriptions: [...page.subscriptions, ...added] };
}

/** The page once the server answered a `SUBSCRIBE` or a `PSUBSCRIBE`: its names are no longer dimmed. */
export function pageWithAnswered(page: PubSubPage, names: readonly TypedName[]): PubSubPage {
  const answered = (each: Subscription): boolean =>
    names.some((name) => name.kind === each.kind && sameBytes(name.name, each.name));
  return {
    ...page,
    subscriptions: page.subscriptions.map((each) => (answered(each) ? { ...each, answered: true } : each)),
  };
}

/** The page once the server refused a command: its names leave the list. */
export function pageWithRefused(page: PubSubPage, names: readonly TypedName[]): PubSubPage {
  return {
    ...page,
    subscriptions: page.subscriptions.filter(
      (each) => !names.some((name) => name.kind === each.kind && sameBytes(name.name, each.name)),
    ),
  };
}

/** What is shown under the field when the server refused a command: a user whose ACL does not allow the channels. */
export function subscribeError(names: readonly TypedName[], message: string): string {
  return message.startsWith('NOPERM') ? text.subscribe.notAllowed(namesText(names), message) : message;
}
