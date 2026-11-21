/**
 * The actions of the Pub/Sub area: the app steps that open and close the page's own connection (`pubsub.open`,
 * `pubsub.hello`, `pubsub.auth`, `pubsub.close`), that change its list of subscriptions (`pubsub.add`,
 * `pubsub.remove`), its list of messages (`pubsub.pause`, `pubsub.resume`, `pubsub.clear`), what it shows
 * (`pubsub.events-of`, `pubsub.choices`), that open its tab (`pubsub.open-page`), and the system's dialog of the file
 * of an export (`pubsub.choose-file`). The password `HELLO` and `AUTH` send is read here from the secret storage and
 * goes to the page's client only: no step, no state and no line of the Log holds it.
 */
import { app, dialog, type SaveDialogOptions } from 'electron';
import { join } from 'node:path';
import type { AreaActions } from '.';
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { redisConnectMs } from '../../features/connection/connect';
import { jsonFields } from '../../features/connection/types';
import { clearedPage } from '../../features/pubsub/clear';
import { oplogLinkOf } from '../../features/pubsub/follow-oplog';
import { keptWithLink } from '../../features/pubsub/keep';
import { pausedPage, resumedPage } from '../../features/pubsub/pause';
import { choicesAsked, pubsubTab } from '../../features/pubsub/show';
import { pageWithAdded } from '../../features/pubsub/subscribe';
import { text } from '../../features/pubsub/text';
import {
  namedSubscription,
  pubsubClient,
  pubsubClientName,
  type NamedSubscription,
  type PubSubPage,
} from '../../features/pubsub/types';
import { pageWithout } from '../../features/pubsub/unsubscribe';
import { EngineError, redisAddress } from '../../engines';
import type { AppAction } from '../../runner/ports';
import { clientSettings, connectionEngines, findConnection, fullConnectionString } from '../connections';
import { changePage, closeClient, flushMessages, need, opening, pageNow, received } from '../pubsub';
import type { MainServices } from '../services';
import { openTab } from './tab';

function connectionOf(args: Json): ConnectionId {
  const value = jsonFields(args)['connection'];
  if (typeof value !== 'string') {
    throw new Error('The action needs connection.');
  }
  return value as ConnectionId;
}

function pageOf(connection: ConnectionId): PubSubPage {
  const page = pageNow(connection);
  if (page === undefined) {
    throw new Error(`The Pub/Sub page of ${findConnection(connection)?.name ?? connection} is not open.`);
  }
  return page;
}

function subscriptionsOf(args: Json): readonly NamedSubscription[] {
  const listed = jsonFields(args)['subscriptions'];
  return (Array.isArray(listed) ? listed : []).flatMap((each) => {
    const named = namedSubscription(each);
    return named === undefined ? [] : [named];
  });
}

const encoder = new TextEncoder();

/** Sends words on the page's client; an error of the server fails the step with its code. */
async function sendWords(connection: ConnectionId, words: readonly string[], signal: AbortSignal): Promise<void> {
  await connectionEngines().send(
    {
      connection: pubsubClient(connection),
      request: { engine: 'redis', database: 0, command: words.map((word) => encoder.encode(word)) },
    },
    signal,
  );
}

/** The password of the connection, from its connection string in the secret storage; empty when it has none. */
function passwordOf(connection: ConnectionId): string {
  const full = fullConnectionString(connection);
  return full === undefined ? '' : redisAddress(full).password;
}

function userOf(args: Json): string | undefined {
  const user = jsonFields(args)['user'];
  return typeof user === 'string' ? user : undefined;
}

/** `pubsub.open` `{ connection }`: opens the page's client, through the connection's TLS options and tunnel. */
const openAction: AppAction = async (args, signal) => {
  const connection = connectionOf(args);
  const saved = findConnection(connection);
  const settings = saved === undefined ? undefined : clientSettings(saved, redisConnectMs);
  if (settings === undefined) {
    throw new EngineError(text.subscribe.notConnected(saved?.name ?? connection));
  }
  opening(connection);
  changePage(connection, (page) => ({ ...page, pageConnection: 'connecting' }));
  try {
    await connectionEngines().openPubSub(pubsubClient(connection), settings, signal, (push) => {
      received(connection, push);
    });
  } catch (error: unknown) {
    changePage(connection, (page) =>
      page.pageConnection === 'connecting'
        ? { ...page, pageConnection: page.disconnectedAt === undefined ? 'closed' : 'disconnected' }
        : page,
    );
    throw error;
  }
  return null;
};

