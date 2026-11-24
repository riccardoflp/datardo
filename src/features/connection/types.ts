/**
 * What the cards of the connection area share: where the connections are in the app's state, the form as the window
 * sends it, what is known of the files the form names, and the connection a feature was started on.
 */
import { colorOfText, type ColorMap } from '../../shared/color';
import type {
  ConnectionColor,
  ConnectionForm,
  ConnectionView,
  SavedConnection,
  SshAuthentication,
  SshSettings,
  TlsSettings,
} from '../../shared/connection';
import type { EngineName, Json } from '../../shared/engine-request';
import type { AppStep, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection, type ConnectionsState } from '../../shared/state/connections';
import { isRedisStringProblem, redisFromString } from './redis-string';
import { uriParts } from './string-secrets';

/** The connections part of the app's state. */
export function connectionsOf(state: AppState): ConnectionsState {
  return state.connections;
}

/** The saved connection a feature was started on, when it was started on one that exists. */
export function targetConnection(context: Context): ConnectionView | undefined {
  const target = context.target;
  if (target.kind === 'app' || target.kind === 'tab') {
    return undefined;
  }
  return savedConnection(connectionsOf(context.state), target.connection);
}

/** The connection a feature was started on or, from Go to, the current connection. */
export function targetOrCurrent(context: Context): ConnectionView | undefined {
  const current = context.state.nav.current;
  return targetConnection(context) ?? (current === undefined ? undefined : connectionById(context, current));
}

/** The folders in use, sorted by name. */
export function foldersInUse(state: AppState): readonly string[] {
  const folders = connectionsOf(state).saved.flatMap((each) => (each.folder === undefined ? [] : [each.folder]));
  return [...new Set(folders)].sort((a, b) => a.localeCompare(b));
}

