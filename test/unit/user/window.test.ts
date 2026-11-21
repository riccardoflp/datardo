/**
 * What the window adds to the cards of the user area: which commands Go to offers, the dialog of **New user** opened
 * again after the server refused the name, the password the window keeps for that only, and the connection string
 * **Save in the connection** keeps.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionStringWithPassword, plan as changePassword } from '../../../src/features/user/change-password';
import { stepText } from '../../../src/features/runner/step-text';
import { isOffered } from '../../../src/features/user/commands';
import { view as pageView } from '../../../src/features/user/show';
import * as create from '../../../src/features/user/create';
import type { Intent, IntentResult } from '../../../src/shared/bridge';
import type { ConnectionView } from '../../../src/shared/connection';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { initialRunnerState, reduceRunner } from '../../../src/shared/state/runner';
import type { TabShows } from '../../../src/shared/state/tabs';
import {
  createAnswered,
  createUser,
  forgetPasswords,
  givenPassword,
  keepsPassword,
} from '../../../src/ui/pages/user/user-actions';
import { redisConnection, stateWith } from '../connection/context';
import { contextOn, engineSteps, local, onShop, planOf, production, questionOf, started, stepTexts } from './context';

const secret = 'Tr0ub4dor&3-not-logged';

/** The state with the connection current and, when `page` is given, a tab of that page active. */
function stateOn(connection: ConnectionView, page?: string): AppState {
  const state = stateWith([connection]);
  const shows: TabShows | undefined =
    page === undefined ? undefined : { kind: 'page', connection: connection.id, title: page, page };
  return {
    ...state,
    nav: { ...state.nav, current: connection.id },
    tabs:
      shows === undefined
        ? state.tabs
        : { ...state.tabs, tabs: [{ id: tabId('t1'), shows, lastActive: 1, loaded: true }], active: tabId('t1') },
  };
}

const onActions = ['user.change-password', 'user.grant-role', 'user.revoke-role', 'user.delete'];
const onRoles = ['user.edit-role', 'user.delete-role'];

describe('user.show', () => {
  it('is offered by Go to on a MongoDB connection, read-only or not, and not on Redis', () => {
    expect(isOffered(stateOn(local), 'user.show')).toBe(true);
    expect(isOffered(stateOn(production), 'user.show')).toBe(true);
    expect(isOffered(stateOn(redisConnection()), 'user.show')).toBe(false);
  });

  it('offers the commands on a user or a role while the page is the active tab, and none on a read-only connection', () => {
    for (const id of [...onActions, ...onRoles]) {
      expect(isOffered(stateOn(local, 'users'), id)).toBe(true);
      expect(isOffered(stateOn(local), id)).toBe(false);
      expect(isOffered(stateOn(local, 'server'), id)).toBe(false);
      expect(isOffered(stateOn(production, 'users'), id)).toBe(false);
    }
  });
});

