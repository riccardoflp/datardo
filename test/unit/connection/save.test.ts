import { describe, expect, it } from 'vitest';
import { newConnectionId, plan } from '../../../src/features/connection/save';
import { tabId } from '../../../src/shared/ids';
import type { Json } from '../../../src/shared/engine-request';
import type { Outcome, Plan } from '../../../src/shared/feature';
import { contextOf, formOf, mongoConnection, stateWith } from './context';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`not a plan: ${outcome.kind}`);
  }
  return outcome.plan;
}

const local = mongoConnection();

function saving(args: Json, state = stateWith([local])): Outcome {
  return plan(contextOf('connection.save', state), { args });
}

describe('connection.save', () => {
  it('saves a new connection with a new id and its name, and says so', () => {
    const form = formOf('mongodb', { connectionString: 'mongodb://ada@db9:27017/app' });
    const saved = planOf(saving({ form, connection: null }));
    expect(saved.steps.map((step) => step.text)).toEqual(['save the connection db9:27017']);
    expect(saved.steps[0]).toMatchObject({
      kind: 'app',
      action: 'connection.write',
      args: { connection: 'c-mi3etw5c', isNew: true },
    });
    expect(saved.danger).toEqual({ kind: 'none' });
    expect(saved.undo).toEqual({ cannot: 'The previous settings and secrets are not kept.' });
    expect(saved.after).toEqual([{ kind: 'notify', level: 'success', text: 'Connection db9:27017 saved' }]);
  });

  it('gives a new id that no other connection has', () => {
    expect(newConnectionId(1_763_400_000_000, [])).toBe('c-mi3etw5c');
    expect(newConnectionId(1_763_400_000_000, ['c-mi3etw5c', 'c-mi3etw5c-2'])).toBe('c-mi3etw5c-3');
  });

  it('leaves a connected connection connected when only its name changes', () => {
    const form = formOf('mongodb', { name: 'Renamed', connectionString: 'mongodb://ada@db1:27017/app' });
    const saved = planOf(saving({ form, connection: local.id }, stateWith([local], { [local.id]: 'connected' })));
    expect(saved.steps.map((step) => step.text)).toEqual(['save the connection Renamed']);
  });

  it('disconnects a connected connection first when another host is saved', () => {
    const form = formOf('mongodb', { name: 'Local', connectionString: 'mongodb://ada@db2:27017/app' });
    const saved = planOf(saving({ form, connection: local.id }, stateWith([local], { [local.id]: 'connected' })));
    expect(saved.steps.map((step) => step.text)).toEqual(['disconnect Local', 'save the connection Local']);
  });

  it('asks the confirmation of allow-changes when Read-only is turned off', () => {
    const readOnly = mongoConnection({ readOnly: true });
    const form = formOf('mongodb', { name: 'Local', connectionString: 'mongodb://ada@db1:27017/app' });
    const saved = planOf(saving({ form, connection: readOnly.id }, stateWith([readOnly])));
    expect(saved.title).toBe('Allow changes through Local?');
    expect(saved.danger).toEqual({
      kind: 'confirm',
      text: 'Documents, indexes, collections and databases can then be modified from Datardo.',
      button: 'Allow changes',
    });
    const stillReadOnly = planOf(
      saving({ form: { ...form, readOnly: true }, connection: readOnly.id }, stateWith([readOnly])),
    );
    expect(stillReadOnly.danger).toEqual({ kind: 'none' });
  });

  it('with Save and connect, makes it current and connects it after saving', () => {
    const form = formOf('mongodb', { name: 'Local', connectionString: 'mongodb://ada@db1:27017/app' });
    const saved = planOf(saving({ form, connection: local.id, connect: true }));
    expect(saved.after.slice(1)).toEqual([
      {
        kind: 'start',
        feature: 'nav.switch-connection',
        target: { kind: 'connection', connection: local.id },
        args: { connection: local.id },
      },
      { kind: 'start', feature: 'connection.connect', target: { kind: 'connection', connection: local.id } },
    ]);
  });

  it('refuses what the form refuses, with the code of connection.read-form', () => {
    const form = formOf('mongodb', { connectionString: 'localhost:27017' });
    expect(saving({ form, connection: null })).toEqual({
      kind: 'refuse',
      code: 'connection.read-form/connection-string',
      message: 'The connection string must start with mongodb:// or mongodb+srv://',
    });
  });

  it('makes the first connection saved the current one, and closes the form tab after saving', () => {
    const form = formOf('mongodb', { name: 'First', connectionString: 'mongodb://db9:27017' });
    const state = stateWith([]);
    const formTab = {
      id: tabId('t3'),
      shows: { kind: 'app' as const, page: 'connection-form', engine: 'mongodb' as const },
      lastActive: 0,
      loaded: true,
    };
    const withForm = { ...state, tabs: { ...state.tabs, tabs: [formTab], active: formTab.id } };
    const saved = planOf(plan(contextOf('connection.save', withForm), { args: { form, connection: null } }));
    expect(saved.steps.map((step) => step.text)).toEqual([
      'save the connection First',
      'make First the current connection',
    ]);
    expect(saved.after[0]).toEqual({
      kind: 'start',
      feature: 'tab.close',
      target: { kind: 'app' },
      args: { tab: formTab.id },
    });
  });
});
