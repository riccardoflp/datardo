/**
 * Feature: connection.read-compass — the connections of the file MongoDB Compass writes with **Export saved
 * connections**, their encrypted secrets put back as Compass's `mergeSecrets` does.
 */
import { colorFrom } from './color-from-compass';
import type { Decrypter } from './encryption';
import { hasHost, hostOf, missingNotes } from './read-list';
import { decoded, optionName, optionValue, uriParts, withSecrets } from './string-secrets';
import { fileText } from './text';
import { setOptions, tlsFromUri } from './tls-in-uri';
import type { FileConnection, FileProblem, FileSsh } from './types';
import { fileProblem, isFileProblem, objectOf, textOf } from './types';

/** The secrets of an entry: none, those decrypted, or `locked` when they are encrypted and there is no passphrase. */
export type EntrySecrets = Readonly<Record<string, unknown>> | 'locked';

/** The secrets of an entry, decrypted; a wrong passphrase or unreadable secrets are a problem of the whole file. */
export async function entrySecrets(
  encrypted: unknown,
  decrypt: Decrypter | undefined,
): Promise<{ readonly kind: 'secrets'; readonly secrets: EntrySecrets } | FileProblem> {
  const data = textOf(encrypted);
  if (data === undefined) {
    return { kind: 'secrets', secrets: {} };
  }
  if (decrypt === undefined) {
    return { kind: 'secrets', secrets: 'locked' };
  }
  const text = await decrypt(data);
  if (isFileProblem(text)) {
    return text;
  }
  try {
    return { kind: 'secrets', secrets: objectOf(objectOf(JSON.parse(text))?.['secrets']) ?? {} };
  } catch (error: unknown) {
    return fileProblem(fileText.unreadableSecrets(error instanceof Error ? error.message : String(error)));
  }
}

/** A secret of the entry, as a string; undefined when there is none. */
export function secretOf(secrets: EntrySecrets, name: string): string | undefined {
  return secrets === 'locked' ? undefined : textOf(secrets[name]);
}

/** `authMechanismProperties` with the session token replaced, as Compass's `mergeSecrets` writes it. */
function withSessionToken(connectionString: string, token: string): string {
  const option = uriParts(connectionString)?.options.find(
    (each) => optionName(each).toLowerCase() === 'authmechanismproperties',
  );
  const pairs = decoded(optionValue(option ?? ''))
    .split(',')
    .filter((pair) => pair !== '' && !pair.startsWith('AWS_SESSION_TOKEN:'));
  return setOptions(connectionString, [
    ['authMechanismProperties', [...pairs, `AWS_SESSION_TOKEN:${token}`].join(',')],
  ]);
}

/** The connection string with the secrets of Compass put back: the password, then the secret options. */
export function mergedSecrets(connectionString: string, secrets: EntrySecrets): string {
  const password = secretOf(secrets, 'password');
  let merged = password === undefined ? connectionString : withSecrets(connectionString, { password, options: {} });
  for (const name of ['tlsCertificateKeyFilePassword', 'proxyPassword']) {
    const value = secretOf(secrets, name);
    merged = value === undefined ? merged : setOptions(merged, [[name, value]]);
  }
  const token = secretOf(secrets, 'awsSessionToken');
  return token === undefined ? merged : withSessionToken(merged, token);
}

function tunnelOf(tunnel: Readonly<Record<string, unknown>>, secrets: EntrySecrets): FileSsh {
  const keyFiles = tunnel['identityKeyFile'];
  const keyFile = textOf(Array.isArray(keyFiles) ? keyFiles[0] : keyFiles);
  const port = Number(tunnel['port']) || 22;
  const common = { host: textOf(tunnel['host']) ?? '', ...(port === 22 ? {} : { port }) };
  const username = textOf(tunnel['username']) ?? '';
  if (keyFile !== undefined) {
    const passphrase = secretOf(secrets, 'sshTunnelPassphrase') ?? textOf(tunnel['identityKeyPassphrase']);
    return {
      ...common,
      username,
      auth: 'privateKey',
      privateKeyFile: keyFile,
      ...(passphrase === undefined ? {} : { passphrase }),
    };
  }
  const password = secretOf(secrets, 'sshTunnelPassword') ?? textOf(tunnel['password']) ?? '';
  return { ...common, username, auth: 'password', password };
}

function sshAndNotes(
  options: Readonly<Record<string, unknown>>,
  connectionString: string,
  secrets: EntrySecrets,
): { ssh?: FileSsh; notes: string[] } {
  const tunnel = objectOf(options['sshTunnel']);
  const notes: string[] = [];
  let ssh: FileSsh | undefined;
  if (tunnel !== undefined && textOf(tunnel['host']) !== undefined) {
    if (/^mongodb\+srv:/i.test(connectionString)) {
      notes.push(fileText.srvTunnel);
    } else {
      ssh = tunnelOf(tunnel, secrets);
      if (hostOf('mongodb', connectionString).includes(',')) {
        notes.push(fileText.firstHostOnly);
      }
    }
  }
  const encryption = objectOf(objectOf(options['fleOptions'])?.['autoEncryption']);
  if (encryption !== undefined && Object.keys(encryption).length > 0) {
    notes.push(fileText.inUseEncryption);
  }
  if (options['useApplicationLevelProxy'] === true) {
    notes.push(fileText.applicationProxy);
  }
  return { ...(ssh === undefined ? {} : { ssh }), notes };
}

/** One entry of a Compass file: a connection, undefined when it is not one, or a problem of the whole file. */
export async function compassConnection(
  entry: unknown,
  decrypt: Decrypter | undefined,
): Promise<FileConnection | FileProblem | undefined> {
  const fields = objectOf(entry);
  const options = objectOf(fields?.['connectionOptions']) ?? {};
  const written = textOf(options['connectionString'])?.trim() ?? '';
  if (fields === undefined || !hasHost('mongodb', written)) {
    return undefined;
  }
  const found = await entrySecrets(fields['connectionSecrets'], decrypt);
  if (isFileProblem(found)) {
    return found;
  }
  const { secrets } = found;
  const { connectionString, tls } = tlsFromUri(mergedSecrets(written, secrets));
  const favorite = objectOf(fields['favorite']);
  const color = colorFrom(favorite?.['color'], 'nearest-preset');
  const { ssh, notes } = sshAndNotes(options, connectionString, secrets);
  const connection = {
    name: textOf(favorite?.['name'])?.trim() || hostOf('mongodb', connectionString),
    engine: 'mongodb' as const,
    connectionString,
    ...(color === undefined ? {} : { color }),
    ...(tls === undefined ? {} : { tls }),
    ...(ssh === undefined ? {} : { ssh }),
  };
  const missing = secrets === 'locked' ? [fileText.encrypted] : missingNotes(connection);
  return { ...connection, notes: secrets === 'locked' ? [...missing, ...notes] : [...notes, ...missing] };
}

/** Feature: connection.read-compass — the connections of the entries of a Compass file, and how many were not one. */
export async function connectionsFromCompass(
  entries: readonly unknown[],
  decrypt: Decrypter | undefined,
): Promise<{ readonly connections: readonly FileConnection[]; readonly skipped: number } | FileProblem> {
  const connections: FileConnection[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const connection = await compassConnection(entry, decrypt);
    if (isFileProblem(connection)) {
      return connection;
    }
    if (connection === undefined) {
      skipped += 1;
    } else {
      connections.push(connection);
    }
  }
  return { connections, skipped };
}
