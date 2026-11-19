import { describe, expect, it } from 'vitest';
import * as list from '../../../src/features/user/list';
import * as listRoles from '../../../src/features/user/list-roles';
import { pageReads, secondRolesRead } from '../../../src/features/user/page/reads';
import * as signedIn from '../../../src/features/user/signed-in';
import type { Json } from '../../../src/shared/engine-request';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { contextOn, local, recorded } from './context';

const context = contextOn('user.list');

/** The database and the command of each request of a read. */
function sent(request: { readonly requests: readonly { readonly request: unknown }[] }): readonly [string, Json][] {
  return request.requests.map(({ request: each }) => {
    const mongo = each as MongoRequest;
    return [mongo.database, mongo.method === 'runCommand' ? (mongo.arguments[0] ?? null) : mongo.method];
  });
}

describe('user.list', () => {
  it('sends usersInfo: 1 to shop, and usersInfo forAllDBs to admin with All databases', () => {
    expect(sent(list.request(context, { connection: local.id, database: 'shop' }))).toEqual([
      ['shop', { usersInfo: { $numberInt: '1' } }],
    ]);
    expect(sent(list.request(context, { connection: local.id, database: null }))).toEqual([
      ['admin', { usersInfo: { forAllDBs: true } }],
    ]);
  });

  it('returns the users sorted by database and then by name', () => {
    const users = list.parse([recorded('usersInfo-all')]);
    expect(users.map((user) => `${user.user}@${user.db}`)).toEqual(['app@admin', 'bob@admin', 'zoe@admin', 'app@shop']);
  });

  it('keeps the roles of a user, and gives no mechanisms to one reported without', () => {
    const [app] = list.parse([recorded('usersInfo-shop')]);
    expect(app?.roles).toEqual([
      { role: 'reader', db: 'shop' },
      { role: 'readWrite', db: 'shop' },
      { role: 'read', db: 'reporting' },
    ]);
    expect(app?.mechanisms).toEqual(['SCRAM-SHA-1', 'SCRAM-SHA-256']);
    const [bare] = list.parse([{ users: [{ user: 'old', db: 'shop', roles: ['read'] }] }]);
    expect(bare?.mechanisms).toEqual([]);
    expect(bare?.roles).toEqual([{ role: 'read', db: 'shop' }]);
  });

  it('returns the custom data with its date as a date', () => {
    const [app] = list.parse([recorded('usersInfo-shop')]);
    expect(app?.customData).toEqual({ team: 'billing', since: { $date: { $numberLong: '1768003200000' } } });
    expect(JSON.stringify(app?.document)).not.toMatch(/credentials|pwd/);
  });
});

