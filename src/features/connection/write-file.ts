/**
 * Feature: connection.write-file — the text of an exported file: Datardo's format, Compass's, or a list of connection
 * strings, with the secrets removed, included as they are, or encrypted with a passphrase.
 */
import type { Json } from '../../shared/engine-request';
import { compassColor } from './color-from-compass';
import { encryptSecrets, type FileCrypto } from './encryption';
import { decoded, withoutSecrets, type StringSecrets } from './string-secrets';
import { fileText } from './text';
import { tlsIntoUri } from './tls-in-uri';
import type { FileConnection, FileProblem } from './types';
import { fileProblem } from './types';

/** The formats an export writes. */
export type ExportFormat = 'datardo' | 'compass' | 'list';

/** What happens to the secrets: dropped, written as they are, or encrypted with a passphrase. */
export type ExportSecrets = 'remove' | 'include' | 'encrypt';

/** The text of the file, ending with a new line, and what the format left out. */
export interface ExportedText {
  readonly text: string;
  readonly notes: readonly string[];
}

type Entry = Record<string, Json>;

/** The secrets of one entry as the files name them; only those with a value. */
type Secrets = Record<string, string>;

function stringSecretsOf(found: StringSecrets): Secrets {
  const option = (name: string): string | undefined => {
    const value = found.options[name];
    return value === undefined || value === '' ? undefined : decoded(value);
  };
  const named: Record<string, string | undefined> = {
    password: found.password,
    tlsCertificateKeyFilePassword: option('tlsCertificateKeyFilePassword'),
    proxyPassword: option('proxyPassword'),
    awsSessionToken: option('AWS_SESSION_TOKEN'),
  };
  return Object.fromEntries(
    Object.entries(named).filter((each): each is [string, string] => each[1] !== undefined && each[1] !== ''),
  );
}

function withValue(secrets: Secrets, name: string, value: string | undefined): Secrets {
  return value === undefined || value === '' ? secrets : { ...secrets, [name]: value };
}

/** The maps of colors of an entry, as `tree.color-of` keeps them: `collectionColors` on a MongoDB entry only. */
function colorMapsOf(connection: FileConnection): Entry {
  const { databaseColors, collectionColors } = connection;
  return {
    ...(databaseColors === undefined ? {} : { databaseColors }),
    ...(collectionColors === undefined || connection.engine !== 'mongodb' ? {} : { collectionColors }),
  };
}

/** Whether a connection has colors of its databases or collections. */
function hasColorMaps(connection: FileConnection): boolean {
  return connection.databaseColors !== undefined || connection.collectionColors !== undefined;
}

function datardoEntry(connection: FileConnection, secrets: ExportSecrets): { entry: Entry; secrets: Secrets } {
  const removed = withoutSecrets(connection.connectionString, 'removed');
  const { certificateKeyFilePassword: keyPassword, ...tls } = connection.tls ?? {};
  const { password: sshPassword, passphrase, ...ssh } = connection.ssh ?? { host: '', username: '', auth: 'password' };
  let found = withValue(stringSecretsOf(removed.secrets), 'tlsCertificateKeyFilePassword', keyPassword);
  found = withValue(withValue(found, 'sshPassword', sshPassword), 'sshPassphrase', passphrase);
  const include = secrets === 'include';
  const entry: Entry = {
    id: connection.id ?? '',
    name: connection.name,
    engine: connection.engine,
    uri: include ? connection.connectionString : removed.connectionString,
    ...(connection.folder === undefined ? {} : { folder: connection.folder }),
    ...(connection.color === undefined ? {} : { color: connection.color }),
    ...colorMapsOf(connection),
    ...(connection.readOnly === true ? { readOnly: true } : {}),
    ...(connection.noHistory === true ? { noHistory: true } : {}),
    ...(connection.queriesFolder === undefined ? {} : { queriesFolder: connection.queriesFolder }),
    ...(connection.tls === undefined || Object.keys(connection.tls).length === 0
      ? {}
      : { tls: include && keyPassword !== undefined ? { ...tls, certificateKeyFilePassword: keyPassword } : tls }),
    ...(connection.ssh === undefined
      ? {}
      : {
          ssh: {
            ...ssh,
            ...(include && sshPassword !== undefined && sshPassword !== '' ? { password: sshPassword } : {}),
            ...(include && passphrase !== undefined ? { passphrase } : {}),
          },
        }),
    ...(connection.oplog?.connection === undefined
      ? {}
      : { redisOplog: { connection: connection.oplog.connection, ...connection.oplog.settings } }),
  };
  return { entry, secrets: found };
}

function compassTunnel(connection: FileConnection, include: boolean): Entry | undefined {
  const ssh = connection.ssh;
  if (ssh === undefined) {
    return undefined;
  }
  return {
    host: ssh.host,
    port: ssh.port ?? 22,
    username: ssh.username,
    ...(ssh.auth === 'privateKey' && ssh.privateKeyFile !== undefined ? { identityKeyFile: ssh.privateKeyFile } : {}),
    ...(include && ssh.auth === 'password' && (ssh.password ?? '') !== '' ? { password: ssh.password ?? '' } : {}),
    ...(include && ssh.auth === 'privateKey' && ssh.passphrase !== undefined
      ? { identityKeyPassphrase: ssh.passphrase }
      : {}),
  };
}

