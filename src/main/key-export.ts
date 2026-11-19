/**
 * The writer of `key.export`: reads each key a page at a time with the commands `src/features/key/export.ts` builds,
 * writes the lines of `key.export-text` beside the chosen file as `<file>.part`, and renames it once complete. A
 * cancel, or a failure, deletes the part written. The keys are read through the connection's client, in the database
 * of the export; nothing is written to the deployment.
 */
import { open, rename, rm } from 'node:fs/promises';
import type { EngineService } from '../engines';
import { exportText } from '../features/key/export-text';
import {
  afterValueReply,
  dumpInstead,
  expiresAtOfReply,
  exportedText,
  headCommands,
  nextValueCommand,
  startReading,
  type ValueReading,
} from '../features/key/export';
import { scanCall } from '../features/key/scan';
import { text } from '../features/key/text';
import { bytesOfHex, fieldsOf, wordOf, type KeyName } from '../features/key/types';
import type { Json, RedisReply } from '../shared/engine-request';
import { connectionId, type ConnectionId } from '../shared/ids';

/** What the export is made with: the keys of a database, the server's version, the file. */
export interface KeyExport {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly names: readonly KeyName[];
  readonly redisVersion: string;
  readonly path: string;
}

/** What the export did: the keys written of those asked, and whether a stream had consumer groups. */
export interface KeyExported {
  readonly exported: number;
  readonly asked: number;
  readonly groups: boolean;
  /** The notification it ends with: *Exported 1,832 keys to …* and, when it applies, the line on consumer groups. */
  readonly message: string;
}

/** The export of a file step's arguments: `{ connection, database, keys, redisVersion }`. */
export function keyExportOf(path: string, args: Json): KeyExport {
  const fields = fieldsOf(args);
  const keys = Array.isArray(fields['keys']) ? fields['keys'] : [];
  return {
    connection: connectionId(typeof fields['connection'] === 'string' ? fields['connection'] : ''),
    database: typeof fields['database'] === 'number' ? fields['database'] : 0,
    names: keys.flatMap((each) => {
      const bytes = typeof each === 'string' ? bytesOfHex(each) : undefined;
      return bytes === undefined ? [] : [bytes];
    }),
    redisVersion: typeof fields['redisVersion'] === 'string' ? fields['redisVersion'] : '6.2',
    path,
  };
}

type Send = (words: readonly (string | Uint8Array)[]) => Promise<RedisReply>;

async function readValue(send: Send, first: ValueReading, signal: AbortSignal): Promise<ValueReading> {
  let reading = first;
  for (;;) {
    signal.throwIfAborted();
    const command = nextValueCommand(reading);
    if (command === undefined) {
      const instead = dumpInstead(reading);
      if (instead === undefined) {
        return reading;
      }
      reading = instead;
      continue;
    }
    reading = afterValueReply(reading, await send(command));
  }
}

/** The lines of one key, or `gone` when it no longer exists; `groups` when it is a stream with consumer groups. */
async function linesOfKey(
  send: Send,
  name: KeyName,
  more: { readonly redisVersion: string; readonly signal: AbortSignal },
): Promise<{ readonly lines: readonly string[]; readonly groups: boolean } | 'gone'> {
  const [typeCommand, expiryCommand] = headCommands(name, more.redisVersion);
  const readAt = Date.now();
  const [typeReply, expiryReply] = await Promise.all([send(typeCommand ?? []), send(expiryCommand ?? [])]);
  const type = wordOf(typeReply) ?? 'none';
  const expiresAt = expiresAtOfReply(expiryReply, more.redisVersion, readAt);
  if (type === 'none' || expiresAt === 'gone') {
    return 'gone';
  }
  const reading = await readValue(send, startReading(name, type), more.signal);
  const groupsReply = type === 'stream' ? await send(['XINFO', 'GROUPS', name]) : [];
  const lines = exportText({ name, value: reading.value, ...(expiresAt === undefined ? {} : { expiresAt }) });
  return { lines, groups: Array.isArray(groupsReply) && groupsReply.length > 0 };
}

/** Writes the export: the `.part` file, then its rename; the part is deleted when it fails or is cancelled. */
export async function writeKeyExport(
  engines: Pick<EngineService, 'send'>,
  asked: KeyExport,
  signal: AbortSignal,
): Promise<KeyExported> {
  const part = `${asked.path}.part`;
  const send: Send = async (words) =>
    (await engines.send(scanCall(asked.connection, asked.database, words), signal)) as RedisReply;
  const file = await open(part, 'w');
  let exported = 0;
  let groups = false;
  try {
    for (const name of asked.names) {
      signal.throwIfAborted();
      const key = await linesOfKey(send, name, { redisVersion: asked.redisVersion, signal });
      if (key === 'gone') {
        continue;
      }
      groups ||= key.groups;
      await file.write(key.lines.map((line) => `${line}\n`).join(''));
      exported += 1;
    }
    await file.close();
    await rename(part, asked.path);
  } catch (error: unknown) {
    await file.close().catch(() => undefined);
    await rm(part, { force: true });
    throw error;
  }
  const done = exportedText(exported, asked.names.length, asked.path);
  return {
    exported,
    asked: asked.names.length,
    groups,
    message: groups ? `${done} ${text.export.groups}` : done,
  };
}
