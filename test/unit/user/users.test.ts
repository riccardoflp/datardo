import { describe, expect, it } from 'vitest';
import * as changePassword from '../../../src/features/user/change-password';
import * as create from '../../../src/features/user/create';
import * as deleteUser from '../../../src/features/user/delete';
import * as grantRole from '../../../src/features/user/grant-role';
import * as revokeRole from '../../../src/features/user/revoke-role';
import type { Answers, Outcome, Plan } from '../../../src/shared/feature';
import {
  contextOn,
  local,
  notSignedIn,
  onShop,
  planOf,
  production,
  questionOf,
  refusalOf,
  sentCommand,
  signedInAsApp,
  started,
  stepTexts,
} from './context';

const secret = 'Tr0ub4dor&3-not-logged';

/** Everything of a plan a person or the Log can read: its title, its steps' texts, its danger and its notifications. */
function readable(plan: Plan): string {
  const notes = plan.after.flatMap((after) => (after.kind === 'notify' ? [after.text, after.details ?? ''] : []));
  return JSON.stringify([plan.title, stepTexts(plan), plan.danger, plan.undo, notes]);
}

function createWith(answers: Answers, database = 'shop'): Outcome {
  return create.plan(contextOn('user.create'), started({ connection: local.id, database }, answers));
}

describe('user.create', () => {
  it('starts with shop and readWrite in shop, or with admin and no role for All databases', () => {
    const shop = questionOf(createWith({}));
    expect(shop.fields.find((field) => field.key === 'database')).toMatchObject({ default: 'shop' });
    expect(shop.fields.find((field) => field.key === 'roles')).toMatchObject({ default: 'readWrite@shop' });
    const all = questionOf(create.plan(contextOn('user.create'), started({ connection: local.id, database: null })));
    expect(all.fields.find((field) => field.key === 'database')).toMatchObject({ default: 'admin' });
    expect(all.fields.find((field) => field.key === 'roles')).toMatchObject({ default: '' });
    expect(all.fields.find((field) => field.key === 'password')).toMatchObject({ secret: true });
  });

  it('sends createUser to shop with the roles and the password as typed, and writes it *** in the Log', () => {
    const roles = [
      { role: 'readWrite', db: 'shop' },
      { role: 'clusterMonitor', db: 'admin' },
    ];
    const plan = planOf(createWith({ name: 'app', database: 'shop', password: secret, roles, customData: '' }));
    expect(sentCommand(plan)).toEqual({
      database: 'shop',
      command: { createUser: 'app', pwd: secret, roles: ['readWrite', { role: 'clusterMonitor', db: 'admin' }] },
    });
    expect(stepTexts(plan).map((line) => `[user.create] ${line}`)).toEqual([
      '[user.create] db.getSiblingDB("shop").runCommand({ createUser: "app", pwd: "***", roles: ["readWrite", { role: "clusterMonitor", db: "admin" }] })',
    ]);
    expect(readable(plan)).not.toContain(secret);
  });

  it('reads the roles written whole as the dialog starts them', () => {
    const plan = planOf(createWith({ name: 'app', password: secret, roles: 'readWrite@shop, clusterMonitor@admin' }));
    expect(sentCommand(plan).command).toMatchObject({ roles: ['readWrite', { role: 'clusterMonitor', db: 'admin' }] });
  });

  it('sends customData only when some is typed, and refuses custom data that is not an object', () => {
    const without = planOf(createWith({ name: 'app', password: secret, roles: [], customData: '' }));
    expect(sentCommand(without).command).not.toHaveProperty('customData');
    const billing = planOf(createWith({ name: 'app', password: secret, customData: '{ team: "billing" }' }));
    expect(sentCommand(billing).command).toMatchObject({ customData: { team: 'billing' } });
    expect(refusalOf(createWith({ name: 'app', password: secret, customData: '[1, 2]' }))).toEqual({
      code: 'user.create/custom-data',
      message: 'Custom data must be an object',
    });
    expect(refusalOf(createWith({ name: 'app', password: secret, customData: '{ team: ' })).message).toMatch(
      /^Custom data: /,
    );
  });

  it('refuses a name of spaces only, and sends the name without the spaces around it', () => {
    expect(refusalOf(createWith({ name: '   ', password: secret }))).toEqual({
      code: 'user.create/no-name',
      message: 'Enter the name of the user.',
    });
    expect(sentCommand(planOf(createWith({ name: '  app ', password: secret }))).command).toMatchObject({
      createUser: 'app',
    });
  });

  it('refuses an empty password', () => {
    expect(refusalOf(createWith({ name: 'app', password: '' }))).toEqual({
      code: 'user.create/no-password',
      message: 'Enter a password, or generate one.',
    });
  });

  it('says a user was created without roles, and Copy password copies it and sends nothing', () => {
    const plan = planOf(createWith({ name: 'app', password: secret, roles: [] }));
    const [notify] = plan.after;
    expect(notify).toMatchObject({
      kind: 'notify',
      level: 'success',
      text: 'Created the user app@shop without roles.',
    });
    const action = notify?.kind === 'notify' ? notify.actions?.[0] : undefined;
    expect(action).toMatchObject({ label: 'Copy password', feature: 'user.create' });
    const copy = planOf(create.plan(contextOn('user.create'), { args: action?.args ?? null }));
    expect(copy.steps).toEqual([]);
    expect(copy.after).toEqual([{ kind: 'copy', text: secret }]);
    expect(plan.after).toContainEqual({ kind: 'refresh', connection: local.id });
    expect(plan.publishes).toBe(false);
    expect(plan.undo).toHaveProperty('cannot');
  });

  it('is refused on a read-only connection before anything is asked', () => {
    const outcome = create.plan(
      contextOn('user.create', production),
      started({ connection: production.id, database: 'shop' }),
    );
    expect(refusalOf(outcome).code).toBe('user.create/read-only');
  });
});