/** `pubsub.hello` `{ connection, user? }`: `HELLO 3`, with `AUTH` and the password when there is a user. */
const helloAction: AppAction = async (args, signal) => {
  const connection = connectionOf(args);
  const user = userOf(args);
  const auth = user === undefined ? [] : ['AUTH', user, passwordOf(connection)];
  await sendWords(connection, ['HELLO', '3', ...auth, 'SETNAME', pubsubClientName], signal);
  return null;
};

/** `pubsub.auth` `{ connection, user }`: `AUTH` on a server without RESP3. */
const authAction: AppAction = async (args, signal) => {
  const connection = connectionOf(args);
  await sendWords(connection, ['AUTH', userOf(args) ?? 'default', passwordOf(connection)], signal);
  return null;
};

/** `pubsub.close` `{ connection }`: the page's client closed, with its last subscription. */
const closeAction: AppAction = async (args) => {
  const connection = connectionOf(args);
  await closeClient(connection);
  changePage(connection, (page) => {
    const { disconnectedAt: _at, retryAt: _retry, retryError: _error, ...rest } = page;
    return { ...rest, pageConnection: 'closed', tries: 0 };
  });
  return null;
};

/** Changes the page with what is received until now in its list first, so that the order of the list holds. */
function pageAction(change: (page: PubSubPage, args: Json) => PubSubPage): AppAction {
  return (args) => {
    const connection = connectionOf(args);
    pageOf(connection);
    flushMessages(connection);
    changePage(connection, (page) => change(page, args));
    return Promise.resolve(null);
  };
}

function withoutFieldError(page: PubSubPage): PubSubPage {
  const { fieldError: _gone, ...rest } = page;
  return rest;
}

/** `pubsub.events-of` `{ connection, eventsOf }`: the rows of the events of a MongoDB connection, or `null` for **Off**. */
function eventsOf(page: PubSubPage, args: Json): PubSubPage {
  const mongo = jsonFields(args)['eventsOf'];
  const saved =
    typeof mongo === 'string' ? savedConnection(need().state.get().connections, mongo as ConnectionId) : undefined;
  const link = saved === undefined ? undefined : oplogLinkOf(saved);
  const { eventsOf: _before, ...rest } = page;
  return {
    ...rest,
    ...(saved === undefined || link === undefined ? {} : { eventsOf: saved.id }),
    kept: keptWithLink(page.kept, link),
  };
}

/** `pubsub.choices` `{ connection, choices }`: the kind of the field and the filter, kept with the tab. */
function choices(page: PubSubPage, args: Json): PubSubPage {
  const asked = choicesAsked(jsonFields(args));
  return asked === undefined ? page : { ...page, ...asked };
}

/**
 * `pubsub.open-page` `{ connection }`: the Pub/Sub tab of the connection opened or made active, as `tab.open` does. It
 * opens the tab itself: a plan started from a step would wait in the runner's line behind the plan of the step.
 */
const openPageAction =
  (services: MainServices): AppAction =>
  (args) => {
    const connection = connectionOf(args);
    openTab(services, { shows: pubsubTab(connection) }, { background: false, visiting: 'visit' });
    pageOf(connection);
    return Promise.resolve(null);
  };

/** `pubsub.choose-file` `{ name }`: the system's save dialog for an export; the path, or null. */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const name = jsonFields(args)['name'];
    const options: SaveDialogOptions = {
      title: text.export.question,
      buttonLabel: text.export.button,
      defaultPath: join(app.getPath('documents'), typeof name === 'string' ? name : 'pubsub.jsonl'),
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  };
}

/** The actions of the Pub/Sub area, by name. */
export const actions: AreaActions = (services) => ({
  'pubsub.open': openAction,
  'pubsub.hello': helloAction,
  'pubsub.auth': authAction,
  'pubsub.close': closeAction,
  'pubsub.add': pageAction((page, args) => pageWithAdded(withoutFieldError(page), subscriptionsOf(args))),
  'pubsub.remove': pageAction((page, args) => pageWithout(page, subscriptionsOf(args))),
  'pubsub.pause': pageAction(pausedPage),
  'pubsub.resume': pageAction(resumedPage),
  'pubsub.clear': pageAction(clearedPage),
  'pubsub.events-of': pageAction(eventsOf),
  'pubsub.choices': pageAction(choices),
  'pubsub.open-page': openPageAction(services),
  'pubsub.choose-file': chooseFile(services),
});