/** `name (2)`, or `name (3)`… when it is taken: the name of a copy. */
export function numberedName(name: string, taken: ReadonlySet<string>): string {
  for (let number = 2; ; number += 1) {
    const candidate = `${name} (${String(number)})`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** A saved connection by its id, in the context's state. */
export function connectionById(context: Context, id: ConnectionId): ConnectionView | undefined {
  return savedConnection(connectionsOf(context.state), id);
}

/** What is known of the files the form names: those that do not exist. A file not listed is taken as there. */
export interface FileFacts {
  readonly missing: readonly string[];
}

/** No file known to be missing: what a pure plan knows before the main process looks. */
export const noFileMissing: FileFacts = { missing: [] };

type Fields = Readonly<Record<string, unknown>>;

function text(fields: Fields, name: string, fallback = ''): string {
  const value = fields[name];
  return typeof value === 'string' ? value : fallback;
}

function flag(fields: Fields, name: string): boolean {
  return fields[name] === true;
}

function section(fields: Fields, name: string): Fields {
  const value = fields[name];
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

const authentications: readonly SshAuthentication[] = ['password', 'private-key', 'agent'];

function sshOf(fields: Fields): ConnectionForm['ssh'] {
  const authentication = authentications.find((each) => each === fields['authentication']) ?? 'password';
  return {
    on: flag(fields, 'on'),
    host: text(fields, 'host'),
    port: text(fields, 'port', '22'),
    username: text(fields, 'username'),
    authentication,
    password: text(fields, 'password'),
    privateKeyFile: text(fields, 'privateKeyFile'),
    passphrase: text(fields, 'passphrase'),
  };
}

function tlsOf(fields: Fields): ConnectionForm['tls'] {
  return {
    on: flag(fields, 'on'),
    caFile: text(fields, 'caFile'),
    certificateKeyFile: text(fields, 'certificateKeyFile'),
    keyPassword: text(fields, 'keyPassword'),
    allowInvalidCertificates: flag(fields, 'allowInvalidCertificates'),
    allowInvalidHostnames: flag(fields, 'allowInvalidHostnames'),
  };
}

function oplogOf(fields: Fields): ConnectionForm['oplog'] {
  const settings = fields['settings'];
  return {
    on: flag(fields, 'on'),
    connection: text(fields, 'connection'),
    ...(settings === undefined ? {} : { settings: settings as Json }),
  };
}

/** The form from what the window sent, or undefined when it is not one; a field left out is empty. */
export function formFromJson(value: unknown): ConnectionForm | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const fields = value as Fields;
  const engine = fields['engine'];
  if (engine !== 'mongodb' && engine !== 'redis') {
    return undefined;
  }
  const color = colorOfText(fields['color']) ?? '';
  return {
    engine,
    name: text(fields, 'name'),
    connectionString: text(fields, 'connectionString'),
    password: text(fields, 'password'),
    redisMode: fields['redisMode'] === 'connection-string' ? 'connection-string' : 'fields',
    host: text(fields, 'host'),
    port: text(fields, 'port'),
    username: text(fields, 'username'),
    database: text(fields, 'database'),
    folder: text(fields, 'folder'),
    color,
    readOnly: flag(fields, 'readOnly'),
    queriesFolder: text(fields, 'queriesFolder'),
    tls: tlsOf(section(fields, 'tls')),
    ssh: sshOf(section(fields, 'ssh')),
    oplog: oplogOf(section(fields, 'oplog')),
  };
}

/** The arguments a feature was started with, as an object; empty when there are none. */
export function argumentsOf(answers: Readonly<Record<string, unknown>>): Fields {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

/** An app step: the action the main process carries out, its arguments, and its text as the Log writes it. */
export function appStep(action: string, args: Json, text: string): AppStep {
  return { kind: 'app', action, args, text };
}

/** A plan with nothing to do: the connection is already as the feature would leave it. */
export function nothingToDo(title: string, cannot: string): Outcome {
  return run({ title, steps: [], danger: noDanger, undo: { cannot }, publishes: false, after: [] });
}

/** The SSH tunnel of a connection in a file, as the files write it: port 22 left out, the secrets included. */
export interface FileSsh {
  readonly host: string;
  readonly port?: number;
  readonly username: string;
  readonly auth: 'password' | 'privateKey' | 'agent';
  readonly password?: string;
  readonly privateKeyFile?: string;
  readonly passphrase?: string;
}

/** The TLS settings of a connection in a file, the key password included. */
export type FileTls = TlsSettings & { readonly certificateKeyFilePassword?: string };

/** The redis-oplog link of a MongoDB connection in a file: the Redis entry of the file, or Mongoster's address. */
export interface FileOplog {
  /** Datardo's files: the `id` of a Redis entry of the same file. */
  readonly connection?: string;
  /** Mongoster's files: the Redis connection string, with its password when the file has it. */
  readonly url?: string;
  /** What `oplog.publish` keeps: `prefix`, `namespaces`, `scope`. */
  readonly settings: Readonly<Record<string, Json>>;
}

/** The formats of a file of connections. */
export type FileFormat = 'compass' | 'datardo' | 'mongoster' | 'list';

/** A connection as a file holds it, its secrets in place (connection.read-file, connection.write-file). */
export interface FileConnection {
  /** Its id in a Datardo file, which a redis-oplog link names. */
  readonly id?: string;
  readonly name: string;
  readonly engine: EngineName;
  /** The connection string, with the secrets the file gave. */
  readonly connectionString: string;
  readonly folder?: string;
  readonly color?: ConnectionColor;
  /** The own colors of its databases and, on a MongoDB connection, of its collections (`tree.color-of`). */
  readonly databaseColors?: ColorMap;
  readonly collectionColors?: ColorMap;
  readonly readOnly?: boolean;
  readonly noHistory?: boolean;
  readonly queriesFolder?: string;
  readonly tls?: FileTls;
  readonly ssh?: FileSsh;
  readonly oplog?: FileOplog;
  /** What the import says about it: **no password**, **passwords not imported (encrypted)**… */
  readonly notes: readonly string[];
}

/** The connections of a file, and how many of its entries were not one. */
export interface FileConnections {
  readonly format: FileFormat;
  readonly connections: readonly FileConnection[];
  readonly skipped: number;
}

/** A file that cannot be read, and why; a wrong passphrase is told apart, so that it can be asked again. */
export interface FileProblem {
  readonly kind: 'problem';
  readonly problem: string;
  readonly wrongPassphrase?: boolean;
}

/** Whether reading or writing a file failed. */
export function isFileProblem(value: unknown): value is FileProblem {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'problem';
}

/** A file problem with its message. */
export function fileProblem(problem: string, wrongPassphrase = false): FileProblem {
  return { kind: 'problem', problem, ...(wrongPassphrase ? { wrongPassphrase } : {}) };
}

/** A value read from a file, as an object; undefined when it is not one. */
export function objectOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

/** A value read from a file, as a string that is not empty; undefined otherwise. */
export function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The fields of a JSON object; empty for any other value. */
export function jsonFields(value: Json | undefined): Readonly<Record<string, Json>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)
    : {};
}

/** The secrets of a connection that are not in its connection string, as the secret storage keeps them. */
export interface OptionSecrets {
  readonly keyPassword?: string;
  readonly sshPassword?: string;
  readonly passphrase?: string;
}

/** What a connection is saved as: its settings, its connection string with its secrets, and its other secrets. */
export interface ConnectionToSave {
  readonly saved: SavedConnection;
  readonly connectionString: string;
  readonly secrets: OptionSecrets;
}

/** The hosts of a connection string as a saved connection shows them: `db1:27017,db2`, `cache:6379`. */
export function hostsOf(engine: EngineName, connectionString: string): string {
  if (engine === 'mongodb') {
    return uriParts(connectionString)?.hosts ?? '';
  }
  const fields = redisFromString(connectionString);
  return isRedisStringProblem(fields) ? '' : `${fields.host}:${String(fields.port)}`;
}

const fileAuth = { password: 'password', 'private-key': 'privateKey', agent: 'agent' } as const;

function sshOfFile(ssh: FileSsh): SshSettings {
  const authentication = ssh.auth === 'privateKey' ? 'private-key' : ssh.auth;
  return {
    host: ssh.host,
    port: ssh.port ?? 22,
    username: ssh.username,
    authentication,
    ...(authentication === 'private-key' && ssh.privateKeyFile !== undefined
      ? { privateKeyFile: ssh.privateKeyFile }
      : {}),
  };
}

function withValue<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return (value === undefined || value === '' ? {} : { [key]: value }) as { [P in K]?: string };
}