describe('user.create', () => {
  afterEach(() => {
    forgetPasswords();
    vi.unstubAllGlobals();
  });

  it('is started from the page on the connection, so that the Log names the database of the step whole', () => {
    const shown = pageView({
      connection: local.id,
      readOnly: false,
      section: 'users',
      database: 'shop',
      filter: '',
      builtIn: false,
      users: { items: [], loading: false },
      roles: { items: [], loading: false },
    });
    const control = shown.users.create;
    if (control?.kind !== 'start') {
      throw new Error('Expected the button that creates a user');
    }
    expect(control.target).toEqual({ kind: 'connection', connection: local.id });
    const context = { ...contextOn('user.create'), target: control.target };
    const answers = { name: 'app', database: 'shop', password: secret, roles: [], customData: '' };
    const [step] = engineSteps(planOf(create.plan(context, { args: control.args, ...answers })));
    expect(step === undefined ? '' : stepText(step, control.target)).toBe(
      'db.getSiblingDB("shop").runCommand({ createUser: "app", pwd: "***", roles: [] })',
    );
  });

  it('is offered by Go to on a connection that is not read-only', () => {
    expect(isOffered(stateOn(local), 'user.create')).toBe(true);
    expect(isOffered(stateOn(production), 'user.create')).toBe(false);
    expect(isOffered(stateOn(redisConnection()), 'user.create')).toBe(false);
  });

  it("opens again, after a name the server already has, with the dialog's answers as they were and the server's error", () => {
    const retry = {
      name: 'app',
      database: 'shop',
      roles: [{ role: 'clusterMonitor', db: 'admin' }],
      customData: '{ team: "billing" }',
    };
    const failure = 'User "app@shop" already exists';
    const question = questionOf(
      create.plan(contextOn('user.create'), started({ connection: local.id, database: 'shop', retry, failure })),
    );
    const defaults = Object.fromEntries(
      question.fields.map((field) => [field.key, field.kind === 'text' ? field.default : undefined]),
    );
    expect(defaults).toEqual({
      name: 'app',
      database: 'shop',
      password: undefined,
      roles: 'clusterMonitor@admin',
      customData: '{ team: "billing" }',
    });
    expect(question.about).toEqual({ connection: local.id, failure });
  });

  it('keeps the password in the window only to open the dialog again, never sending it back through the start', async () => {
    const intents: Intent[] = [];
    const results: IntentResult[] = [{ kind: 'failed', message: 'User "app@shop" already exists' }, { kind: 'done' }];
    const start = vi.fn((intent: Intent): Promise<IntentResult> => {
      intents.push(intent);
      // The dialog opens with the password given back, and is answered.
      expect(givenPassword()).toBe(intents.length === 1 ? '' : secret);
      createAnswered({ name: 'app', database: 'shop', password: secret, roles: [], customData: '' });
      return Promise.resolve(results[intents.length - 1] ?? { kind: 'done' });
    });
    vi.stubGlobal('window', { datardo: { start } });
    await createUser({ kind: 'database', connection: local.id, database: 'shop' }, onShop({ database: 'shop' }));
    expect(intents).toHaveLength(2);
    expect(intents[1]?.args).toMatchObject({
      retry: { name: 'app', database: 'shop', roles: [], customData: '' },
      failure: 'User "app@shop" already exists',
    });
    expect(JSON.stringify(intents)).not.toContain(secret);
    expect(keepsPassword()).toBe(false);
  });

  it('leaves the password nowhere in the state once the notification of Copy password is closed (T21)', () => {
    const plan = planOf(
      create.plan(
        contextOn('user.create'),
        started(onShop(), { name: 'app', database: 'shop', password: secret, roles: [], customData: '' }),
      ),
    );
    const notify = plan.after.find((after) => after.kind === 'notify');
    if (notify?.kind !== 'notify') {
      throw new Error('Expected a notification');
    }
    const notification = {
      id: 'n1',
      level: 'success' as const,
      text: notify.text,
      ...(notify.actions === undefined ? {} : { actions: notify.actions }),
      count: 1,
      time: 0,
    };
    expect(notify.text).not.toContain(secret);
    const shown = reduceRunner(initialRunnerState, { slice: 'runner', type: 'notified', notification });
    expect(JSON.stringify(shown.notifications[0]?.actions)).toContain(secret);
    const closed = reduceRunner(shown, { slice: 'runner', type: 'notification-closed', id: 'n1' });
    expect(JSON.stringify(closed)).not.toContain(secret);
  });

  it('keeps nothing of a dialog it does not follow, nor of one closed', () => {
    createAnswered({ name: 'app', password: secret });
    expect(keepsPassword()).toBe(false);
    forgetPasswords();
    expect(givenPassword()).toBe('');
  });
});

describe('user.change-password', () => {
  it('Save in the connection replaces the password of the saved string, percent-encoded, and keeps the rest', () => {
    expect(connectionStringWithPassword('mongodb://app:old@db1:27017/?authSource=shop&tls=true', 'n3w:p@ss/word')).toBe(
      'mongodb://app:n3w%3Ap%40ss%2Fword@db1:27017/?authSource=shop&tls=true',
    );
  });

  it('Save in the connection is one app step whose text has no password', () => {
    const plan = planOf(
      changePassword(contextOn('user.change-password'), started(onShop({ user: 'app', saveInConnection: secret }))),
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ kind: 'app', action: 'connection.save-password' });
    expect(JSON.stringify([plan.title, stepTexts(plan), plan.after])).not.toContain(secret);
  });
});