/** A new random id, as Compass gives each connection: a version 4 UUID from the random bytes given. */
function randomId(crypto: FileCrypto): string {
  const bytes = crypto.random(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function compassEntry(
  connection: FileConnection,
  secrets: ExportSecrets,
  crypto: FileCrypto,
): { entry: Entry; secrets: Secrets } {
  const full = tlsIntoUri(connection.connectionString, connection.tls, 'with-secrets');
  const removed = withoutSecrets(full, 'removed');
  const ssh = connection.ssh;
  let found = stringSecretsOf(removed.secrets);
  found = withValue(found, 'sshTunnelPassword', ssh?.auth === 'password' ? ssh.password : undefined);
  found = withValue(found, 'sshTunnelPassphrase', ssh?.auth === 'privateKey' ? ssh.passphrase : undefined);
  const tunnel = compassTunnel(connection, secrets === 'include');
  const entry: Entry = {
    id: randomId(crypto),
    favorite: {
      name: connection.name,
      ...(connection.color === undefined ? {} : { color: compassColor(connection.color) }),
    },
    savedConnectionType: 'favorite',
    connectionOptions: {
      connectionString: secrets === 'include' ? full : removed.connectionString,
      ...(tunnel === undefined ? {} : { sshTunnel: tunnel }),
    },
  };
  return { entry, secrets: found };
}

/** Feature: connection.write-file — what the format leaves out of these connections, as the notes say it. */
export function exportNotes(connections: readonly FileConnection[], format: ExportFormat): readonly string[] {
  const count = (test: (connection: FileConnection) => boolean): number => connections.filter(test).length;
  if (format === 'datardo') {
    return [];
  }
  if (format === 'compass') {
    const mongo = connections.filter((each) => each.engine === 'mongodb');
    const redis = connections.length - mongo.length;
    return [
      ...(mongo.some((each) => each.ssh?.auth === 'agent') ? [fileText.agent] : []),
      ...(mongo.some((each) => each.folder !== undefined || each.readOnly === true || each.oplog !== undefined)
        ? [fileText.compassLeftOut]
        : []),
      ...(mongo.some(hasColorMaps) ? [fileText.colorsLeftOut] : []),
      ...(redis > 0 ? [fileText.redisLeftOut(redis)] : []),
    ];
  }
  const ssh = count((each) => each.ssh !== undefined);
  const files = count(
    (each) => each.engine === 'redis' && (each.tls?.caFile !== undefined || each.tls?.certificateKeyFile !== undefined),
  );
  return [
    ...(ssh > 0 ? [fileText.sshLeftOut(ssh)] : []),
    ...(connections.some(
      (each) =>
        each.folder !== undefined ||
        each.color !== undefined ||
        hasColorMaps(each) ||
        each.readOnly === true ||
        each.oplog !== undefined,
    )
      ? [fileText.listLeftOut]
      : []),
    ...(files > 0 ? [fileText.redisFilesLeftOut(files)] : []),
  ];
}

function listLine(connection: FileConnection, secrets: ExportSecrets): string {
  const name = connection.name.replace(/[\r\n=]+/g, ' ').trim();
  const written =
    connection.engine === 'mongodb'
      ? tlsIntoUri(
          connection.connectionString,
          connection.tls,
          secrets === 'include' ? 'with-secrets' : 'without-secrets',
        )
      : connection.connectionString;
  const uri = secrets === 'remove' ? withoutSecrets(written, 'removed').connectionString : written;
  return `${name} = ${uri}`;
}

async function withEncrypted(
  built: readonly { entry: Entry; secrets: Secrets }[],
  name: string,
  passphrase: string,
  crypto: FileCrypto,
): Promise<readonly Entry[]> {
  const holding = built.filter((each) => Object.keys(each.secrets).length > 0);
  const texts = await encryptSecrets(
    holding.map((each) => JSON.stringify({ secrets: each.secrets })),
    passphrase,
    crypto,
  );
  return built.map((each) => {
    const at = holding.indexOf(each);
    return at < 0 ? each.entry : { ...each.entry, [name]: texts[at] ?? '' };
  });
}

function json(value: Json): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** What the export is asked to write: the format, the mode of the secrets and the passphrase. */
export interface ExportOptions {
  readonly format: ExportFormat;
  readonly secrets: ExportSecrets;
  readonly passphrase?: string;
}

/**
 * Feature: connection.write-file — the text of the file and the notes on what the format left out, or why it cannot
 * be written. The randomness of the encryption and of Compass's ids comes from `crypto`.
 */
export async function connectionsToText(
  connections: readonly FileConnection[],
  options: ExportOptions,
  crypto: FileCrypto,
): Promise<ExportedText | FileProblem> {
  const { format, secrets, passphrase = '' } = options;
  if (secrets === 'encrypt' && passphrase === '') {
    return fileProblem(fileText.needPassphrase);
  }
  if (format === 'list') {
    if (secrets === 'encrypt') {
      return fileProblem(fileText.listCannotEncrypt);
    }
    const header = `${fileText.listHeader}${secrets === 'remove' ? fileText.withoutPasswords : ''}`;
    const lines = [header, ...connections.map((each) => listLine(each, secrets))];
    return { text: `${lines.join('\n')}\n`, notes: exportNotes(connections, format) };
  }
  const built =
    format === 'datardo'
      ? connections.map((each) => datardoEntry(each, secrets))
      : connections.filter((each) => each.engine === 'mongodb').map((each) => compassEntry(each, secrets, crypto));
  const name = format === 'datardo' ? 'secrets' : 'connectionSecrets';
  const entries =
    secrets === 'encrypt' ? await withEncrypted(built, name, passphrase, crypto) : built.map((each) => each.entry);
  const text =
    format === 'datardo'
      ? json({
          type: 'Datardo Connections',
          version: 1,
          secrets: secrets === 'include' ? 'included' : secrets === 'encrypt' ? 'encrypted' : 'removed',
          connections: [...entries],
        })
      : json({ type: 'Compass Connections', version: 1, connections: [...entries] });
  return { text, notes: exportNotes(connections, format) };
}
