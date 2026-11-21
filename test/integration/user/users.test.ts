/**
 * The user area against a MongoDB of its own with access control enabled (M32): users created, their password changed
 * with their roles kept, roles granted and revoked, users deleted; custom roles created, edited and deleted; the Log
 * writing every password `***`; and the connection signed in as a user offered to keep its new password. The server is
 * started here with `--auth`, so that signing in is real; the users and roles live in databases of this test only and
 * are dropped at the end. The app action of **Save in the connection** is a stand-in that records what it was given:
 * the main process's own is tested with the secrets of the connections.
 */
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import { connectionStringWithPassword } from '../../../src/features/user/change-password';
import type { RolesRead } from '../../../src/features/user/list-roles';
import type { Role, SignedInUser, User } from '../../../src/features/user/types';
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Confirmation } from '../../../src/shared/state/runner';
import type { Target } from '../../../src/shared/target';

const shop = 'user_it_shop';
const crm = 'user_it_crm';
const local = connectionId('c-user-root');
const asOwner = connectionId('c-user-owner');
/** The passwords of this test's throwaway server and users, never those of anything else. */
const rootPassword = `root-${randomBytes(6).toString('hex')}`;
const first = `First-${randomBytes(6).toString('hex')}`;
const second = `Second-${randomBytes(6).toString('hex')}`;
const third = `Third-${randomBytes(6).toString('hex')}`;

let server: MongoMemoryServer;
let engines: EngineService;
let state: AppState;
let ports: RunnerPorts;
let answers: (question: Question) => Answers | undefined = () => ({});
let confirmed = true;
const confirmations: Confirmation[] = [];
const savedPasswords: Json[] = [];

/** The address of the server signed in as a user. */
function addressAs(user: string, password: string, database: string): string {
  const url = new URL(server.getUri());
  url.username = user;
  url.password = password;
  url.searchParams.set('authSource', database);
  return url.toString();
}

function saved(id: ConnectionId, name: string): ConnectionView {
  return {
    id,
    name,
    engine: 'mongodb',
    hosts: '127.0.0.1',
    readOnly: false,
    keepsUndo: false,
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

/** The target the page's controls start the features on: the connection, the database being in their arguments. */
function on(_database: string, connection: ConnectionId = local): Target {
  return { kind: 'connection', connection };
}

function run(feature: string, target: Target, args: Json): Promise<IntentResult> {
  return start(ports, { feature: featureId(feature), target, args });
}

async function command(database: string, body: Json, connection: ConnectionId = local): Promise<unknown> {
  return engines.send(
    { connection, request: { engine: 'mongodb', database, method: 'runCommand', arguments: [body] } },
    AbortSignal.timeout(20_000),
  );
}

async function read<T>(feature: string, args: Json, connection: ConnectionId = local): Promise<T> {
  const result = await run(feature, { kind: 'connection', connection }, args);
  if (result.kind !== 'read') {
    throw new Error(`${feature} gave ${JSON.stringify(result)}`);
  }
  return result.result as T;
}

async function usersOf(database: string): Promise<readonly User[]> {
  return read<readonly User[]>('user.list', { connection: local, database });
}

async function rolesOf(database: string): Promise<readonly Role[]> {
  const roles = await read<RolesRead>('user.list-roles', { connection: local, database, builtIn: false, known: [] });
  return roles.kind === 'roles' ? roles.roles : [];
}

function rolesOfUser(users: readonly User[], name: string): readonly string[] {
  return (users.find((user) => user.user === name)?.roles ?? []).map((role) => `${role.role}@${role.db}`).sort();
}

/** Signs in as a user on a client of its own, and says who the server says it is. */
async function signsIn(user: string, password: string, database: string): Promise<boolean> {
  const id = connectionId(`c-sign-in-${randomBytes(3).toString('hex')}`);
  try {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: addressAs(user, password, database), connectTimeoutMs: 5000 },
      AbortSignal.timeout(15_000),
    );
    const status = (await command('admin', { connectionStatus: 1 }, id)) as {
      readonly authInfo: { readonly authenticatedUsers: readonly { readonly user: string }[] };
    };
    return status.authInfo.authenticatedUsers.some((each) => each.user === user);
  } catch {
    return false;
  } finally {
    await engines.disconnect(id).catch(() => undefined);
  }
}

/** Every text of the state a person can read: the Log, the notifications, the work and its errors. */
function readableTexts(): string {
  return JSON.stringify([
    state.runner.log.map((line) => line.text),
    state.runner.notifications.map((note) => [note.text, note.details ?? '']),
    state.runner.work,
  ]);
}

function logLines(): readonly string[] {
  return state.runner.log.map((line) => line.text);
}

function lastNotification(): string {
  return state.runner.notifications.at(-1)?.text ?? '';
}

