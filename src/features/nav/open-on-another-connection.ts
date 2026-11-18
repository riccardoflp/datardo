/**
 * Feature: nav.open-on-another-connection
 *
 * Opens what the active tab shows, with the same query, on another connection of the same engine: the same collection
 * on staging and on production, the same keys on two caches. It reads only, on both sides.
 */
import {
  ask,
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type ReadFeature,
  type ReadRequest,
} from '../../shared/feature';
import { redisCommand, utf8Bytes, type ConnectionRequest, type Json } from '../../shared/engine-request';
import { connectionId, featureId } from '../../shared/ids';
import { switcherGroups } from './switch-connection';
import { text } from './text';
import {
  appPlan,
  appStep,
  findConnection,
  navInput,
  startArgs,
  textArg,
  tabConnection,
  type ActiveTab,
  type NavInput,
  type SavedConnection,
} from './types';

/** The identifier of the read this feature asks for on the other connection. */
export const sideReadId = 'nav.open-on-another-connection:read';

/** The tabs it is shown on: a collection tab, a keys tab, a key tab. */
export function isShownOn(tab: ActiveTab): boolean {
  return tab.kind === 'collection' || tab.kind === 'keys' || tab.kind === 'key';
}

/** The other saved connections of the engine of the active tab, never the tab's own. */
export function otherConnections(input: NavInput): readonly SavedConnection[] {
  const own = findConnection(input.connections, tabConnection(input.activeTab));
  if (own === undefined || !isShownOn(input.activeTab)) {
    return [];
  }
  return input.connections.filter((connection) => connection.engine === own.engine && connection.id !== own.id);
}

/** Why the button is disabled, or `undefined` when another connection can be chosen. */
export function disabledReason(input: NavInput): string | undefined {
  const own = findConnection(input.connections, tabConnection(input.activeTab));
  if (own === undefined || otherConnections(input).length > 0) {
    return undefined;
  }
  return text.another.noOther(text.engines[own.engine]);
}

/** What is read on the connection chosen, to know whether the same thing is there. */
export function sideRequests(tab: ActiveTab, other: SavedConnection): readonly ConnectionRequest[] {
  switch (tab.kind) {
    case 'collection':
      return [
        {
          connection: other.id,
          request: {
            engine: 'mongodb',
            database: tab.database,
            method: 'getCollectionInfos',
            arguments: [{}, { nameOnly: true }],
          },
        },
      ];
    case 'key':
      return [{ connection: other.id, request: redisCommand(tab.database, 'EXISTS', utf8Bytes(tab.key)) }];
    case 'keys':
      return [{ connection: other.id, request: redisCommand(tab.database, 'SELECT', String(tab.database)) }];
    case 'app':
    case 'document':
    case 'page':
    case 'playground':
    case 'console':
      return [];
  }
}

/** What the read found: the names of the collections, whether the key exists, whether the database answers. */
export type SideFound =
  | { readonly kind: 'collections'; readonly names: readonly string[] }
  | { readonly kind: 'exists'; readonly exists: boolean };

/** Turns the replies of the side read into what it found. */
export function parseSide(replies: readonly unknown[]): SideFound {
  const reply = replies[0];
  if (Array.isArray(reply)) {
    const names = reply.map((info: unknown) =>
      typeof info === 'object' && info !== null ? String((info as { name?: unknown }).name) : String(info),
    );
    return { kind: 'collections', names };
  }
  return { kind: 'exists', exists: reply === 1 || reply === 'OK' || reply === true };
}

/** The decision once the side read is back: a refusal, or the plan that opens the tab there. */
export function decide(tab: ActiveTab, other: SavedConnection, found: SideFound): Outcome {
  switch (tab.kind) {
    case 'collection': {
      const names = found.kind === 'collections' ? found.names : [];
      if (names.length === 0) {
        return refuse('nav.open-on-another-connection/no-database', text.another.noDatabase(other.name, tab.database));
      }
      if (!names.includes(tab.collection)) {
        const message = text.another.noCollection(other.name, tab.collection, tab.database);
        return refuse('nav.open-on-another-connection/no-collection', message);
      }
      return opened(`open ${tab.database}.${tab.collection} on ${other.name}`, tab, other);
    }
    case 'key':
      if (found.kind === 'exists' && !found.exists) {
        const message = text.another.noKey(other.name, tab.key, `db${String(tab.database)}`);
        return refuse('nav.open-on-another-connection/no-key', message);
      }
      return opened(`open the key ${tab.key} in db${String(tab.database)} on ${other.name}`, tab, other);
    case 'keys': {
      if (found.kind === 'exists' && !found.exists) {
        const message = text.another.noDatabase(other.name, `db${String(tab.database)}`);
        return refuse('nav.open-on-another-connection/no-database', message);
      }
      const database = `db${String(tab.database)}`;
      const what = tab.namespace === undefined ? database : `${tab.namespace} in ${database}`;
      return opened(`open the keys of ${what} on ${other.name}`, tab, other);
    }
    case 'app':
    case 'document':
    case 'page':
    case 'playground':
    case 'console':
      return run(appPlan(text.commands.openOnAnother, []));
  }
}

function opened(words: string, tab: ActiveTab, other: SavedConnection): Outcome {
  const shows: Json = JSON.parse(JSON.stringify({ ...tab, connection: other.id })) as Json;
  return run(appPlan(text.commands.openOnAnother, [appStep(words, 'tab.open', { shows })]));
}

/** The plan for the nav input given. */
export function planFor(input: NavInput, answers: Answers): Outcome {
  const others = otherConnections(input);
  if (others.length === 0) {
    return run(appPlan(text.commands.openOnAnother, []));
  }
  const picked = answers['connection'] ?? startArgs(answers)['connection'];
  const other = typeof picked === 'string' ? others.find((each) => each.id === picked) : undefined;
  if (other === undefined) {
    const choices = switcherGroups(others, undefined, '').flatMap((group) =>
      group.rows.map((row) => ({
        value: row.connection.id,
        label: row.connection.name,
        ...(row.connection.readOnly ? { description: text.connection.readOnly } : {}),
      })),
    );
    return ask({
      title: text.another.question,
      button: text.another.button,
      fields: [{ kind: 'pick-one', key: 'connection', label: text.another.question, choices }],
    });
  }
  const found = answers['found'] as SideFound | undefined;
  if (found === undefined) {
    return needRead('found', sideReadId, { connection: other.id });
  }
  return decide(input.activeTab, other, found);
}

/** Opens what the active tab shows on another connection: `args.connection`, or the one the user picks. */
export function plan(context: Context, answers: Answers): Outcome {
  return planFor(navInput(context.state), answers);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.open-on-another-connection'), plan };

/** The read on the other connection, as the runner starts it for {@link plan}. */
export const sideRead: ReadFeature = {
  kind: 'read',
  id: featureId(sideReadId),
  request: (context: Context, args: Json): ReadRequest => {
    const input = navInput(context.state);
    const asked = textArg(args, 'connection');
    const other = asked !== undefined ? findConnection(input.connections, connectionId(asked)) : undefined;
    return { kind: 'engine', requests: other === undefined ? [] : sideRequests(input.activeTab, other) };
  },
  parse: (replies) => parseSide(replies),
};
