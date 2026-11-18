/**
 * The actions of the connection area the runner carries out for app steps and app reads: the saved connections and
 * their secrets (`connection.*`, `secrets.*`), and the clients of the engines (`engine.*`). Secrets are read and
 * written here and in `src/main/connections.ts` only, and never go back to the window (R14.3).
 */
import { dialog, type OpenDialogOptions } from 'electron';
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import type { ConnectionDraft, ConnectionForm, SavedConnection, ServerInfo, TryReply } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import type { ClientSettings, EngineClient } from '../../engines';
import { writeLog } from '../../runner/log';
import { notify } from '../../runner/notify';
import { overviewShows } from '../../features/connection/overview';
import { certificateFilters, chooseButton } from '../../features/connection/form';
import { connectionFromForm, type FormResult } from '../../features/connection/read-form';
import { parse as parseServerInfo, serverInfoRequests } from '../../features/connection/server-info';
import { mongoServerSelectionMs, redisConnectMs, serverRefusal } from '../../features/connection/connect';
import { pingRequest } from '../../features/connection/state';
import { testTimeLimitMs } from '../../features/connection/test';
import { connectText } from '../../features/connection/text';
import { tlsFromUri } from '../../features/connection/tls-in-uri';
import { connectionsOf, formFromJson, jsonFields, type FileFacts } from '../../features/connection/types';
import {
  clientSettings,
  connectionEngines,
  deleteSecrets,
  dispatchConnections,
  draftSettings,
  findConnection,
  savedConnections,
  viewOf,
  writeConnection,
  writeConnections,
  writeSecrets,
} from '../connections';
import type { MainServices } from '../services';
import { closeTab, openTab } from './tab';

/** An error with the refusal code the runner shows with it. */
function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

function idOf(args: Json): ConnectionId {
  const value = jsonFields(args)['connection'];
  if (typeof value !== 'string' || value === '') {
    throw new Error('The action needs the id of a connection.');
  }
  return connectionId(value);
}

function needConnection(id: ConnectionId): SavedConnection {
  const connection = findConnection(id);
  if (connection === undefined) {
    throw new Error(`No connection is saved with the id ${id}.`);
  }
  return connection;
}

function formOf(args: Json): ConnectionForm {
  const form = formFromJson(jsonFields(args)['form']);
  if (form === undefined) {
    throw new Error('The action needs the fields of the connection form.');
  }
  return form;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    // Not there, or not readable: the form says the file is missing.
    return false;
  }
}

/** The files the form names that are not there: what `connection.read-form` refuses. */
async function fileFacts(form: ConnectionForm): Promise<FileFacts> {
  const inUri = form.engine === 'mongodb' ? tlsFromUri(form.connectionString).tls : undefined;
  const paths = [
    form.tls.caFile,
    form.tls.certificateKeyFile,
    form.ssh.privateKeyFile,
    form.queriesFolder,
    inUri?.caFile ?? '',
    inUri?.certificateKeyFile ?? '',
  ].map((each) => each.trim());
  const named = [...new Set(paths.filter((each) => each !== ''))];
  const missing = await Promise.all(named.map(async (path) => ((await exists(path)) ? [] : [path])));
  return { missing: missing.flat() };
}

/** The form read with what is known of its files (`connection.read-form`). */
async function readForm(form: ConnectionForm, id: ConnectionId | undefined): Promise<FormResult> {
  const saved = id === undefined ? undefined : findConnection(id);
  return connectionFromForm(form, saved === undefined ? undefined : viewOf(saved), await fileFacts(form));
}

/** The form read with what is known of its files; throws the refusal of `connection.read-form`. */
async function draftOf(form: ConnectionForm, id: ConnectionId | undefined): Promise<ConnectionDraft> {
  const read = await readForm(form, id);
  if (read.kind === 'refused') {
    throw coded(read.message, read.code);
  }
  return read.draft;
}

function savedFrom(id: ConnectionId, draft: ConnectionDraft, before: SavedConnection | undefined): SavedConnection {
  return {
    id,
    name: draft.name,
    engine: draft.engine,
    hosts: draft.hosts,
    readOnly: draft.readOnly,
    keepsUndo: before?.keepsUndo ?? true,
    ...(draft.folder === undefined ? {} : { folder: draft.folder }),
    ...(draft.color === undefined ? {} : { color: draft.color }),
    ...(draft.tls === undefined ? {} : { tls: draft.tls }),
    ...(draft.ssh === undefined ? {} : { ssh: draft.ssh }),
    ...(draft.queriesFolder === undefined ? {} : { queriesFolder: draft.queriesFolder }),
    ...(draft.publishesTo === undefined ? {} : { publishesTo: draft.publishesTo }),
    ...((draft.oplog ?? before?.oplog) === undefined ? {} : { oplog: draft.oplog ?? before?.oplog ?? null }),
  };
}

