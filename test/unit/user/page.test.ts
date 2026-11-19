import { describe, expect, it } from 'vitest';
import * as inspect from '../../../src/features/user/inspect';
import * as list from '../../../src/features/user/list';
import * as listRoles from '../../../src/features/user/list-roles';
import * as show from '../../../src/features/user/show';
import type { Role, RoleRef, User, UserControl } from '../../../src/features/user/types';
import { connectionId } from '../../../src/shared/ids';
import { contextOn, local, planOf, recorded } from './context';

function user(name: string, db: string, roles: readonly RoleRef[] = []): User {
  return { user: name, db, roles, mechanisms: ['SCRAM-SHA-256'], document: { user: name, db } };
}

function role(name: string, db: string, more: Partial<Role> = {}): Role {
  return { role: name, db, isBuiltin: false, privileges: [], roles: [], document: { role: name, db }, ...more };
}

const app = user('app', 'shop', [
  { role: 'readWrite', db: 'shop' },
  { role: 'read', db: 'reporting' },
]);

function inspectState(
  selected: inspect.InspectState['selected'],
  more: Partial<inspect.InspectState> = {},
): inspect.InspectState {
  return { connection: local.id, readOnly: false, selected, users: [app], roles: [], ...more };
}

function controlsOf(view: unknown): readonly string[] {
  return [...JSON.stringify(view).matchAll(/"element":"([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('user.inspect', () => {
  it('shows two chips that revoke, the second with the tooltip Revoke read@reporting', () => {
    const view = inspect.view(inspectState({ kind: 'user', user: app }));
    if (view.kind !== 'user') {
      throw new Error('Expected a user');
    }
    expect(view.roles.chips.map((chip) => chip.label)).toEqual(['readWrite@shop', 'read@reporting']);
    expect(view.roles.chips.map((chip) => chip.revoke?.label)).toEqual(['✕', '✕']);
    expect(view.roles.chips[1]?.revoke).toMatchObject({
      tooltip: 'Revoke read@reporting',
      feature: 'user.revoke-role',
      args: { connection: local.id, database: 'shop', user: 'app', role: { role: 'read', db: 'reporting' } },
    });
  });

  it('shows none for a user without roles, which can still be granted one', () => {
    const view = inspect.view(
      inspectState({ kind: 'user', user: user('bob', 'admin') }, { grant: { role: 'read', database: 'admin' } }),
    );
    expect(view).toMatchObject({ roles: { chips: [], none: 'none' } });
    expect(view.kind === 'user' ? view.grant?.control : undefined).toMatchObject({
      feature: 'user.grant-role',
      args: { user: 'bob', role: 'read', roleDatabase: 'admin' },
    });
    const empty = inspect.view(inspectState({ kind: 'user', user: app }));
    expect(empty.kind === 'user' ? empty.grant : undefined).not.toHaveProperty('control');
  });

  it('sets the database of Grant to admin for clusterMonitor and leaves it for read', () => {
    expect(inspect.grantDatabaseAfterTyping('clusterMonitor', 'shop')).toBe('admin');
    expect(inspect.grantDatabaseAfterTyping('read', 'reporting')).toBe('reporting');
  });

  it('gives the chip of a role with 15 privileges a tooltip of 13 lines, the second ending with …', () => {
    const actions = Array.from({ length: 10 }, (_, index) => `action${String(index)}`);
    const privileges = Array.from({ length: 15 }, (_, index) => ({
      resource: `shop.c${String(index)}`,
      actions: index === 0 ? actions : ['find'],
      document: null,
    }));
    const big = role('big', 'shop', { privileges });
    const lines = inspect.roleTooltip({ role: 'big', db: 'shop' }, [big]).split('\n');
    expect(lines).toHaveLength(13);
    expect(lines[1]).toMatch(/…$/);
  });

  it('shows the users that hold a role, and none when they are not listed', () => {
    const reader = role('reader', 'shop');
    const holders = [user('app', 'shop', [reader]), user('bob', 'shop', [reader]), user('zoe', 'shop')];
    const view = inspect.view(inspectState({ kind: 'role', role: reader }, { users: holders }));
    expect(view.kind === 'role' ? view.users?.chips.map((chip) => chip.label) : []).toEqual(['app@shop', 'bob@shop']);
    const crm = inspect.view(inspectState({ kind: 'role', role: reader }, { users: [] }));
    expect(crm).not.toHaveProperty('users');
  });

  it('copies the document in mongosh syntax, with its UUID as a UUID', () => {
    const [recordedApp] = list.parse([recorded('usersInfo-shop')]);
    if (recordedApp === undefined) {
      throw new Error('Expected a user');
    }
    const view = inspect.view(inspectState({ kind: 'user', user: recordedApp }));
    const copy = view.raw.copy as Extract<UserControl, { kind: 'copy' }>;
    expect(copy.text).toContain('userId: UUID("cce560a1-b099-4c22-8d8f-6fc4f19017bc")');
    expect(copy.text).toBe(view.raw.text);
    expect(view.kind === 'user' ? view.customData?.text : '').toContain('ISODate(');
  });

  it('shows on a read-only connection the roles, the custom data and Raw, and nothing that writes', () => {
    const [recordedApp] = list.parse([recorded('usersInfo-shop')]);
    if (recordedApp === undefined) {
      throw new Error('Expected a user');
    }
    const view = inspect.view(inspectState({ kind: 'user', user: recordedApp }, { readOnly: true }));
    expect(controlsOf(view)).toEqual([]);
    expect(view).toMatchObject({ buttons: [], roles: { chips: [{}, {}, {}] }, customData: {}, raw: {} });
    expect(view).not.toHaveProperty('grant');
    const roleView = inspect.view(inspectState({ kind: 'role', role: role('reader', 'shop') }, { readOnly: true }));
    expect(controlsOf(roleView)).toEqual([]);
  });

  it('lists all the actions of a privilege in the Privileges table', () => {
    const seven = ['find', 'insert', 'update', 'remove', 'createIndex', 'dropIndex', 'listIndexes'];
    const view = inspect.view(
      inspectState({
        kind: 'role',
        role: role('ops', 'shop', { privileges: [{ resource: 'shop.*', actions: seven, document: null }] }),
      }),
    );
    expect(view.kind === 'role' ? view.privileges?.rows : []).toEqual([
      { resource: 'shop.*', actions: seven.join(', ') },
    ]);
  });
});

function pageState(more: Partial<show.UsersPageState> = {}): show.UsersPageState {
  return {
    connection: local.id,
    readOnly: false,
    section: 'users',
    database: 'shop',
    filter: '',
    builtIn: false,
    users: { items: [], loading: false },
    roles: { items: [], loading: false },
    ...more,
  };
}

const twelve: readonly User[] = Array.from({ length: 12 }, (_, index) =>
  user(`u${String(index).padStart(2, '0')}`, index < 6 ? 'shop' : 'crm', [
    index % 4 === 0 ? { role: 'readWrite', db: index < 6 ? 'shop' : 'crm' } : { role: 'read', db: 'shop' },
  ]),
);

describe('user.show', () => {
  it('opens the page on the database it is started from, and on All databases from the Pages', () => {
    const fromShop = planOf(show.plan(contextOn('user.show'), { args: { connection: local.id, database: 'shop' } }));
    expect(JSON.stringify(fromShop)).toContain('"section":"shop"');
    expect(show.databaseOfSection('shop')).toBe('shop');
    expect(show.databaseOfSection('')).toBeUndefined();
    expect(show.databaseOfSection(undefined)).toBeUndefined();
  });

  it('never offers local and config, always admin, and reporting when a user is defined there', () => {
    const view = show.view(
      pageState({ listed: ['local', 'config', 'shop'], users: { items: [user('r', 'reporting')], loading: false } }),
    );
    expect(view.toolbar.database.choices.map((choice) => choice.value)).toEqual(['', 'admin', 'reporting', 'shop']);
    const { database: _database, ...allDatabases } = pageState({
      users: { items: [user('r', 'reporting')], loading: false },
    });
    const refused = show.databasesOffered(allDatabases);
    expect(refused).toEqual(['admin', 'reporting']);
  });

  it('narrows 12 users to those having readWrite, and says 3 of 12 users', () => {
    const view = show.view(pageState({ filter: 'readwrite', users: { items: twelve, loading: false } }));
    expect(view.users.rows.map((row) => row.user)).toEqual(['u00', 'u04', 'u08']);
    expect(view.users.count).toBe('3 of 12 users');
  });

  it('narrows the roles by an action, and by a resource', () => {
    const find = role('finder', 'shop', {
      privileges: [{ resource: 'shop.orders', actions: ['find'], document: null }],
    });
    const insert = role('writer', 'shop', {
      privileges: [{ resource: 'shop.people', actions: ['insert'], document: null }],
    });
    const roles = { items: [find, insert], loading: false };
    expect(show.view(pageState({ filter: 'find', roles })).roles.rows.map((row) => row.role)).toEqual(['finder']);
    expect(show.view(pageState({ filter: 'shop.orders', roles })).roles.rows.map((row) => row.role)).toEqual([
      'finder',
    ]);
  });

  it('tags the user the connection is signed in as with you', () => {
    const signedIn = { kind: 'read' as const, signedIn: { users: [{ user: 'app', db: 'shop' }], roles: [] } };
    const view = show.view(pageState({ signedIn, users: { items: [app, user('bob', 'shop')], loading: false } }));
    expect(view.users.rows.map((row) => row.you)).toEqual(['you', undefined]);
  });

  it('lists the built-in roles of shop after its custom roles, and says 2 custom roles, 6 built-in', () => {
    const read = listRoles.parse(
      [recorded('rolesInfo-shop-builtin'), { roles: [{ role: 'auditor', db: 'shop', isBuiltin: false }] }],
      {
        connection: local.id,
        database: 'shop',
        builtIn: true,
      },
    );
    const roles = read.kind === 'roles' ? read.roles : [];
    const view = show.view(pageState({ builtIn: true, roles: { items: roles, loading: false } }));
    expect(view.roles.count).toBe('2 custom roles, 6 built-in');
    expect(view.roles.rows.slice(0, 3).map((row) => [row.role, row.builtIn])).toEqual([
      ['auditor', undefined],
      ['reader', undefined],
      ['dbAdmin', 'built-in'],
    ]);
  });

  it('shows the message of a refused usersInfo in Users and the table of Roles', () => {
    const view = show.view(
      pageState({
        users: { items: [], loading: false, error: 'not authorized on shop' },
        roles: { items: [role('reader', 'shop')], loading: false },
      }),
    );
    expect(view.users).toMatchObject({ error: 'not authorized on shop', rows: [] });
    expect(view.users).not.toHaveProperty('empty');
    expect(view.roles.rows).toHaveLength(1);
  });

  it('shows no control that writes on a read-only connection', () => {
    const view = show.view(
      pageState({
        readOnly: true,
        users: { items: [app], loading: false },
        roles: { items: [role('reader', 'shop')], loading: false },
      }),
    );
    expect(controlsOf(view)).toEqual([]);
    const writable = show.view(
      pageState({
        users: { items: [app], loading: false },
        roles: { items: [role('reader', 'shop')], loading: false },
      }),
    );
    expect(controlsOf(writable)).toEqual([
      'user.create@toolbar',
      'user.change-password@row-menu',
      'user.delete@row-menu',
      'user.create-role@toolbar',
      'user.edit-role@row-menu',
      'user.delete-role@row-menu',
    ]);
  });

  it('gives a built-in role neither Edit nor Delete', () => {
    const view = show.view(
      pageState({ roles: { items: [role('read', 'shop', { isBuiltin: true })], loading: false } }),
    );
    expect(view.roles.rows[0]?.menu).toEqual([]);
  });

  it('writes a role of another database whole in the row, and the tooltip of Privileges as the cell', () => {
    const view = show.view(
      pageState({
        users: { items: [app], loading: false },
        roles: {
          items: [
            role('ops', 'shop', { privileges: [{ resource: 'cluster', actions: ['serverStatus'], document: null }] }),
          ],
          loading: false,
        },
      }),
    );
    expect(view.users.rows[0]?.roles).toBe('readWrite, read@reporting');
    expect(view.roles.rows[0]?.privilegesTooltip).toBe(view.roles.rows[0]?.privileges);
  });

  it('opens nothing on a connection that is not MongoDB', () => {
    const plan = planOf(show.plan(contextOn('user.show'), { args: { connection: connectionId('c-missing') } }));
    expect(plan.steps).toEqual([]);
  });
});
