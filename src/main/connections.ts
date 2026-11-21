/**
 * The connections in the main process: `connections.json` and the secret storage loaded at start into the app's
 * state, the one client of each connected connection, and reconnecting after a drop (connection.reconnect). Secrets
 * are read here and given to the engines only; the state gets which secrets are saved, never their values (R14.3).
 */
import { basename } from 'node:path';
import type {
  ConnectionDraft,
  ConnectionView,
  SavedConnection,
  SecretChange,
  SecretsSaved,
} from '../shared/connection';
import type { ConnectionId } from '../shared/ids';
import { connectionState, type ConnectionsEvent } from '../shared/state/connections';
import { appTarget } from '../shared/target';
import { featureId } from '../shared/ids';
import { createEngines, type ClientSettings, type EngineService } from '../engines';
import { connectionsFile, withConnections, type ConnectionsFile } from '../storage/connections';
import { SecretStorage } from '../storage/secrets';
import { Store, type Found } from '../storage/store';
import { secretKeys } from '../features/connection/secrets';
import { withSecrets, withoutSecrets, type StringSecrets } from '../features/connection/string-secrets';
import { setOptions } from '../features/connection/tls-in-uri';
import { isTunnelProblem, throughTunnel, tunnelTarget } from '../features/connection/ssh-tunnel-target';
import type { OptionSecrets as FileOptionSecrets } from '../features/connection/types';
import type { StartedBy } from '../shared/feature';
import { hostKeyCheck } from './known-hosts';
import { nextAttempt } from '../features/connection/reconnect';
import { connectionsOf } from '../features/connection/types';
import { redisConnectMs } from '../features/connection/connect';
import { writeLog } from '../runner/log';
import { notify } from '../runner/notify';
import { connectText } from '../features/connection/text';
import { consoleOwner } from '../features/console/types';
import { pubsubOwner } from '../features/pubsub/types';
import { text as navText } from '../features/nav/text';
import type { AreaStart } from './areas';
import type { MainServices } from './services';
import { safeStorageCipher } from './secrets';

/** The secrets of a connection that are not in its connection string, as `connection/<id>/options` keeps them. */
interface OptionSecrets {
  readonly keyPassword?: string;
  readonly sshPassword?: string;
  readonly passphrase?: string;
}

interface Registry {
  readonly services: MainServices;
  readonly store: Store<ConnectionsFile>;
  readonly secrets: SecretStorage;
}

let registry: Registry | undefined;
let engines: EngineService | undefined;

/** The engines of every connection: one service for the runner and for the actions of this area. */
export function connectionEngines(): EngineService {
  engines ??= createEngines();
  return engines;
}

function need(): Registry {
  if (registry === undefined) {
    throw new Error('The connections are not loaded yet.');
  }
  return registry;
}

/** Changes the connections part of the app's state. */
export function dispatchConnections(event: ConnectionsEvent): void {
  need().services.state.dispatch(event);
}

function optionSecrets(id: ConnectionId): OptionSecrets {
  const text = need().secrets.get(secretKeys(id).options);
  if (text === undefined) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    // Not what Datardo writes: read as no secret.
    return {};
  }
}

/** The connection string of a connection with its secrets, when the secret storage has it. */
export function fullConnectionString(id: ConnectionId): string | undefined {
  return need().secrets.get(secretKeys(id).string);
}

function secretsSaved(id: ConnectionId): SecretsSaved {
  const full = fullConnectionString(id);
  const secrets: StringSecrets = full === undefined ? { options: {} } : withoutSecrets(full, 'shown').secrets;
  const options = optionSecrets(id);
  return {
    connectionString: full !== undefined,
    password: secrets.password !== undefined,
    secretOptions: Object.keys(secrets.options).filter((name) => secrets.options[name] !== ''),
    keyPassword: (options.keyPassword ?? '') !== '',
    sshPassword: (options.sshPassword ?? '') !== '',
    passphrase: (options.passphrase ?? '') !== '',
  };
}

/** A saved connection as the state shows it: its address without secrets, which secrets are saved. */
export function viewOf(connection: SavedConnection): ConnectionView {
  const full = fullConnectionString(connection.id);
  return {
    ...connection,
    ...(full === undefined ? {} : { address: withoutSecrets(full, 'shown').connectionString }),
    secrets: secretsSaved(connection.id),
  };
}

/** The saved connections. */
export function savedConnections(): readonly SavedConnection[] {
  return need().store.get().connections;
}