function changeWith(answers: Answers): Outcome {
  return changePassword.plan(contextOn('user.change-password'), started(onShop({ user: 'app' }), answers));
}

describe('user.change-password', () => {
  it('reads who the connection is signed in as first', () => {
    expect(changeWith({})).toEqual({
      kind: 'read',
      need: { key: 'signedIn', read: 'user.signed-in', args: { connection: local.id } },
    });
  });

  it('sends updateUser with the password only, written *** in the Log', () => {
    const plan = planOf(changeWith({ signedIn: notSignedIn, password: secret }));
    expect(sentCommand(plan)).toEqual({ database: 'shop', command: { updateUser: 'app', pwd: secret } });
    expect(stepTexts(plan)).toEqual(['db.getSiblingDB("shop").runCommand({ updateUser: "app", pwd: "***" })']);
    expect(readable(plan)).not.toContain(secret);
  });

  it('has the note and Save in the connection for the user the connection signs in as', () => {
    expect(questionOf(changeWith({ signedIn: signedInAsApp })).text).toBe(
      'This connection signs in as this user: Datardo offers to save the new password in it afterwards.',
    );
    const plan = planOf(changeWith({ signedIn: signedInAsApp, password: secret }));
    const notify = plan.after[0];
    const actions = notify?.kind === 'notify' ? (notify.actions ?? []) : [];
    expect(actions.map((action) => action.label)).toEqual(['Copy password', 'Save in the connection']);
    const save = planOf(changePassword.plan(contextOn('user.change-password'), { args: actions[1]?.args ?? null }));
    expect(save.steps).toEqual([
      {
        kind: 'app',
        action: 'connection.save-password',
        args: { connection: local.id, password: secret },
        text: 'save the new password in the connection Local',
      },
    ]);
    expect(readable(save)).not.toContain(secret);
  });

  it('has no Save in the connection for another user, nor when who signs in is unknown', () => {
    for (const signedIn of [notSignedIn, { message: 'not authorized' }]) {
      const plan = planOf(changeWith({ signedIn, password: secret }));
      const notify = plan.after[0];
      expect(notify?.kind === 'notify' ? notify.actions?.map((action) => action.label) : []).toEqual(['Copy password']);
    }
  });

  it('refuses an empty password', () => {
    expect(refusalOf(changeWith({ signedIn: notSignedIn, password: '' }))).toEqual({
      code: 'user.change-password/no-password',
      message: 'Enter a password, or generate one.',
    });
  });

  it('is refused on a read-only connection', () => {
    const outcome = changePassword.plan(
      contextOn('user.change-password', production),
      started({ connection: production.id, database: 'shop', user: 'app' }),
    );
    expect(refusalOf(outcome).code).toBe('user.change-password/read-only');
  });
});