/** `connection.write` `{ connection, isNew, form }`: the connection and its secrets, from the form. */
const write: AppAction = async (args) => {
  const id = idOf(args);
  const before = findConnection(id);
  if (jsonFields(args)['isNew'] === true && before !== undefined) {
    throw new Error(`A connection is already saved with the id ${id}.`);
  }
  const draft = await draftOf(formOf(args), before === undefined ? undefined : id);
  writeSecrets(id, draft);
  writeConnection(savedFrom(id, draft, before));
};

/** `secrets.write` `{ connection, form }`: the secrets the form says, the empty fields keeping the saved ones. */
const writeTheSecrets: AppAction = async (args) => {
  const id = idOf(args);
  needConnection(id);
  writeSecrets(id, await draftOf(formOf(args), id));
  dispatchConnections({ slice: 'connections', type: 'saved', connection: viewOf(needConnection(id)) });
};

/** `secrets.delete` `{ connection }`. */
const deleteTheSecrets: AppAction = (args) => {
  deleteSecrets(idOf(args));
  return Promise.resolve();
};

/**
 * `connection.delete` `{ connection }`: the connection leaves the saved ones, and its form closes with its other tabs
 * (`tab.connection-gone` closes those that show something of it).
 */
function remove(services: MainServices): AppAction {
  return async (args) => {
    const id = idOf(args);
    await connectionEngines().disconnect(id);
    writeConnections(savedConnections().filter((each) => each.id !== id));
    for (const tab of services.state.get().tabs.tabs) {
      if (tab.shows.kind === 'app' && tab.shows.edits === id) {
        closeTab(services, tab, 'forget');
      }
    }
    dispatchConnections({ slice: 'connections', type: 'removed', connection: id });
  };
}

/** `connection.overview` `{ connection }`: opens the Overview tab of the connection, or makes it active. */
function openOverview(services: MainServices): AppAction {
  return (args) => {
    const id = idOf(args);
    needConnection(id);
    openTab(services, { shows: overviewShows(id) }, { background: false, visiting: 'visit' });
    return Promise.resolve();
  };
}

/** `connection.choose-file` `{ title, files }`: the system's file dialog of **Browse…**; the path, or null. */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const fields = jsonFields(args);
    const title = typeof fields['title'] === 'string' ? fields['title'] : '';
    const folder = fields['kind'] === 'folder';
    const options: OpenDialogOptions = {
      title,
      buttonLabel: chooseButton,
      properties: [folder ? 'openDirectory' : 'openFile'],
      ...(fields['kind'] === 'certificate' ? { filters: certificateFilters } : {}),
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
  };
}

/** `connection.set-read-only` `{ connection, readOnly }`. */
const setReadOnly: AppAction = (args) => {
  const connection = needConnection(idOf(args));
  writeConnection({ ...connection, readOnly: jsonFields(args)['readOnly'] === true });
  return Promise.resolve();
};

/** `connection.unlink` `{ connection }`: the MongoDB connection no longer publishes; what it publishes is kept. */
const unlink: AppAction = (args) => {
  const { publishesTo: _gone, ...connection } = needConnection(idOf(args));
  writeConnection(connection);
  return Promise.resolve();
};

/** `connection.forget-state` `{ connection }`: deletes `state/<id>.json` (data.md). */
function forgetState(services: MainServices): AppAction {
  return async (args) => {
    const id = idOf(args);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error(`The id ${id} cannot name a file.`);
    }
    await rm(join(services.dataFolder, 'state', `${id}.json`), { force: true });
  };
}

async function readServerInfo(
  client: Pick<EngineClient, 'send'>,
  engine: SavedConnection['engine'],
  hosts: string,
  signal: AbortSignal,
): Promise<{ readonly info: ServerInfo; readonly replies: readonly unknown[] }> {
  const replies: unknown[] = [];
  for (const request of serverInfoRequests(engine, 'connect')) {
    replies.push(await client.send(request, signal));
  }
  return { info: parseServerInfo(replies, { hosts }), replies };
}

function timeoutOf(connection: SavedConnection): number {
  return connection.engine === 'mongodb' ? mongoServerSelectionMs : redisConnectMs;
}

/**
 * A connect that failed is not kept (connection.connect): the state is **failed** with its reason, the Log writes the
 * refusal code when there is one, and a notification says **Could not connect to <name>: <reason>**. The plan does
 * not stop on it with a message of its own: this one is the card's.
 */
function failed(services: MainServices, connection: SavedConnection, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown }).code;
  dispatchConnections({ slice: 'connections', type: 'state', connection: connection.id, state: 'failed', reason });
  const ports = { state: services.state, now: () => Date.now() };
  if (typeof code === 'string' && code.startsWith('connection.connect/')) {
    writeLog(ports, [{ feature: 'connection.connect', kind: 'refusal', text: `refused: ${code} ${reason}` }]);
  }
  notify(ports, {
    feature: featureId('connection.connect'),
    level: 'error',
    text: connectText.couldNotConnect(connection.name, reason),
    connection: connection.id,
  });
}