/**
 * A connection of a file as Datardo saves it, with the id, the name and the folder it is given; what it replaces keeps
 * its read-only (D14), its undo setting and its link when the file has none, and the colors of its databases and of
 * its collections, each when the file has none.
 */
export function connectionOfFile(
  file: FileConnection,
  given: { readonly id: ConnectionId; readonly name: string; readonly folder: string | undefined },
  before: SavedConnection | undefined,
): ConnectionToSave {
  const { certificateKeyFilePassword: keyPassword, ...tls } = file.tls ?? {};
  const oplog = file.oplog === undefined ? before?.oplog : (file.oplog.settings as Json);
  const databaseColors = file.databaseColors ?? before?.databaseColors;
  const collectionColors = file.collectionColors ?? before?.collectionColors;
  const saved: SavedConnection = {
    id: given.id,
    name: given.name,
    engine: file.engine,
    hosts: hostsOf(file.engine, file.connectionString),
    readOnly: before?.readOnly === true || file.readOnly === true,
    keepsUndo: file.noHistory === true ? false : (before?.keepsUndo ?? true),
    ...(given.folder === undefined ? {} : { folder: given.folder }),
    ...(file.color === undefined ? {} : { color: file.color }),
    ...(databaseColors === undefined ? {} : { databaseColors }),
    ...(collectionColors === undefined ? {} : { collectionColors }),
    ...(file.tls === undefined ? {} : { tls }),
    ...(file.ssh === undefined ? {} : { ssh: sshOfFile(file.ssh) }),
    ...(file.queriesFolder === undefined ? {} : { queriesFolder: file.queriesFolder }),
    ...(before?.publishesTo === undefined ? {} : { publishesTo: before.publishesTo }),
    ...(oplog === undefined ? {} : { oplog }),
  };
  const secrets: OptionSecrets = {
    ...withValue('keyPassword', keyPassword),
    ...withValue('sshPassword', file.ssh?.password),
    ...withValue('passphrase', file.ssh?.passphrase),
  };
  return { saved, connectionString: file.connectionString, secrets };
}

/** A saved connection as a file writes it, with its connection string and its secrets when they are given. */
export function fileOfConnection(
  saved: SavedConnection,
  connectionString: string,
  secrets: OptionSecrets,
): FileConnection {
  const ssh = saved.ssh;
  const settings = jsonFields(saved.oplog);
  return {
    id: saved.id,
    name: saved.name,
    engine: saved.engine,
    connectionString,
    ...(saved.folder === undefined ? {} : { folder: saved.folder }),
    ...(saved.color === undefined ? {} : { color: saved.color }),
    ...(saved.databaseColors === undefined ? {} : { databaseColors: saved.databaseColors }),
    ...(saved.collectionColors === undefined ? {} : { collectionColors: saved.collectionColors }),
    ...(saved.readOnly ? { readOnly: true } : {}),
    ...(saved.keepsUndo ? {} : { noHistory: true }),
    ...(saved.queriesFolder === undefined ? {} : { queriesFolder: saved.queriesFolder }),
    ...(saved.tls === undefined
      ? {}
      : { tls: { ...saved.tls, ...withValue('certificateKeyFilePassword', secrets.keyPassword) } }),
    ...(ssh === undefined
      ? {}
      : {
          ssh: {
            host: ssh.host,
            ...(ssh.port === 22 ? {} : { port: ssh.port }),
            username: ssh.username,
            auth: fileAuth[ssh.authentication],
            ...(ssh.authentication === 'password' ? { password: secrets.sshPassword ?? '' } : {}),
            ...(ssh.authentication === 'private-key' && ssh.privateKeyFile !== undefined
              ? { privateKeyFile: ssh.privateKeyFile }
              : {}),
            ...(ssh.authentication === 'private-key' ? withValue('passphrase', secrets.passphrase) : {}),
          },
        }),
    ...(saved.engine === 'mongodb' && saved.publishesTo !== undefined
      ? { oplog: { connection: saved.publishesTo, settings } }
      : {}),
    notes: [],
  };
}
