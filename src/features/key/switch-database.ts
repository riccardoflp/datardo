/**
 * Feature: key.switch-database
 *
 * Shows the keys of another database of the same server: the keys tab of that database, opened or made active. It
 * reads nothing of its own: the databases and their numbers of keys are those the tree last read (`INFO keyspace`,
 * `CONFIG GET databases`), given in `args.databases`. The tab of the other database has a client of its own, which
 * sends `SELECT <n>` once; no command is sent on the tabs that are open.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, AppStep, Context, Outcome } from '../../shared/feature';
import { ask, refuse, run } from '../../shared/feature';
import type { TabShows } from '../../shared/state/tabs';
import { appPlan } from '../nav/types';
import { sameTab } from '../tab/open';
import { text } from './text';
import type { KeysPlace } from './types';
import { argsOf, databaseName, fieldsOf, placeOf, separatorOf } from './types';

/** How many databases a server has when the tree has not said (Redis's default). */
export const defaultDatabases = 16;

/** A database of the list, as Go to shows it: `db0 · 1,204 keys`, `db3 · empty`. */
export interface DatabaseChoice {
  readonly database: number;
  readonly label: string;
  readonly present: boolean;
}

/** The databases of the server, from `args.databases`: `{ count, keys: { "0": 1204, "3": 5 } }`. */
export function databaseList(args: Readonly<Record<string, unknown>>, present: number): readonly DatabaseChoice[] {
  const databases = fieldsOf(args['databases']);
  const count =
    typeof databases['count'] === 'number' && databases['count'] > 0 ? databases['count'] : defaultDatabases;
  const keys = fieldsOf(databases['keys']);
  return Array.from({ length: count }, (_, database) => {
    const number = keys[String(database)];
    return {
      database,
      label: text.switchDatabase.choice(databaseName(database), typeof number === 'number' ? number : 0),
      present: database === present,
    };
  });
}

/** What the keys tab of a database shows: no namespace, so an empty pattern and **All types**. */
export function keysTabShows(context: Context, place: KeysPlace, database: number): TabShows {
  return { kind: 'keys', connection: place.connection.id, database, separator: separatorOf(context) };
}

/** The step that opens the keys tab of a database, or makes its open tab active as it is. */
export function openKeysStep(context: Context, place: KeysPlace, database: number): AppStep {
  const shows = keysTabShows(context, place, database);
  const open = sameTab(context.state, shows);
  const words = [databaseName(database), place.connection.name] as const;
  return open === undefined
    ? {
        kind: 'app',
        action: 'tab.open',
        args: { shows: shows as Json, background: false },
        text: text.switchDatabase.step(...words),
      }
    : { kind: 'app', action: 'tab.activate', args: { tab: open.id }, text: text.switchDatabase.activate(...words) };
}

/**
 * Feature: key.switch-database — `args.database`, or the database picked in Go to's list, then `open the keys tab of
 * db3 on Cache local`. A database the server does not have is refused (`/out-of-range`).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.switch-database needs a Redis connection.');
  }
  const args = argsOf(answers);
  const list = databaseList(args, place.database);
  const chosen = args['database'] ?? answers['database'];
  if (chosen === undefined) {
    return ask({
      title: text.switchDatabase.title,
      button: text.switchDatabase.button,
      fields: [
        {
          kind: 'pick-one',
          key: 'database',
          label: text.switchDatabase.ask,
          choices: list.map((each) => ({
            value: String(each.database),
            label: each.label,
            ...(each.present ? { description: text.switchDatabase.current } : {}),
          })),
          default: String(place.database),
        },
      ],
    });
  }
  const database = Number(chosen);
  if (!Number.isInteger(database) || database < 0 || database >= list.length) {
    return refuse(
      'key.switch-database/out-of-range',
      text.switchDatabase.outOfRange(
        `db${typeof chosen === 'string' || typeof chosen === 'number' ? String(chosen) : '?'}`,
        list.length,
      ),
    );
  }
  return run(appPlan(text.switchDatabase.title, [openKeysStep(context, place, database)]));
}