function setReadOnly(readOnly: boolean): void {
  const all = state.connections.saved.map((each) => (each.id === local ? { ...each, readOnly } : each));
  ports.state.dispatch({ slice: 'connections', type: 'loaded', saved: all, keychain: true, readOnlyFile: false });
}

async function dropAll(): Promise<void> {
  for (const database of [shop, crm]) {
    await command(database, { dropAllUsersFromDatabase: 1 });
    await command(database, { dropAllRolesFromDatabase: 1 });
  }
}

beforeAll(async () => {
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  server = await MongoMemoryServer.create({
    ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    auth: { enable: true, customRootName: 'root', customRootPwd: rootPassword },
  });
  engines = createEngines();
  await engines.connect(
    local,
    { engine: 'mongodb', connectionString: addressAs('root', rootPassword, 'admin'), connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  state = {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [saved(local, 'Local'), saved(asOwner, 'As owner')],
    },
  };
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const savePassword: AppAction = (args) => {
    savedPasswords.push(args);
    return Promise.resolve();
  };
  ports = {
    features: runnableFeatures(),
    engines,
    appActions: new Map([['connection.save-password', savePassword]]),
    files: () => Promise.resolve(),
    dialogs: {
      ask: (_feature, question) => Promise.resolve(answers(question)),
      confirm: (_feature, confirmation) => {
        confirmations.push(confirmation);
        return Promise.resolve(confirmed);
      },
    },
    state: holder,
    platform: 'windows',
    isReadOnly: (id) => state.connections.saved.find((each) => each.id === id)?.readOnly ?? true,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => state.connections.saved.find((each) => each.id === id)?.name ?? id,
    now: () => Date.now(),
  };
  await dropAll();
}, 120_000);

afterAll(async () => {
  await dropAll().catch(() => undefined);
  await engines.disconnectAll();
  await server.stop();
});

beforeEach(() => {
  answers = () => ({});
  confirmed = true;
  confirmations.length = 0;
});

describe('user.create', () => {
  it('creates app in the shop database with its roles, and writes its password *** in the Log', async () => {
    answers = () => ({
      name: 'app',
      database: shop,
      password: first,
      roles: [
        { role: 'readWrite', db: shop },
        { role: 'clusterMonitor', db: 'admin' },
      ],
      customData: '{ team: "billing" }',
    });
    expect(await run('user.create', on(shop), { connection: local, database: shop })).toEqual({ kind: 'done' });
    const users = await usersOf(shop);
    expect(rolesOfUser(users, 'app')).toEqual(['clusterMonitor@admin', `readWrite@${shop}`]);
    expect(users.find((user) => user.user === 'app')?.customData).toEqual({ team: 'billing' });
    expect(logLines()).toContain(
      `[user.create] db.getSiblingDB("${shop}").runCommand({ createUser: "app", pwd: "***", roles: ["readWrite", { role: "clusterMonitor", db: "admin" }], customData: { team: "billing" } })`,
    );
    expect(lastNotification()).toBe(`Created the user app@${shop} with readWrite@${shop}, clusterMonitor@admin.`);
    expect(readableTexts()).not.toContain(first);
    expect(await signsIn('app', first, shop)).toBe(true);
  });

  it("refuses a name the server already has with the server's error, which repeats no password", async () => {
    answers = () => ({ name: 'app', database: shop, password: second, roles: [], customData: '' });
    const result = await run('user.create', on(shop), { connection: local, database: shop });
    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' ? result.message : '').toContain('already exists');
    expect(JSON.stringify(result)).not.toContain(second);
    expect(readableTexts()).not.toContain(second);
  });

  it('creates app in the crm database too: they are two users', async () => {
    answers = () => ({ name: 'app', database: crm, password: first, roles: [], customData: '' });
    expect(await run('user.create', on(crm), { connection: local, database: crm })).toEqual({ kind: 'done' });
    expect(lastNotification()).toBe(`Created the user app@${crm} without roles.`);
  });
});

describe('user.change-password', () => {
  it('sends the password only: the roles stay, and the new password signs in', async () => {
    answers = () => ({ password: second });
    const result = await run('user.change-password', on(shop), { connection: local, database: shop, user: 'app' });
    expect(result).toEqual({ kind: 'done' });
    expect(rolesOfUser(await usersOf(shop), 'app')).toEqual(['clusterMonitor@admin', `readWrite@${shop}`]);
    expect(logLines()).toContain(
      `[user.change-password] db.getSiblingDB("${shop}").runCommand({ updateUser: "app", pwd: "***" })`,
    );
    expect(state.runner.notifications.at(-1)?.actions?.map((action) => action.label)).toEqual(['Copy password']);
    expect(readableTexts()).not.toContain(second);
    expect(await signsIn('app', second, shop)).toBe(true);
    expect(await signsIn('app', first, shop)).toBe(false);
  });

  it('offers Save in the connection for the user the connection signs in as, which keeps the password it was given', async () => {
    // owner may change its own password: userAdmin of shop.
    await command(shop, { createUser: 'owner', pwd: second, roles: ['userAdmin'] });
    await engines.connect(
      asOwner,
      { engine: 'mongodb', connectionString: addressAs('owner', second, shop), connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
    const signedIn = await read<SignedInUser>('user.signed-in', { connection: asOwner }, asOwner);
    expect(signedIn.users).toEqual([{ user: 'owner', db: shop }]);
    answers = (question) => {
      expect(question.text).toBe(
        'This connection signs in as this user: Datardo offers to save the new password in it afterwards.',
      );
      return { password: third };
    };
    const args = { connection: asOwner, database: shop, user: 'owner' };
    expect(await run('user.change-password', on(shop, asOwner), args)).toEqual({ kind: 'done' });
    const note = state.runner.notifications.at(-1);
    expect(note?.text).toBe(`Changed the password of owner@${shop}. This connection signs in as that user.`);
    const save = note?.actions?.find((action) => action.label === 'Save in the connection');
    expect(save).toBeDefined();
    if (save === undefined) {
      return;
    }
    expect(await start(ports, { feature: save.feature, target: save.target, args: save.args ?? null })).toEqual({
      kind: 'done',
    });
    expect(savedPasswords).toEqual([{ connection: asOwner, password: third }]);
    expect(readableTexts()).not.toContain(third);
    // The connection stays connected; what the main process keeps signs in at the next connect.
    expect(engines.isConnected(asOwner)).toBe(true);
    const next = connectionStringWithPassword(addressAs('owner', second, shop), third);
    expect(next).not.toContain(second);
    await engines.disconnect(asOwner);
    await engines.connect(
      asOwner,
      { engine: 'mongodb', connectionString: next, connectTimeoutMs: 5000 },
      AbortSignal.timeout(15_000),
    );
    const again = await read<SignedInUser>('user.signed-in', { connection: asOwner }, asOwner);
    expect(again.users).toEqual([{ user: 'owner', db: shop }]);
    await engines.disconnect(asOwner);
  });

  it('offers no Save in the connection for another user', async () => {
    answers = () => ({ password: third });
    await run('user.change-password', on(crm), { connection: local, database: crm, user: 'app' });
    expect(state.runner.notifications.at(-1)?.actions?.map((action) => action.label)).toEqual(['Copy password']);
  });
});

describe('user.grant-role', () => {
  it('grants read of another database, and the user lists it', async () => {
    const result = await run('user.grant-role', on(shop), {
      connection: local,
      database: shop,
      user: 'app',
      role: 'read',
      roleDatabase: crm,
    });
    expect(result).toEqual({ kind: 'done' });
    expect(rolesOfUser(await usersOf(shop), 'app')).toContain(`read@${crm}`);
    expect(lastNotification()).toBe(`Granted read@${crm} to app@${shop}.`);
  });

  it("leaves the user as it was with a role the server does not know, and shows the server's error", async () => {
    const before = rolesOfUser(await usersOf(shop), 'app');
    const result = await run('user.grant-role', on(shop), {
      connection: local,
      database: shop,
      user: 'app',
      role: 'noSuchRole',
      roleDatabase: shop,
    });
    expect(result.kind).toBe('failed');
    expect(rolesOfUser(await usersOf(shop), 'app')).toEqual(before);
  });
});

describe('user.revoke-role', () => {
  it('keeps the role when the confirmation is cancelled, and revokes it after Revoke', async () => {
    const args = { connection: local, database: shop, user: 'app', role: { role: 'read', db: crm } };
    confirmed = false;
    expect((await run('user.revoke-role', on(shop), args)).kind).toBe('cancelled');
    expect(rolesOfUser(await usersOf(shop), 'app')).toContain(`read@${crm}`);
    confirmed = true;
    expect(await run('user.revoke-role', on(shop), args)).toEqual({ kind: 'done' });
    expect(confirmations.at(-1)?.title).toBe(`Revoke read@${crm} from app@${shop}`);
    expect(rolesOfUser(await usersOf(shop), 'app')).not.toContain(`read@${crm}`);
    expect(lastNotification()).toBe(`Revoked read@${crm} from app@${shop}.`);
  });
});

describe('user.create-role', () => {
  it('creates reader with its privileges and the role it inherits, listed with its summary', async () => {
    answers = () => ({
      name: 'reader',
      database: shop,
      privileges: `[{ resource: { db: "${shop}", collection: "orders" }, actions: ["find"] }]`,
      inherits: [{ role: 'read', db: shop }],
    });
    expect(await run('user.create-role', on(shop), { connection: local, database: shop })).toEqual({ kind: 'done' });
    const reader = (await rolesOf(shop)).find((role) => role.role === 'reader');
    expect(reader?.privileges.map((each) => [each.resource, each.actions])).toEqual([[`${shop}.orders`, ['find']]]);
    expect(reader?.roles).toEqual([{ role: 'read', db: shop }]);
    expect(lastNotification()).toBe(`Created the role reader@${shop}.`);
  });
});

describe('user.edit-role', () => {
  it('saved without a change, sends the same privileges and roles; emptied, sends empty lists', async () => {
    answers = (question) => ({
      name: 'reader',
      database: shop,
      privileges: fieldDefault(question, 'privileges'),
      inherits: fieldDefault(question, 'inherits'),
    });
    expect(await run('user.edit-role', on(shop), { connection: local, database: shop, role: 'reader' })).toEqual({
      kind: 'done',
    });
    const same = (await rolesOf(shop)).find((role) => role.role === 'reader');
    expect(same?.privileges.map((each) => each.resource)).toEqual([`${shop}.orders`]);
    expect(same?.roles).toEqual([{ role: 'read', db: shop }]);
    answers = () => ({ name: 'reader', database: shop, privileges: '', inherits: [] });
    expect(await run('user.edit-role', on(shop), { connection: local, database: shop, role: 'reader' })).toEqual({
      kind: 'done',
    });
    const emptied = (await rolesOf(shop)).find((role) => role.role === 'reader');
    expect(emptied?.privileges).toEqual([]);
    expect(emptied?.roles).toEqual([]);
    expect(lastNotification()).toBe(`Updated the role reader@${shop}.`);
  });
});

describe('user.delete-role', () => {
  it('deletes reader after Delete, and the user that had it no longer lists it', async () => {
    await run('user.grant-role', on(shop), {
      connection: local,
      database: shop,
      user: 'app',
      role: 'reader',
      roleDatabase: shop,
    });
    expect(rolesOfUser(await usersOf(shop), 'app')).toContain(`reader@${shop}`);
    confirmed = false;
    expect((await run('user.delete-role', on(shop), { connection: local, database: shop, role: 'reader' })).kind).toBe(
      'cancelled',
    );
    confirmed = true;
    expect(await run('user.delete-role', on(shop), { connection: local, database: shop, role: 'reader' })).toEqual({
      kind: 'done',
    });
    expect((await rolesOf(shop)).map((role) => role.role)).not.toContain('reader');
    expect(rolesOfUser(await usersOf(shop), 'app')).not.toContain(`reader@${shop}`);
  });
});

describe('user.delete', () => {
  it('deletes app of shop after Delete and leaves app of crm', async () => {
    confirmed = false;
    expect((await run('user.delete', on(shop), { connection: local, database: shop, user: 'app' })).kind).toBe(
      'cancelled',
    );
    confirmed = true;
    expect(await run('user.delete', on(shop), { connection: local, database: shop, user: 'app' })).toEqual({
      kind: 'done',
    });
    expect(confirmations.at(-1)?.title).toBe(`Delete the user app@${shop}`);
    expect((await usersOf(shop)).map((user) => user.user)).not.toContain('app');
    expect((await usersOf(crm)).map((user) => user.user)).toContain('app');
  });

  it('is refused on a read-only connection, as every write of the area, and sends nothing', async () => {
    setReadOnly(true);
    try {
      const refused = await run('user.delete', on(crm), { connection: local, database: crm, user: 'app' });
      expect(refused).toMatchObject({ kind: 'refused', code: 'user.delete/read-only' });
      const create = await run('user.create', on(crm), { connection: local, database: crm });
      expect(create).toMatchObject({ kind: 'refused', code: 'user.create/read-only' });
      expect((await usersOf(crm)).map((user) => user.user)).toContain('app');
    } finally {
      setReadOnly(false);
    }
  });
});

describe('user.show', () => {
  it('reads the users of every database and the signed-in user of the connection', async () => {
    const all = await read<readonly User[]>('user.list', { connection: local, database: null });
    expect(all.map((user) => `${user.user}@${user.db}`)).toEqual(expect.arrayContaining([`app@${crm}`, 'root@admin']));
    const signedIn = await read<SignedInUser>('user.signed-in', { connection: local });
    expect(signedIn.users).toEqual([{ user: 'root', db: 'admin' }]);
    expect(readableTexts()).not.toContain(rootPassword);
  });
});

function fieldDefault(question: Question, key: string): string {
  const field = question.fields.find((each) => each.key === key);
  return field?.kind === 'text' ? (field.default ?? '') : '';
}
