/**
 * What the cards of the connection area share: where the connections are in the app's state, the form as the window
 * sends it, what is known of the files the form names, and the connection a feature was started on.
 */
import type { ConnectionForm, ConnectionView, SshAuthentication } from '../../shared/connection';
import { connectionColors } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { AppStep, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection, type ConnectionsState } from '../../shared/state/connections';

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
  const color = connectionColors.find((each) => each === fields['color']) ?? '';
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

/** The fields of a JSON object; empty for any other value. */
export function jsonFields(value: Json | undefined): Readonly<Record<string, Json>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)
    : {};
}