/** Opens the client and reads what the server is; closes it again and throws when either fails. */
async function openAndRead(
  id: ConnectionId,
  connection: SavedConnection,
  settings: ClientSettings,
  signal: AbortSignal,
): Promise<ServerInfo> {
  const engines = connectionEngines();
  try {
    await engines.connect(id, settings, signal);
    const client = {
      send: (request: Parameters<EngineClient['send']>[0], each: AbortSignal) =>
        engines.send({ connection: id, request }, each),
    };
    const info = (await readServerInfo(client, connection.engine, connection.hosts, signal)).info;
    const refusal = serverRefusal(info);
    if (refusal !== undefined) {
      throw coded(refusal.message, refusal.code);
    }
    return info;
  } catch (error: unknown) {
    await engines.disconnect(id);
    throw error;
  }
}

/** `engine.connect` `{ connection }`: opens its client, learns what the server is, refuses what Datardo cannot serve. */
function connect(services: MainServices): AppAction {
  return async (args, signal) => {
    const id = idOf(args);
    const connection = needConnection(id);
    const settings = clientSettings(connection, timeoutOf(connection));
    if (settings === undefined) {
      const keychain = connectionsOf(services.state.get()).keychain;
      failed(
        services,
        connection,
        keychain
          ? coded(connectText.noConnectionString, 'connection.connect/no-connection-string')
          : coded(connectText.noSecrets(connection.name), 'connection.connect/no-secrets'),
      );
      return;
    }
    dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'connecting' });
    try {
      const info = await openAndRead(id, connection, settings, signal);
      dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'connected', server: info });
    } catch (error: unknown) {
      if (signal.aborted) {
        dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'not-connected' });
        throw error;
      }
      failed(services, connection, error);
    }
  };
}

/** `engine.disconnect` `{ connection }`. */
const disconnect: AppAction = async (args) => {
  const id = idOf(args);
  await connectionEngines().disconnect(id);
  dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'not-connected' });
};

async function withClient<T>(open: () => Promise<EngineClient>, use: (client: EngineClient) => Promise<T>): Promise<T> {
  const client = await open();
  try {
    return await use(client);
  } finally {
    await client.close();
  }
}

/** The linked Redis connection of a MongoDB form answers a ping, or why not. */
async function tryLinked(
  draft: ConnectionDraft,
  signal: AbortSignal,
): Promise<Extract<TryReply, { kind: 'answered' }>['linked']> {
  const linked = draft.publishesTo === undefined ? undefined : findConnection(draft.publishesTo);
  if (linked === undefined) {
    return undefined;
  }
  const settings = clientSettings(linked, testTimeLimitMs);
  if (settings === undefined) {
    return { host: linked.hosts, reason: connectText.noConnectionString };
  }
  try {
    await withClient(
      () => connectionEngines().open(settings, signal),
      (client) => client.send(pingRequest('redis'), signal),
    );
    return { host: linked.hosts };
  } catch (error: unknown) {
    return { host: linked.hosts, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** `engine.try` `{ form, connection }`: opens a client from the form, reads what the server is, closes it. */
const tryForm: AppAction = async (args, signal): Promise<TryReply> => {
  const form = formOf(args);
  const given = jsonFields(args)['connection'];
  const id = typeof given === 'string' && given !== '' ? connectionId(given) : undefined;
  const read = await readForm(form, id);
  if (read.kind === 'refused') {
    return { kind: 'refused', code: read.code, message: read.message, field: read.field };
  }
  const draft = read.draft;
  const settings = draftSettings(id, draft, testTimeLimitMs);
  try {
    const { replies } = await withClient(
      () => connectionEngines().open(settings, signal),
      (client) => readServerInfo(client, draft.engine, draft.hosts, signal),
    );
    const linked = draft.engine === 'mongodb' ? await tryLinked(draft, signal) : undefined;
    return {
      kind: 'answered',
      engine: draft.engine,
      host: draft.hosts,
      replies,
      ...(draft.ssh === undefined ? {} : { through: `${draft.ssh.username}@${draft.ssh.host}` }),
      ...(linked === undefined ? {} : { linked }),
    };
  } catch (error: unknown) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
};

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'connection.write': write,
  'connection.delete': remove(services),
  'connection.overview': openOverview(services),
  'connection.choose-file': chooseFile(services),
  'connection.set-read-only': setReadOnly,
  'connection.unlink': unlink,
  'connection.forget-state': forgetState(services),
  'secrets.write': writeTheSecrets,
  'secrets.delete': deleteTheSecrets,
  'engine.connect': connect(services),
  'engine.disconnect': disconnect,
  'engine.try': tryForm,
});
