/**
 * Feature: connection.read-file — tells the format of a text to import (a Compass export, a Datardo or Mongoster
 * export, a list of connection strings) and reads Datardo's and Mongoster's own exports. The text comes from outside:
 * its size and its depth are bounded (R14.4), and nothing in it is run.
 */
import { colorMapOf } from '../../shared/color';
import type { EngineName, Json } from '../../shared/engine-request';
import { exclusionFields, exclusionsOf } from '../../shared/exclusion';
import { colorFrom } from './color-from-compass';
import { decrypter, type FileCrypto, type Decrypter } from './encryption';
import { connectionsFromCompass, entrySecrets, mergedSecrets, secretOf, type EntrySecrets } from './read-compass';
import { connectionsFromList, hasHost, hostOf, missingNotes } from './read-list';
import { withSecrets } from './string-secrets';
import { fileText } from './text';
import type { FileConnection, FileConnections, FileOplog, FileProblem, FileSsh, FileTls } from './types';
import { fileProblem, isFileProblem, objectOf, textOf } from './types';

/** The largest text read as a file of connections: 10 MB. */
export const largestFile = 10 * 1024 * 1024;

/** The kinds of files the dialog of **Import connections…** offers. */
export const importFilters = [
  { name: 'Connections', extensions: ['json', 'txt', 'text', 'list', 'csv'] },
  { name: 'All files', extensions: ['*'] },
] as const;

/** The deepest nesting of a file of connections. */
const deepest = 32;

type Fields = Readonly<Record<string, unknown>>;

/** Canonical Extended JSON numbers as numbers, `$date` and `$oid` as their values; undefined when nested too deep. */
function plain(value: unknown, depth = 0): unknown {
  if (depth > deepest) {
    throw new RangeError(fileText.tooDeep);
  }
  if (Array.isArray(value)) {
    return value.map((each) => plain(each, depth + 1));
  }
  const fields = objectOf(value);
  if (fields === undefined) {
    return value;
  }
  const [key, ...others] = Object.keys(fields);
  if (key !== undefined && others.length === 0) {
    if (key === '$numberInt' || key === '$numberLong' || key === '$numberDouble') {
      return Number(fields[key]);
    }
    if (key === '$date') {
      return objectOf(fields[key]) === undefined ? fields[key] : plain(fields[key], depth + 1);
    }
    if (key === '$oid') {
      return fields[key];
    }
  }
  return Object.fromEntries(Object.entries(fields).map(([name, each]) => [name, plain(each, depth + 1)]));
}

/** The JSON object of a text, undefined when the text is not JSON (a list), or why it cannot be read. */
function jsonOf(text: string): Fields | undefined | FileProblem {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }
  try {
    return objectOf(plain(JSON.parse(trimmed))) ?? {};
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return fileProblem(reason === fileText.tooDeep ? reason : fileText.notJson(reason));
  }
}

const types: Readonly<Record<string, FileConnections['format']>> = {
  'Compass Connections': 'compass',
  'Datardo Connections': 'datardo',
  'Mongoster Connections': 'mongoster',
};

/** The entries of a JSON file, after its type and its version are checked. */
function entriesOf(json: Fields): { format: FileConnections['format']; entries: readonly unknown[] } | FileProblem {
  const type = json['type'];
  const format = typeof type === 'string' && Object.hasOwn(types, type) ? types[type] : undefined;
  if (format === undefined) {
    return fileProblem(fileText.neither);
  }
  if (json['version'] !== 1) {
    return fileProblem(fileText.version(String(json['version'])));
  }
  const entries = json['connections'];
  return Array.isArray(entries) ? { format, entries } : fileProblem(fileText.noList);
}

/** Feature: connection.read-file — whether a file has passwords encrypted with a passphrase. */
export function isEncrypted(text: string): boolean {
  if (text.length > largestFile) {
    return false;
  }
  const json = jsonOf(text);
  if (json === undefined || isFileProblem(json)) {
    return false;
  }
  const entries = json['connections'];
  return (
    Array.isArray(entries) &&
    entries.some(
      (entry) =>
        textOf(objectOf(entry)?.['connectionSecrets']) !== undefined ||
        textOf(objectOf(entry)?.['secrets']) !== undefined,
    )
  );
}

function engineOf(fields: Fields, format: FileConnections['format']): EngineName | undefined {
  const engine = fields['engine'];
  if (format === 'mongoster' || engine === undefined) {
    return 'mongodb';
  }
  return engine === 'mongodb' || engine === 'redis' ? engine : undefined;
}

