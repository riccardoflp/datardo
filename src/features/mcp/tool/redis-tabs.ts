/**
 * The tools that open Datardo's tabs on a Redis connection (`mcp.tab-tools`): the keys of a pattern, one key, the
 * Server page. The tab shows the user the values; the tool returns none of them.
 */
import { setting } from '../../settings/read';
import { knownTypes } from '../../key/types';
import { connectionPageShows } from '../../palette/sources';
import { serverPage } from '../../server/show';
import { serverSections } from '../../server/types';
import { keyArg, oneOfArg, redisDatabaseArg, stringArg, toolConnection } from '../arguments';
import { ToolProblem, type ToolSession } from './program';
import { keyText, redisCall, redisReply, replyText, utf8Text } from './redis';
import { openTab } from './tabs';

function separatorOf(session: ToolSession): string {
  return setting(session.context.state.settings, 'datardo.key.separator');
}

/** `redis_open_keys`: the keys tab of the database, with the pattern and the type filter, which scans by itself. */
export function openKeys(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const database = redisDatabaseArg(session.args, connection);
  const pattern = stringArg(session.args, 'pattern') ?? '*';
  const type = oneOfArg(session.args, 'type', knownTypes);
  const shows = { kind: 'keys', connection: connection.id, database, separator: separatorOf(session) } as const;
  const memory = { pattern, ...(type === undefined ? {} : { typeFilter: type }) };
  return openTab(
    session,
    { shows, memory },
    `Opened the keys of db${String(database)} on ${connection.name} with the pattern ${pattern}${type === undefined ? '' : ` (type ${type})`}.`,
  );
}

/** `redis_open_key`: the key tab of a key that exists (`TYPE <key>` tells one that does not). */
export function openKey(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const database = redisDatabaseArg(session.args, connection);
  const key = keyArg(session.args);
  const [reply] = session.send([redisCall(connection.id, database, ['TYPE', key])]);
  const where = { connectionName: connection.name, database };
  if (replyText(redisReply(reply, where)) === 'none') {
    throw new ToolProblem(
      `The key ${keyText(key)} doesn't exist in db${String(database)} of ${connection.name}: use redis_scan_keys.`,
    );
  }
  const text = utf8Text(key);
  const shows = {
    kind: 'key',
    connection: connection.id,
    database,
    key: text ?? keyText(key),
    ...(text === undefined ? { keyHex: Array.from(key, (byte) => byte.toString(16).padStart(2, '0')).join('') } : {}),
    separator: separatorOf(session),
  } as const;
  return openTab(session, { shows }, `Opened the key ${keyText(key)} of db${String(database)} on ${connection.name}.`);
}

/** `redis_open_server`: the Server page on a section; without one, the page as it opens (`server.show`). */
export function openServer(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const section = oneOfArg(session.args, 'section', serverSections);
  return openTab(
    session,
    { shows: connectionPageShows(connection.id, serverPage), ...(section === undefined ? {} : { section }) },
    `Opened the Server page of ${connection.name}${section === undefined ? '' : ` on ${section}`}.`,
  );
}