describe('user.grant-role', () => {
  function grant(role: string, roleDatabase?: string): Outcome {
    const args = onShop({ user: 'app', role, ...(roleDatabase === undefined ? {} : { roleDatabase }) });
    return grantRole.plan(contextOn('user.grant-role'), started(args));
  }

  it('sends read in shop as its name and read in reporting as a role and a database', () => {
    expect(sentCommand(planOf(grant('read', 'shop')))).toEqual({
      database: 'shop',
      command: { grantRolesToUser: 'app', roles: ['read'] },
    });
    const plan = planOf(grant('read', 'reporting'));
    expect(sentCommand(plan).command).toEqual({ grantRolesToUser: 'app', roles: [{ role: 'read', db: 'reporting' }] });
    expect(plan.after[0]).toMatchObject({ text: 'Granted read@reporting to app@shop.' });
  });

  it('sends nothing with an empty field', () => {
    expect(refusalOf(grant('  ')).code).toBe('user.grant-role/no-role');
  });

  it('is refused on a read-only connection', () => {
    const outcome = grantRole.plan(
      contextOn('user.grant-role', production),
      started({ connection: production.id, database: 'shop', user: 'app', role: 'read' }),
    );
    expect(refusalOf(outcome).code).toBe('user.grant-role/read-only');
  });
});

describe('user.revoke-role', () => {
  const args = onShop({ user: 'app', role: { role: 'read', db: 'reporting' } });

  it('asks Revoke read@reporting from app@shop? and sends revokeRolesFromUser to shop', () => {
    const plan = planOf(revokeRole.plan(contextOn('user.revoke-role'), started(args, { signedIn: notSignedIn })));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Revoke read@reporting from app@shop?\nThe user loses the privileges of the role.',
      button: 'Revoke',
    });
    expect(sentCommand(plan)).toEqual({
      database: 'shop',
      command: { revokeRolesFromUser: 'app', roles: [{ role: 'read', db: 'reporting' }] },
    });
    expect(plan.undo).toEqual({
      cannot: expect.stringMatching(/^It cannot be undone from the undo history/) as string,
    });
  });

  it('warns when the connection signs in as that user', () => {
    const plan = planOf(revokeRole.plan(contextOn('user.revoke-role'), started(args, { signedIn: signedInAsApp })));
    expect(plan.danger).toMatchObject({ text: expect.stringContaining('it may lose access.') as string });
  });

  it('is refused on a read-only connection', () => {
    const outcome = revokeRole.plan(
      contextOn('user.revoke-role', production),
      started({ ...args, connection: production.id }),
    );
    expect(refusalOf(outcome).code).toBe('user.revoke-role/read-only');
  });
});

describe('user.delete', () => {
  it('asks Delete the user app@shop? and sends dropUser to shop', () => {
    const plan = planOf(
      deleteUser.plan(contextOn('user.delete'), started(onShop({ user: 'app' }), { signedIn: notSignedIn })),
    );
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: "Delete the user app@shop?\nApplications that use it can no longer sign in. This can't be undone.",
      button: 'Delete',
    });
    expect(sentCommand(plan)).toEqual({ database: 'shop', command: { dropUser: 'app' } });
  });

  it('says when the connection signs in as that user', () => {
    const plan = planOf(
      deleteUser.plan(contextOn('user.delete'), started(onShop({ user: 'app' }), { signedIn: signedInAsApp })),
    );
    expect(plan.danger).toMatchObject({
      text: "Delete the user app@shop?\nThis connection signs in as that user. Applications that use it can no longer sign in. This can't be undone.",
    });
  });

  it('deletes app@crm on crm, leaving app@shop', () => {
    const args = { connection: local.id, database: 'crm', user: 'app' };
    const plan = planOf(deleteUser.plan(contextOn('user.delete'), started(args, { signedIn: signedInAsApp })));
    expect(sentCommand(plan)).toEqual({ database: 'crm', command: { dropUser: 'app' } });
    expect(plan.danger).toMatchObject({ text: expect.not.stringContaining('This connection signs in') as string });
  });

  it('is refused on a read-only connection', () => {
    const outcome = deleteUser.plan(
      contextOn('user.delete', production),
      started({ connection: production.id, database: 'shop', user: 'app' }),
    );
    expect(refusalOf(outcome).code).toBe('user.delete/read-only');
  });
});
