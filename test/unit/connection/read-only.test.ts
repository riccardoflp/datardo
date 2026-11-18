import { describe, expect, it } from 'vitest';
import { plan as allowChanges } from '../../../src/features/connection/allow-changes';
import { plan as readOnly } from '../../../src/features/connection/read-only';
import { contextOf, mongoConnection, on, redisConnection, stateWith } from './context';

describe('connection.read-only', () => {
  it('plans `make <name> read-only` with no confirmation', () => {
    const local = mongoConnection();
    expect(readOnly(contextOf('connection.read-only', stateWith([local]), on(local)), {})).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          {
            kind: 'app',
            action: 'connection.set-read-only',
            args: { connection: 'c-local', readOnly: true },
            text: 'make Local read-only',
          },
        ],
        danger: { kind: 'none' },
      },
    });
  });

  it('does nothing on a connection that is read-only already', () => {
    const local = mongoConnection({ readOnly: true });
    const outcome = readOnly(contextOf('connection.read-only', stateWith([local]), on(local)), {});
    expect(outcome.kind === 'run' ? outcome.plan.steps : undefined).toEqual([]);
  });
});

describe('connection.allow-changes', () => {
  it('confirms what can then be modified, for each engine, with the button Allow changes', () => {
    const local = mongoConnection({ readOnly: true });
    expect(allowChanges(contextOf('connection.allow-changes', stateWith([local]), on(local)), {})).toMatchObject({
      kind: 'run',
      plan: {
        title: 'Allow changes through Local?',
        steps: [{ args: { connection: 'c-local', readOnly: false }, text: 'allow changes through Local' }],
        danger: {
          kind: 'confirm',
          text: 'Documents, indexes, collections and databases can then be modified from Datardo.',
          button: 'Allow changes',
        },
      },
    });
    const cache = redisConnection({ readOnly: true });
    expect(allowChanges(contextOf('connection.allow-changes', stateWith([cache]), on(cache)), {})).toMatchObject({
      plan: { danger: { text: 'Keys and their values can then be modified from Datardo.' } },
    });
  });

  it('does nothing on a connection that is not read-only', () => {
    const local = mongoConnection();
    const outcome = allowChanges(contextOf('connection.allow-changes', stateWith([local]), on(local)), {});
    expect(outcome.kind === 'run' ? outcome.plan.steps : undefined).toEqual([]);
  });
});