/** A saved connection by its id. */
export function findConnection(id: ConnectionId): SavedConnection | undefined {
  return savedConnections().find((each) => each.id === id);
}

/** The saved connection a client belongs to: the connection itself, or the one whose console it is. */
function ownerOf(id: ConnectionId): ConnectionId {
  return consoleOwner(id) ?? pubsubOwner(id) ?? id;
}

/** The name of a connection for the messages, the console's client named as its connection; its id when not saved. */
export function connectionName(id: ConnectionId): string {
  return registry === undefined ? id : (findConnection(ownerOf(id))?.name ?? id);
}

/** Whether a connection is read-only now (D14); the console's client is as read-only as its connection. */
export function isReadOnly(id: ConnectionId): boolean {
  return registry === undefined ? false : findConnection(ownerOf(id))?.readOnly === true;
}

/** Whether a connection has an open client. */
export function isConnected(id: ConnectionId): boolean {
  return connectionEngines().isConnected(id);
}

/** The button that tries again at once (connection.reconnect). */
const reconnectLabel = navText.connection.reconnect;

const newerFileText =
  'This data was written by a newer version of Datardo. Changes to the connections are not saved until Datardo is updated.';

/** Saves the connections, or throws when the file is of a newer version (R15.3). */
export function writeConnections(connections: readonly SavedConnection[]): void {
  const { store } = need();
  if (!store.set(withConnections(store.get(), connections))) {
    throw new Error(newerFileText);
  }
}

/** Saves one connection, new or changed, and shows it. */
export function writeConnection(connection: SavedConnection): void {
  const others = savedConnections();
  const known = others.some((each) => each.id === connection.id);
  writeConnections(
    known ? others.map((each) => (each.id === connection.id ? connection : each)) : [...others, connection],
  );
  dispatchConnections({ slice: 'connections', type: 'saved', connection: viewOf(connection) });
}

function changed(change: SecretChange, before: string | undefined): string | undefined {
  switch (change.kind) {
    case 'keep':
      return before;
    case 'replace':
      return change.value === '' ? undefined : change.value;
    case 'drop':
      return undefined;
  }
}

function stringWithSecrets(id: ConnectionId | undefined, draft: ConnectionDraft): string {
  const previous = id === undefined ? undefined : fullConnectionString(id);
  const before: StringSecrets = previous === undefined ? { options: {} } : withoutSecrets(previous, 'removed').secrets;
  const password = changed(draft.password, before.password);
  const kept = Object.entries(draft.secretOptions).map(
    ([name, change]) => [name, changed(change, before.options[name])] as const,
  );
  const options = Object.fromEntries(kept.filter((each): each is readonly [string, string] => each[1] !== undefined));
  const dropped = kept.filter(([name, value]) => value === undefined && name !== 'AWS_SESSION_TOKEN');
  const full = withSecrets(draft.address, { ...(password === undefined ? {} : { password }), options });
  return dropped.length === 0
    ? full
    : setOptions(
        full,
        dropped.map(([name]) => [name, undefined] as const),
      );
}

