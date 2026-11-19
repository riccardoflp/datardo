import { describe, expect, it } from 'vitest';
import * as createRole from '../../../src/features/user/create-role';
import * as deleteRole from '../../../src/features/user/delete-role';
import * as editRole from '../../../src/features/user/edit-role';
import * as listRoles from '../../../src/features/user/list-roles';
import { privilegeSummary } from '../../../src/features/user/privilege-summary';
import type { Answers, Outcome } from '../../../src/shared/feature';
import {
  contextOn,
  local,
  onShop,
  planOf,
  production,
  questionOf,
  recorded,
  refusalOf,
  sentCommand,
  started,
  stepTexts,
} from './context';

const orders = '[{ resource: { db: "shop", collection: "orders" }, actions: ["find"] }]';

function createWith(answers: Answers): Outcome {
  return createRole.plan(contextOn('user.create-role'), started({ connection: local.id, database: 'shop' }, answers));
}

describe('user.create-role', () => {
  it('starts with the database chosen and nothing else', () => {
    const question = questionOf(createWith({}));
    expect(question.title).toBe('New role');
    expect(question.fields.map((field) => [field.key, 'default' in field ? field.default : undefined])).toEqual([
      ['name', ''],
      ['database', 'shop'],
      ['privileges', ''],
      ['inherits', ''],
    ]);
  });

  it('sends createRole to shop with the privileges typed and the role inherited', () => {
    const plan = planOf(
      createWith({ name: 'reader', database: 'shop', privileges: orders, inherits: [{ role: 'read', db: 'shop' }] }),
    );
    expect(sentCommand(plan)).toEqual({
      database: 'shop',
      command: {
        createRole: 'reader',
        privileges: [{ resource: { db: 'shop', collection: 'orders' }, actions: ['find'] }],
        roles: ['read'],
      },
    });
    expect(stepTexts(plan)).toEqual([
      'db.getSiblingDB("shop").runCommand({ createRole: "reader", privileges: [{ resource: { db: "shop", collection: "orders" }, actions: ["find"] }], roles: ["read"] })',
    ]);
    expect(plan.after[0]).toMatchObject({ text: 'Created the role reader@shop.' });
  });

  it('sends privileges: [] when the field is empty', () => {
    const plan = planOf(createWith({ name: 'reader', privileges: '  ', inherits: 'read' }));
    expect(sentCommand(plan).command).toEqual({ createRole: 'reader', privileges: [], roles: ['read'] });
  });

  it('refuses a privilege without its brackets, and privileges the parser cannot read', () => {
    expect(
      refusalOf(
        createWith({ name: 'reader', privileges: '{ resource: { db: "shop", collection: "" }, actions: ["find"] }' }),
      ),
    ).toEqual({
      code: 'user.create-role/not-a-list',
      message: 'Privileges must be an array: [{ resource: { db: "shop", collection: "" }, actions: ["find"] }]',
    });
    const broken = refusalOf(createWith({ name: 'reader', privileges: '[{ resource: ' }));
    expect(broken.code).toBe('user.create-role/privileges');
    expect(broken.message).toMatch(/^Privileges: ./);
  });

  it('sends a role inherited from admin as a role and a database', () => {
    const plan = planOf(createWith({ name: 'reader', inherits: 'clusterMonitor@admin' }));
    expect(sentCommand(plan).command).toMatchObject({ roles: [{ role: 'clusterMonitor', db: 'admin' }] });
  });

  it('refuses an empty name', () => {
    expect(refusalOf(createWith({ name: ' ' })).code).toBe('user.create-role/no-name');
  });

  it('lists the role created among the custom roles, with the summary shop.orders: find', () => {
    const read = listRoles.parse([recorded('rolesInfo-shop')], { connection: local.id, database: 'shop' });
    const reader = read.kind === 'roles' ? read.roles.find((role) => role.role === 'reader') : undefined;
    expect(reader?.isBuiltin).toBe(false);
    expect(reader === undefined ? '' : privilegeSummary(reader)).toBe('shop.orders: find');
  });

  it('is refused on a read-only connection', () => {
    const outcome = createRole.plan(
      contextOn('user.create-role', production),
      started({ connection: production.id, database: 'shop' }),
    );
    expect(refusalOf(outcome).code).toBe('user.create-role/read-only');
  });
});

const shopRoles = listRoles.parse([recorded('rolesInfo-shop')], { connection: local.id, database: 'shop' });

function editWith(answers: Answers, role = 'reader'): Outcome {
  return editRole.plan(contextOn('user.edit-role'), started(onShop({ role }), answers));
}