describe('user.list-roles', () => {
  const args = { connection: local.id, builtIn: false, known: ['shop', 'crm', 'reporting'] };

  it('sends one rolesInfo to shop without the built-in roles', () => {
    expect(sent(listRoles.request(context, { ...args, database: 'shop' }))).toEqual([
      ['shop', { rolesInfo: { $numberInt: '1' }, showPrivileges: true, showBuiltinRoles: false }],
    ]);
  });

  it('reads the databases with custom roles first, then sends rolesInfo to admin, shop and crm', () => {
    const first = listRoles.request(context, { ...args, database: null });
    expect(first.requests[0]?.request).toMatchObject({
      database: 'admin',
      collection: 'system.roles',
      method: 'distinct',
    });
    const databases = listRoles.parse([recorded('system-roles-distinct')], { ...args, database: null });
    expect(databases).toEqual({ kind: 'custom-role-databases', databases: ['admin', 'crm', 'shop'] });
    const second = secondRolesRead({ connection: local.id, builtIn: true, known: args.known }, databases);
    const builtIn = sent(listRoles.request(context, second?.args ?? null));
    expect(builtIn.map(([database]) => database)).toEqual(['admin', 'crm', 'shop']);
    expect(builtIn.map(([, command]) => (command as { showBuiltinRoles: boolean }).showBuiltinRoles)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('sends rolesInfo to every database the page lists when admin.system.roles cannot be read', () => {
    const second = secondRolesRead({ connection: local.id, builtIn: false, known: args.known }, null);
    expect(sent(listRoles.request(context, second?.args ?? null)).map(([database]) => database)).toEqual([
      'admin',
      'shop',
      'crm',
      'reporting',
    ]);
  });

  it('returns custom roles first, then by database and name', () => {
    const asked = { ...args, database: null, customRoleDatabases: ['shop'] };
    const read = listRoles.parse([recorded('rolesInfo-admin'), recorded('rolesInfo-shop-builtin')], asked);
    const builtInRead = {
      roles: [{ role: 'read', db: 'admin', isBuiltin: true, privileges: [], roles: [] }],
    };
    const withRead = listRoles.parse(
      [...[recorded('rolesInfo-admin'), recorded('rolesInfo-shop')], builtInRead],
      asked,
    );
    expect(read.kind).toBe('roles');
    if (withRead.kind !== 'roles') {
      throw new Error('Expected roles');
    }
    expect(withRead.roles.map((role) => `${role.role}@${role.db}`)).toEqual([
      'auditor@admin',
      'reader@shop',
      'read@admin',
    ]);
  });

  it('gives a role that only inherits the roles it inherits, each with its database', () => {
    const read = listRoles.parse([recorded('rolesInfo-crm')], { ...args, database: 'crm' });
    const viewer = read.kind === 'roles' ? read.roles.find((role) => role.role === 'viewer') : undefined;
    expect(viewer?.roles).toEqual([{ role: 'read', db: 'crm' }]);
    expect(viewer?.privileges).toEqual([]);
  });

  it('gives the resource shop.* to a privilege on the collection ""', () => {
    const read = listRoles.parse([recorded('rolesInfo-admin')], { ...args, database: 'admin' });
    if (read.kind !== 'roles') {
      throw new Error('Expected roles');
    }
    expect(read.roles[0]?.privileges.map((each) => [each.resource, each.actions])).toEqual([
      ['cluster', ['serverStatus']],
      ['shop.*', ['find', 'listIndexes']],
    ]);
  });
});

describe('user.signed-in', () => {
  it('gives app@admin and readWrite@shop, and the page says so', () => {
    const read = signedIn.parse([recorded('connectionStatus-app')]);
    expect(read).toEqual({ users: [{ user: 'app', db: 'admin' }], roles: [{ role: 'readWrite', db: 'shop' }] });
    expect(signedIn.signedInText({ kind: 'read', signedIn: read })).toBe(
      'Connected as app@admin · roles readWrite@shop',
    );
  });

  it('gives no user without credentials', () => {
    const read = signedIn.parse([recorded('connectionStatus-anonymous')]);
    expect(read.users).toEqual([]);
    expect(signedIn.signedInText({ kind: 'read', signedIn: read })).toBe(
      'Connected without signing in: access control may be disabled on this server, so users and roles take effect only once it is enabled.',
    );
  });

  it('says the user is unknown when the command fails, and the lists are read all the same', () => {
    expect(signedIn.signedInText({ kind: 'failed', message: 'not authorized' })).toBe(
      'Signed-in user unknown: not authorized',
    );
    const reads = pageReads('opened', { connection: local.id, database: 'shop', builtIn: false, known: [] });
    expect(reads.map((each) => each.key)).toEqual(['databases', 'users', 'roles', 'signed-in']);
    expect(signedIn.signedInOf({ message: 'not authorized' })).toBeUndefined();
  });

  it('sends connectionStatus to admin', () => {
    expect(sent(signedIn.request(context, { connection: local.id }))).toEqual([
      ['admin', { connectionStatus: { $numberInt: '1' } }],
    ]);
  });
});