function tlsOf(fields: Fields, secrets: EntrySecrets, rediss: boolean): FileTls | undefined {
  const tls = objectOf(fields['tls']);
  if (tls === undefined) {
    return rediss ? {} : undefined;
  }
  const certificateKeyFile = textOf(tls['certificateKeyFile']);
  const keyPassword = secretOf(secrets, 'tlsCertificateKeyFilePassword') ?? textOf(tls['certificateKeyFilePassword']);
  const caFile = textOf(tls['caFile']);
  return {
    ...(caFile === undefined ? {} : { caFile }),
    ...(certificateKeyFile === undefined ? {} : { certificateKeyFile }),
    ...(certificateKeyFile !== undefined && keyPassword !== undefined
      ? { certificateKeyFilePassword: keyPassword }
      : {}),
    ...(tls['allowInvalidCertificates'] === true ? { allowInvalidCertificates: true } : {}),
    ...(tls['allowInvalidHostnames'] === true ? { allowInvalidHostnames: true } : {}),
  };
}

function sshOf(fields: Fields, secrets: EntrySecrets): FileSsh | undefined {
  const ssh = objectOf(fields['ssh']);
  const host = textOf(ssh?.['host']);
  if (ssh === undefined || host === undefined) {
    return undefined;
  }
  const auth: FileSsh['auth'] = ssh['auth'] === 'privateKey' || ssh['auth'] === 'agent' ? ssh['auth'] : 'password';
  const port = Number(ssh['port']) || 22;
  const common = { host, ...(port === 22 ? {} : { port }), username: textOf(ssh['username']) ?? '', auth };
  if (auth === 'password') {
    return { ...common, password: secretOf(secrets, 'sshPassword') ?? textOf(ssh['password']) ?? '' };
  }
  if (auth === 'agent') {
    return common;
  }
  const passphrase = secretOf(secrets, 'sshPassphrase') ?? textOf(ssh['passphrase']);
  return {
    ...common,
    privateKeyFile: textOf(ssh['privateKeyFile']) ?? '',
    ...(passphrase === undefined ? {} : { passphrase }),
  };
}

function trimmedTexts(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((each): each is string => typeof each === 'string' && each.trim() !== '').map((each) => each.trim())
    : [];
}

function oplogOf(fields: Fields, format: FileConnections['format'], secrets: EntrySecrets): FileOplog | undefined {
  const oplog = objectOf(fields['redisOplog']);
  if (oplog === undefined) {
    return undefined;
  }
  const prefix = textOf(oplog['prefix']);
  const namespaces = trimmedTexts(oplog['namespaces']);
  const scope = trimmedTexts(oplog['scope']);
  const settings: Record<string, Json> = {
    ...(prefix === undefined ? {} : { prefix }),
    ...(namespaces.length === 0 ? {} : { namespaces: [...namespaces] }),
    ...(scope.length === 0 ? {} : { scope: [...scope] }),
  };
  if (format === 'datardo') {
    const connection = textOf(oplog['connection']);
    return connection === undefined ? undefined : { connection, settings };
  }
  const url = textOf(oplog['url']);
  const password = secretOf(secrets, 'redisPassword');
  return url === undefined
    ? undefined
    : { url: password === undefined ? url : withSecrets(url, { password, options: {} }), settings };
}

/** The secrets that go into the connection string: all but the key password, which goes to the TLS settings. */
function stringSecrets(secrets: EntrySecrets): EntrySecrets {
  if (secrets === 'locked') {
    return secrets;
  }
  const { tlsCertificateKeyFilePassword: _key, ...others } = secrets;
  return others;
}

/**
 * The colors of an entry: its own color, a custom one kept (`connection.color-from-compass`), and the valid entries
 * of `databaseColors` and, on a MongoDB entry, `collectionColors` (`tree.color-of`).
 */
function colorsOf(fields: Readonly<Record<string, unknown>>, engine: EngineName): Partial<FileConnection> {
  const color = colorFrom(fields['color'], 'keep-custom');
  const databaseColors = colorMapOf(fields['databaseColors'], 'databases');
  const collectionColors = engine === 'mongodb' ? colorMapOf(fields['collectionColors'], 'collections') : undefined;
  return {
    ...(color === undefined ? {} : { color }),
    ...(databaseColors === undefined ? {} : { databaseColors }),
    ...(collectionColors === undefined ? {} : { collectionColors }),
  };
}

