import { describe, expect, it } from 'vitest';
import { plan as add } from '../../../src/features/connection/add';
import { plan as edit } from '../../../src/features/connection/edit';
import { plan as secrets, secretKeys } from '../../../src/features/connection/secrets';
import { connectionId } from '../../../src/shared/ids';
import { contextOf, mongoConnection, on, redisConnection, stateWith } from './context';

describe('connection.add', () => {
  it('asks which engine, MongoDB first', () => {
    expect(add(contextOf('connection.add', stateWith([])), { args: null })).toMatchObject({
      kind: 'ask',
      question: {
        title: 'Add connection',
        fields: [
          {
            kind: 'pick-one',
            key: 'engine',
            choices: [
              {
                value: 'mongodb',
                label: 'MongoDB',
                description: '4.2 or later: standalone, replica set, sharded cluster, Atlas',
              },
              { value: 'redis', label: 'Redis', description: '6.2 or later: standalone or one replica' },
            ],
          },
        ],
      },
    });
  });

  it('opens the form of the engine chosen, with no step', () => {
    const outcome = add(contextOf('connection.add', stateWith([])), { args: null, engine: 'redis' });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [],
        after: [
          {
            kind: 'start',
            feature: 'tab.open',
            args: { shows: { kind: 'app', page: 'connection-form', engine: 'redis' } },
          },
        ],
      },
    });
  });

  it('`connection.add:mongodb` and `connection.add:redis` open the form of their engine without asking', () => {
    for (const engine of ['mongodb', 'redis'] as const) {
      expect(add(contextOf('connection.add', stateWith([])), { args: engine })).toMatchObject({
        kind: 'run',
        plan: { after: [{ feature: 'tab.open', args: { shows: { page: 'connection-form', engine } } }] },
      });
    }
  });

  it('does not ask when the entry point says the engine, and keeps the folder it was started on', () => {
    const outcome = add(contextOf('connection.add', stateWith([])), { args: { engine: 'mongodb', folder: 'Work' } });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        after: [
          {
            kind: 'start',
            feature: 'tab.open',
            args: { shows: { kind: 'app', page: 'connection-form', engine: 'mongodb', folder: 'Work' } },
          },
        ],
      },
    });
  });
});

describe('connection.edit', () => {
  const local = mongoConnection();
  const cache = redisConnection({ folder: 'Work' });

  it('opens the form of the connection it was started on', () => {
    expect(edit(contextOf('connection.edit', stateWith([local]), on(local)), {})).toMatchObject({
      kind: 'run',
      plan: {
        steps: [],
        after: [
          {
            kind: 'start',
            feature: 'tab.open',
            args: { shows: { kind: 'app', page: 'connection-form', edits: 'c-local' } },
          },
        ],
      },
    });
  });

  it('from Go to with no current connection, asks which, by folder', () => {
    const outcome = edit(contextOf('connection.edit', stateWith([cache, local])), {});
    expect(outcome).toMatchObject({
      kind: 'ask',
      question: {
        fields: [
          {
            key: 'connection',
            choices: [
              { value: 'c-local', label: 'Local' },
              { value: 'c-cache', label: 'Cache local', description: 'Work' },
            ],
          },
        ],
      },
    });
    expect(edit(contextOf('connection.edit', stateWith([cache, local])), { connection: 'c-cache' })).toMatchObject({
      plan: { after: [{ args: { shows: { edits: connectionId('c-cache') } } }] },
    });
  });
});

describe('connection.secrets', () => {
  const local = mongoConnection();

  it('keeps the secrets under the id of the connection', () => {
    expect(secretKeys('c-local')).toEqual({
      string: 'connection/c-local/string',
      options: 'connection/c-local/options',
    });
  });

  it('plans `delete the secrets of <name>` and `save the secrets of <name>`, showing no secret', () => {
    const deleting = secrets(contextOf('connection.secrets', stateWith([local]), on(local)), {
      args: { delete: true },
    });
    expect(deleting).toMatchObject({
      kind: 'run',
      plan: { steps: [{ action: 'secrets.delete', text: 'delete the secrets of Local' }] },
    });
    const form = { engine: 'mongodb', connectionString: 'mongodb://ada@db1/app', password: 's3cret' };
    const saving = secrets(contextOf('connection.secrets', stateWith([local]), on(local)), { args: { form } });
    expect(saving).toMatchObject({
      kind: 'run',
      plan: { steps: [{ action: 'secrets.write', text: 'save the secrets of Local' }] },
    });
    expect(saving.kind === 'run' ? saving.plan.steps.map((step) => step.text).join('\n') : '').not.toContain('s3cret');
  });
});
