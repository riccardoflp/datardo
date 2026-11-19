/**
 * The scans of the keys area that run to the end of a database: the one `key.delete-by-pattern` counts with and
 * `key.export` reads the names of (`key.scan-all`), and the delete that is not recorded, which scans again and unlinks
 * what each reply returns (`key.unlink-scanned`). Every command is `SCAN`, never `KEYS` (R9.3), and goes through the
 * connection's client in the database asked.
 */
import type { EngineService } from '../engines';
import { afterCountPage, countResult, countStart, type CountProgress } from '../features/key/delete-by-pattern';
import { parse as parseScan, scanCall, scanCommand, type ScanArgs } from '../features/key/scan';
import { text } from '../features/key/text';
import { fieldsOf, numberOf, typeFilterOf } from '../features/key/types';
import type { AppAction } from '../runner/ports';
import type { Json, RedisReply } from '../shared/engine-request';
import { connectionId, type ConnectionId } from '../shared/ids';

/** What the scans need of the main process: the clients, whether a connection is read-only, and its name. */
export interface KeyScanPorts {
  readonly engines: () => EngineService;
  readonly isReadOnly: (connection: ConnectionId) => boolean;
  readonly connectionName: (connection: ConnectionId) => string;
}

/** The arguments of a scan to the end: the connection, the database, the pattern and the type. */
function scanAsked(args: Json): Omit<ScanArgs, 'cursor'> {
  const fields = fieldsOf(args);
  return {
    connection: connectionId(typeof fields['connection'] === 'string' ? fields['connection'] : ''),
    database: typeof fields['database'] === 'number' ? fields['database'] : 0,
    pattern: typeof fields['pattern'] === 'string' && fields['pattern'] !== '' ? fields['pattern'] : '*',
    type: typeFilterOf(fields['type']),
  };
}

type SendOne = (
  asked: Omit<ScanArgs, 'cursor'>,
  words: readonly (string | Uint8Array)[],
  signal: AbortSignal,
) => Promise<RedisReply>;

function sender(engines: () => EngineService): SendOne {
  return async (asked, words, signal) =>
    (await engines().send(scanCall(asked.connection, asked.database, words), signal)) as RedisReply;
}

/**
 * `key.scan-all` `{ connection, database, pattern, type, keepAtMost }`: `DBSIZE`, then `SCAN` from cursor 0 until the
 * cursor is 0 again; the names are kept while they are no more than `keepAtMost` (every name when it is null). Cancel
 * stops after the call in flight and ends the read.
 */
const scanAll =
  (sendOne: SendOne): AppAction =>
  async (args, signal) => {
    const asked = scanAsked(args);
    const keep = fieldsOf(args)['keepAtMost'];
    const keepAtMost = typeof keep === 'number' ? keep : Number.MAX_SAFE_INTEGER;
    const total = numberOf(await sendOne(asked, ['DBSIZE'], signal)) ?? 0;
    let progress: CountProgress = countStart;
    do {
      signal.throwIfAborted();
      const reply = await sendOne(asked, scanCommand({ ...asked, cursor: progress.cursor }), signal);
      progress = afterCountPage(progress, parseScan([reply]), keepAtMost);
    } while (!progress.complete);
    return countResult(progress, total);
  };

/**
 * `key.unlink-scanned` `{ connection, database, pattern, type }`: the delete of `key.delete-by-pattern` that is not
 * recorded: `SCAN` from cursor 0, and after each reply `UNLINK` with its keys, until the cursor is 0. Cancel stops after
 * the command in flight. Refused on a read-only connection, as the runner's guard refuses a step that writes.
 */
const unlinkScanned =
  (sendOne: SendOne, ports: KeyScanPorts): AppAction =>
  async (args, signal) => {
    const asked = scanAsked(args);
    if (ports.isReadOnly(asked.connection)) {
      throw new Error(text.readOnly(ports.connectionName(asked.connection)));
    }
    let cursor = '0';
    let deleted = 0;
    do {
      signal.throwIfAborted();
      const page = parseScan([await sendOne(asked, scanCommand({ ...asked, cursor }), signal)]);
      if (page.keys.length > 0) {
        deleted += numberOf(await sendOne(asked, ['UNLINK', ...page.keys], signal)) ?? 0;
      }
      cursor = page.cursor;
    } while (cursor !== '0');
    return deleted;
  };

/** `key.scan-all` and `key.unlink-scanned`, through the clients of `ports`. */
export function keyScanActions(ports: KeyScanPorts): Readonly<Record<string, AppAction>> {
  const sendOne = sender(ports.engines);
  return { 'key.scan-all': scanAll(sendOne), 'key.unlink-scanned': unlinkScanned(sendOne, ports) };
}