function optionsOfDraft(id: ConnectionId | undefined, draft: ConnectionDraft): OptionSecrets {
  const before = id === undefined ? {} : optionSecrets(id);
  return Object.fromEntries(
    (['keyPassword', 'sshPassword', 'passphrase'] as const).flatMap((name) => {
      const value = changed(draft[name], before[name]);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

/** Keeps the secrets the draft says, the kept ones as they were: `connection/<id>/string` and `/options`. */
export function writeSecrets(id: ConnectionId, draft: ConnectionDraft): void {
  const { secrets } = need();
  const keys = secretKeys(id);
  const options = optionsOfDraft(id, draft);
  const written =
    secrets.set(keys.string, stringWithSecrets(id, draft)) &&
    (Object.keys(options).length === 0
      ? secrets.delete(keys.options)
      : secrets.set(keys.options, JSON.stringify(options)));
  if (!written) {
    throw new Error(newerFileText.replace('the connections', 'the passwords'));
  }
}

/** A secret of Datardo's own that belongs to no connection (`mcp/token`), from the secret storage. */
export function appSecret(key: string): string | undefined {
  return need().secrets.get(key);
}

/** Keeps a secret of Datardo's own in the secret storage; false when it may not be written (a newer file). */
export function keepAppSecret(key: string, value: string): boolean {
  return need().secrets.set(key, value);
}

/** Deletes every secret of a connection. */
export function deleteSecrets(id: ConnectionId): void {
  const keys = secretKeys(id);
  need().secrets.delete(keys.string, keys.options);
}

type Reach = Pick<SavedConnection, 'engine' | 'tls' | 'ssh'>;

/** Where the tunnel of a connection leads, and the connection string through it (connection.ssh-tunnel-target). */
function throughOf(reach: Reach, connectionString: string, startedBy: StartedBy): Partial<ClientSettings> {
  if (reach.ssh === undefined) {
    return {};
  }
  const target = tunnelTarget(reach.engine, connectionString);
  return {
    through: isTunnelProblem(target)
      ? { target: { host: '', port: 0 }, connectionString: () => connectionString, problem: target.problem }
      : { target, connectionString: (localPort) => throughTunnel(reach.engine, connectionString, localPort) },
    hostKey: hostKeyCheck(startedBy),
  };
}

/** How a client is opened: the time to find the server, and who started it, which says whether a host key is asked. */
interface Opening {
  readonly connectTimeoutMs: number;
  readonly startedBy: StartedBy;
}

function settingsOf(reach: Reach, connectionString: string, secrets: OptionSecrets, opening: Opening): ClientSettings {
  const { keyPassword, sshPassword, passphrase } = secrets;
  const { connectTimeoutMs } = opening;
  const connection = reach;
  return {
    ...throughOf(reach, connectionString, opening.startedBy),
    engine: connection.engine,
    connectionString,
    connectTimeoutMs,
    ...(connection.tls === undefined
      ? {}
      : {
          tls: { ...connection.tls, ...(keyPassword === undefined ? {} : { certificateKeyFilePassword: keyPassword }) },
        }),
    ...(connection.ssh === undefined
      ? {}
      : {
          ssh: {
            ...connection.ssh,
            ...(sshPassword === undefined ? {} : { password: sshPassword }),
            ...(passphrase === undefined ? {} : { passphrase }),
          },
        }),
  };
}

/**
 * What a client of the connection is opened with, secrets included; `undefined` when its connection string is lost.
 * A host key that is not known is asked only when a person started it.
 */
export function clientSettings(
  connection: SavedConnection,
  connectTimeoutMs: number,
  startedBy: StartedBy = 'user',
): ClientSettings | undefined {
  const connectionString = fullConnectionString(connection.id);
  return connectionString === undefined
    ? undefined
    : settingsOf(connection, connectionString, optionSecrets(connection.id), { connectTimeoutMs, startedBy });
}

/** The secrets of a connection that are not in its connection string. */
export function savedOptionSecrets(id: ConnectionId): FileOptionSecrets {
  return optionSecrets(id);
}

/** Keeps a connection string and the other secrets of a connection as they are given (import, duplicate). */
export function writeGivenSecrets(id: ConnectionId, connectionString: string, options: FileOptionSecrets): void {
  const { secrets } = need();
  const keys = secretKeys(id);
  const kept = Object.fromEntries(Object.entries(options).filter((entry) => entry[1] !== undefined && entry[1] !== ''));
  const written =
    secrets.set(keys.string, connectionString) &&
    (Object.keys(kept).length === 0 ? secrets.delete(keys.options) : secrets.set(keys.options, JSON.stringify(kept)));
  if (!written) {
    throw new Error(newerFileText.replace('the connections', 'the passwords'));
  }
}

/** What a client is opened with to try a form: the draft, with the saved secrets where the form keeps them. */
export function draftSettings(
  id: ConnectionId | undefined,
  draft: ConnectionDraft,
  connectTimeoutMs: number,
): ClientSettings {
  return settingsOf(draft, stringWithSecrets(id, draft), optionsOfDraft(id, draft), {
    connectTimeoutMs,
    startedBy: 'user',
  });
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stateNow(id: ConnectionId): ReturnType<typeof connectionState> {
  return connectionState(connectionsOf(need().services.state.get()), id);
}

/** Whether an error ends the attempts at once: a wrong password, a refusal of connecting, a host key not trusted. */
export function endsTheAttempts(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 18 ||
    (typeof code === 'string' && code.startsWith('connection.connect/')) ||
    /^(WRONGPASS|NOAUTH|NOPERM)\b|Authentication failed|host key/iu.test(message)
  );
}

/** The attempts stopped: the state is **failed**, and a notification says so with **Reconnect**. */
function gaveUp(id: ConnectionId, reason: string): void {
  dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'failed', reason });
  const ports = { state: need().services.state, now: () => Date.now() };
  notify(ports, {
    feature: featureId('connection.reconnect'),
    level: 'error',
    text: connectText.lost(connectionName(id), reason),
    actions: [
      {
        label: reconnectLabel,
        element: 'connection.reconnect@notification',
        feature: featureId('connection.reconnect'),
        target: { kind: 'connection', connection: id },
      },
    ],
  });
}

/** Tries again after a drop, waiting longer each time, and gives up after 5 minutes (connection.reconnect). */
async function reconnect(id: ConnectionId, droppedAt: number, firstReason: string): Promise<void> {
  let reason = firstReason;
  for (let attempts = 0; ; attempts += 1) {
    const wait = nextAttempt(attempts, Date.now() - droppedAt);
    if (wait === 'give-up') {
      gaveUp(id, reason);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
    const connection = findConnection(id);
    if (connection === undefined || stateNow(id) !== 'reconnecting') {
      return;
    }
    // A reconnection asks nothing: a host key that changed meanwhile ends the attempts.
    const settings = clientSettings(connection, redisConnectMs, 'task');
    if (settings === undefined) {
      gaveUp(id, reason);
      return;
    }
    try {
      await connectionEngines().connect(id, settings, AbortSignal.timeout(redisConnectMs * 2));
      if (stateNow(id) !== 'reconnecting') {
        // Disconnected, or connected by the user, while this attempt ran: the client it opened is not the one kept.
        return;
      }
      dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'connected' });
      return;
    } catch (error: unknown) {
      reason = reasonOf(error);
      if (endsTheAttempts(error)) {
        gaveUp(id, reason);
        return;
      }
    }
  }
}

/**
 * The client of a connection was lost, or the ping of the current one had no answer (connection.state): the state is
 * **reconnecting…**, the drop is written once in the Log, and the attempts start (connection.reconnect).
 */
export function dropped(id: ConnectionId, reason: string): void {
  if (findConnection(id) === undefined || stateNow(id) === 'reconnecting') {
    return;
  }
  dispatchConnections({ slice: 'connections', type: 'state', connection: id, state: 'reconnecting', reason });
  writeLog({ state: need().services.state, now: () => Date.now() }, [
    { feature: 'connection.reconnect', kind: 'error', text: `lost ${connectionName(id)}: ${reason}`, connection: id },
  ]);
  void reconnect(id, Date.now(), reason);
}

function tellHowFound(services: MainServices, found: Found, holds: string): void {
  const ports = { state: services.state, now: () => Date.now() };
  if (found.kind === 'newer') {
    notify(ports, {
      feature: featureId('connection.save'),
      level: 'warning',
      text: `This data was written by a newer version of Datardo. Changes to ${holds} are not saved until Datardo is updated.`,
    });
  } else if (found.kind === 'damaged') {
    notify(ports, {
      feature: featureId('connection.save'),
      level: 'warning',
      text: `${holds.charAt(0).toUpperCase()}${holds.slice(1)} could not be read and was set aside as ${basename(found.setAsideAs)}.`,
      actions: [{ label: 'Open data folder', feature: featureId('window.open-data-folder'), target: appTarget }],
    });
  }
}

/** Loads the connections and the secret storage into the app's state; at quit, writes them and disconnects. */
export const start: AreaStart = async (services) => {
  const ports = { state: services.state, now: () => Date.now() };
  const writeError = (holds: string) => (error: unknown) => {
    notify(ports, {
      feature: featureId('connection.save'),
      level: 'error',
      text: `${holds} could not be saved: ${reasonOf(error)}`,
    });
  };
  const store = new Store(services.dataFolder, connectionsFile, writeError('The connections'));
  const secrets = new SecretStorage(services.dataFolder, safeStorageCipher, writeError('The passwords'));
  registry = { services, store, secrets };
  tellHowFound(services, await store.load(), 'the connections');
  tellHowFound(services, await secrets.load(), 'the passwords');
  dispatchConnections({
    slice: 'connections',
    type: 'loaded',
    saved: store.get().connections.map(viewOf),
    keychain: secrets.isSaved(),
    readOnlyFile: !store.isWritable(),
  });
  connectionEngines().onDrop(dropped);
  services.onQuit(async () => {
    await Promise.allSettled([store.flush(), secrets.flush(), connectionEngines().disconnectAll()]);
  });
};
