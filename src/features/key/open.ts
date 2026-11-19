/**
 * Feature: key.open
 *
 * Opens one key in a tab of its own, where its value has all the room of the main island. `TYPE <key>` says which
 * view the tab has and that the key exists; a key that already has its tab makes that tab active.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, AppStep, Context, Outcome, ReadFeature } from '../../shared/feature';
import { ask, needRead, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { TabShows } from '../../shared/state/tabs';
import { appPlan } from '../nav/types';
import { sameTab } from '../tab/open';
import { text } from './text';
import type { KeyName, KeysPlace } from './types';
import {
  databaseName,
  hexOf,
  isConnected,
  keyArgs,
  nameOfText,
  nameText,
  oneKeyRequest,
  parseType,
  placeOf,
  quoted,
  separatorOf,
  textOfName,
} from './types';

/** The identifier of the read of the key's type. */
export const typeReadId = 'key.open:read';

/** What the key tab of a key shows: its name as text, and the bytes in hexadecimal when the name is not text. */
export function keyTabShows(context: Context, place: KeysPlace, name: KeyName): TabShows {
  const asText = textOfName(name);
  return {
    kind: 'key',
    connection: place.connection.id,
    database: place.database,
    key: asText ?? quoted(name),
    ...(asText === undefined ? { keyHex: hexOf(name) } : {}),
    separator: separatorOf(context),
  };
}

/** The step that opens the key tab, or makes the open one active. */
export function openKeyStep(context: Context, place: KeysPlace, name: KeyName): AppStep {
  const shows = keyTabShows(context, place, name);
  const open = sameTab(context.state, shows);
  const words = [nameText(name), databaseName(place.database), place.connection.name] as const;
  return open === undefined
    ? {
        kind: 'app',
        action: 'tab.open',
        args: { shows: shows as Json, background: false },
        text: text.open.step(...words),
      }
    : { kind: 'app', action: 'tab.activate', args: { tab: open.id }, text: text.open.activate(...words) };
}

/** The name asked by **Open key…**, when there is no key in what the feature was started on. */
function askedName(place: KeysPlace, answers: Answers): KeyName | 'ask' {
  if (place.key !== undefined) {
    return place.key;
  }
  const typed = answers['name'];
  return typeof typed === 'string' && typed !== '' ? nameOfText(typed) : 'ask';
}

/**
 * Feature: key.open — reads `TYPE <key>`, then the app step `open the key tab orders:42 of db0 on Cache local`.
 * Refused for a key that does not exist (`/gone`, or `/not-found` from **Open key…**) and when not connected.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.open needs a key of a Redis connection.');
  }
  if (!isConnected(context, place)) {
    return refuse('key.open/not-connected', text.notConnected(place.connection.name));
  }
  const name = askedName(place, answers);
  if (name === 'ask') {
    return ask({
      title: text.open.title,
      button: text.open.button,
      fields: [
        { kind: 'text', key: 'name', label: text.open.name, rules: [{ kind: 'not-empty', message: text.open.name }] },
      ],
    });
  }
  const type = answers['type'];
  if (typeof type !== 'string') {
    return needRead('type', typeReadId, keyArgs(place, name));
  }
  if (type === 'none') {
    return place.key === undefined
      ? refuse('key.open/not-found', text.open.notFound(nameText(name), databaseName(place.database)))
      : refuse('key.open/gone', text.gone(nameText(name)));
  }
  return run(appPlan(text.open.title, [openKeyStep(context, place, name)]));
}

/** `key.open:read`: `TYPE <key>`, whose answer is the type, or `none`. */
export const read: ReadFeature = {
  kind: 'read',
  id: featureId(typeReadId),
  request: (_context: Context, args: Json) => oneKeyRequest('TYPE', args),
  parse: parseType,
};