/** One entry of a Datardo or Mongoster file, before its redis-oplog link is checked. */
async function exportedConnection(
  entry: unknown,
  format: FileConnections['format'],
  decrypt: Decrypter | undefined,
): Promise<FileConnection | FileProblem | undefined> {
  const fields = objectOf(entry);
  const engine = fields === undefined ? undefined : engineOf(fields, format);
  const written = textOf(fields?.['uri'])?.trim() ?? '';
  if (fields === undefined || engine === undefined || !hasHost(engine, written)) {
    return undefined;
  }
  const found = await entrySecrets(fields['secrets'], decrypt);
  if (isFileProblem(found)) {
    return found;
  }
  const { secrets } = found;
  const connectionString = mergedSecrets(written, stringSecrets(secrets));
  const tls = tlsOf(fields, secrets, engine === 'redis' && /^rediss:/i.test(written));
  const ssh = sshOf(fields, secrets);
  const oplog = engine === 'mongodb' ? oplogOf(fields, format, secrets) : undefined;
  const folder = textOf(fields['folder'])?.trim();
  const queriesFolder = textOf(fields['queriesFolder']);
  const id = textOf(fields['id']);
  const connection = {
    ...(id === undefined ? {} : { id }),
    name: textOf(fields['name'])?.trim() || hostOf(engine, connectionString),
    engine,
    connectionString,
    ...(folder === undefined || folder === '' ? {} : { folder }),
    ...colorsOf(fields, engine),
    ...exclusionFields(
      { excluded: fields['excluded'] === true, exclusions: exclusionsOf(fields['exclusions']) },
      engine,
    ),
    ...(fields['readOnly'] === true ? { readOnly: true } : {}),
    ...(fields['noHistory'] === true ? { noHistory: true } : {}),
    ...(queriesFolder === undefined ? {} : { queriesFolder }),
    ...(tls === undefined ? {} : { tls }),
    ...(ssh === undefined ? {} : { ssh }),
    ...(oplog === undefined ? {} : { oplog }),
  };
  return { ...connection, notes: secrets === 'locked' ? [fileText.encrypted] : missingNotes(connection) };
}

/** The links of a Datardo file whose Redis entry is not in the file, left out with a note. */
function withLinksChecked(connections: readonly FileConnection[]): readonly FileConnection[] {
  const redis = new Set(
    connections.flatMap((each) => (each.engine === 'redis' && each.id !== undefined ? [each.id] : [])),
  );
  return connections.map((each) => {
    const linked = each.oplog?.connection;
    if (linked === undefined || redis.has(linked)) {
      return each;
    }
    const { oplog: _left, ...others } = each;
    return { ...others, notes: [...each.notes, fileText.linkNotInFile] };
  });
}

async function connectionsFromExport(
  format: FileConnections['format'],
  entries: readonly unknown[],
  decrypt: Decrypter | undefined,
): Promise<FileConnections | FileProblem> {
  const connections: FileConnection[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const connection = await exportedConnection(entry, format, decrypt);
    if (isFileProblem(connection)) {
      return connection;
    }
    if (connection === undefined) {
      skipped += 1;
    } else {
      connections.push(connection);
    }
  }
  return { format, connections: format === 'datardo' ? withLinksChecked(connections) : connections, skipped };
}

/**
 * Feature: connection.read-file — the format of the text, its connections and how many entries were not one, or why
 * it cannot be read. Encrypted passwords are decrypted with the passphrase; without one they are left out.
 */
export async function connectionsFromText(
  text: string,
  passphrase: string | undefined,
  crypto: FileCrypto,
): Promise<FileConnections | FileProblem> {
  if (text.length > largestFile) {
    return fileProblem(fileText.tooLarge);
  }
  const json = jsonOf(text);
  if (json === undefined) {
    return connectionsFromList(text);
  }
  if (isFileProblem(json)) {
    return json;
  }
  const found = entriesOf(json);
  if (isFileProblem(found)) {
    return found;
  }
  const decrypt = passphrase === undefined || passphrase === '' ? undefined : decrypter(passphrase, crypto);
  if (found.format === 'compass') {
    const read = await connectionsFromCompass(found.entries, decrypt);
    return isFileProblem(read) ? read : { format: 'compass', ...read };
  }
  return connectionsFromExport(found.format, found.entries, decrypt);
}