describe('user.edit-role', () => {
  it('reads the roles of its database first', () => {
    expect(editWith({})).toEqual({
      kind: 'read',
      need: {
        key: 'roles',
        read: 'user.list-roles',
        args: { connection: local.id, database: 'shop', builtIn: false, known: [] },
      },
    });
  });

  it('opens the dialog with its privileges as text and its inherited roles as rows', () => {
    const question = questionOf(editWith({ roles: shopRoles }));
    expect(question.title).toBe('Edit reader@shop');
    expect(question.fields.map((field) => [field.key, 'default' in field ? field.default : undefined])).toEqual([
      ['name', 'reader'],
      ['database', 'shop'],
      ['privileges', '[\n  { resource: { db: "shop", collection: "orders" }, actions: ["find"] }\n]'],
      ['inherits', 'read@shop'],
    ]);
  });

  it('sends updateRole with the same privileges and roles when saved without a change', () => {
    const question = questionOf(editWith({ roles: shopRoles }));
    const answers = Object.fromEntries(
      question.fields.map((field) => [field.key, 'default' in field ? (field.default ?? '') : '']),
    );
    const plan = planOf(editWith({ roles: shopRoles, ...answers }));
    const reader = shopRoles.kind === 'roles' ? shopRoles.roles.find((role) => role.role === 'reader') : undefined;
    expect(sentCommand(plan)).toEqual({
      database: 'shop',
      command: {
        updateRole: 'reader',
        privileges: reader?.privileges.map((privilege) => privilege.document),
        roles: ['read'],
      },
    });
  });

  it('sends roles: [] and privileges: [] once both are emptied', () => {
    const plan = planOf(editWith({ roles: shopRoles, privileges: '', inherits: [] }));
    expect(sentCommand(plan).command).toEqual({ updateRole: 'reader', privileges: [], roles: [] });
  });

  it('writes a privilege on the cluster as it was read and sends it back the same', () => {
    const cluster = { resource: { cluster: true }, actions: ['serverStatus'] };
    const roles = {
      kind: 'roles',
      roles: [
        {
          role: 'ops',
          db: 'shop',
          isBuiltin: false,
          privileges: [{ resource: 'cluster', actions: ['serverStatus'], document: cluster }],
          roles: [],
          document: {},
        },
      ],
    };
    const question = questionOf(editWith({ roles }, 'ops'));
    const privileges = question.fields.find((field) => field.key === 'privileges');
    const typed = privileges !== undefined && 'default' in privileges ? (privileges.default ?? '') : '';
    expect(typed).toBe('[\n  { resource: { cluster: true }, actions: ["serverStatus"] }\n]');
    expect(sentCommand(planOf(editWith({ roles, privileges: typed, inherits: '' }, 'ops'))).command).toEqual({
      updateRole: 'ops',
      privileges: [cluster],
      roles: [],
    });
  });

  it('refuses a built-in role before anything is read', () => {
    expect(refusalOf(editWith({}, 'readWrite'))).toEqual({
      code: 'user.edit-role/built-in',
      message: "Built-in roles can't be changed.",
    });
    expect(
      refusalOf(editRole.plan(contextOn('user.edit-role'), started(onShop({ role: 'x', builtIn: true })))).code,
    ).toBe('user.edit-role/built-in');
  });

  it('refuses a role that is no longer there', () => {
    expect(refusalOf(editWith({ roles: { kind: 'roles', roles: [] } }))).toEqual({
      code: 'user.edit-role/gone',
      message: 'The role reader@shop no longer exists.',
    });
  });

  it('refuses privileges that cannot be read, with the codes of this card', () => {
    expect(refusalOf(editWith({ roles: shopRoles, privileges: '{}' })).code).toBe('user.edit-role/not-a-list');
    expect(refusalOf(editWith({ roles: shopRoles, privileges: '[' })).code).toBe('user.edit-role/privileges');
  });

  it('is refused on a read-only connection', () => {
    const outcome = editRole.plan(
      contextOn('user.edit-role', production),
      started({ connection: production.id, database: 'shop', role: 'reader' }),
    );
    expect(refusalOf(outcome).code).toBe('user.edit-role/read-only');
  });
});

describe('user.delete-role', () => {
  it('asks Delete the role reader@shop? and sends dropRole to shop', () => {
    const plan = planOf(deleteRole.plan(contextOn('user.delete-role'), started(onShop({ role: 'reader' }))));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: "Delete the role reader@shop?\nThe users and roles that have it lose its privileges. This can't be undone.",
      button: 'Delete',
    });
    expect(sentCommand(plan)).toEqual({ database: 'shop', command: { dropRole: 'reader' } });
    expect(plan.after).toContainEqual({ kind: 'refresh', connection: local.id });
  });

  it('refuses a built-in role', () => {
    const args = { connection: local.id, database: 'admin', role: 'root' };
    expect(refusalOf(deleteRole.plan(contextOn('user.delete-role'), started(args)))).toEqual({
      code: 'user.delete-role/built-in',
      message: "Built-in roles can't be changed.",
    });
  });

  it('is refused on a read-only connection', () => {
    const outcome = deleteRole.plan(
      contextOn('user.delete-role', production),
      started({ connection: production.id, database: 'shop', role: 'reader' }),
    );
    expect(refusalOf(outcome).code).toBe('user.delete-role/read-only');
  });
});
