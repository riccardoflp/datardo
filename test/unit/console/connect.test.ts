import { describe, expect, it } from 'vitest';
import { plan, savedDatabase, savedUser } from '../../../src/features/console/connect';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Outcome, Plan } from '../../../src/shared/feature';
import type { AppState } from '../../../src/shared/state';
import { cacheLocal, consoleContext, consoleOn, consoleState, session } from './context';
import { redisConnection } from '../connection/context';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

const withPassword = redisConnection({
  hosts: 'cache.example.com:6379',
  address: 'redis://app@cache.example.com:6379/2',
  secrets: { ...noSecretsSaved, connectionString: true, password: true },
});

function stateOf(connection = withPassword, consoles = [] as Parameters<typeof consoleState>[0]): AppState {
  const state = consoleState(consoles);
  return { ...state, connections: { ...state.connections, saved: [connection] } };
}

describe('console.connect', () => {
  it('opens a connection of its own, says HELLO 3 with the user and the name datardo-console, and selects db2', () => {
    const opened = planOf(plan(consoleContext('console.connect', stateOf(), withPassword), {}));
    expect(opened.steps.map((step) => step.text)).toEqual([
      'open a connection to cache.example.com:6379 for the console',
      'HELLO 3 AUTH app *** SETNAME datardo-console',
      'SELECT 2',
    ]);
    expect(opened.steps[2]).toMatchObject({ kind: 'engine', connection: 'c-cache#console', writes: false });
    expect(opened.danger).toEqual({ kind: 'none' });
    expect(JSON.stringify(opened)).not.toContain('s3cret');
  });

  it('leaves AUTH out without a password, and names the user default with a password and no user name', () => {
    const noPassword = planOf(plan(consoleContext('console.connect', stateOf(cacheLocal), cacheLocal), {}));
    expect(noPassword.steps.map((step) => step.text)).toEqual([
      'open a connection to cache:6379 for the console',
      'HELLO 3 SETNAME datardo-console',
    ]);
    const noUser = redisConnection({
      address: 'redis://cache',
      secrets: { ...noSecretsSaved, connectionString: true, password: true },
    });
    const opened = planOf(plan(consoleContext('console.connect', stateOf(noUser), noUser), {}));
    expect(opened.steps[1]?.text).toBe('HELLO 3 AUTH default *** SETNAME datardo-console');
  });

  it('goes on with AUTH app *** and CLIENT SETNAME datardo-console when HELLO is unknown to the server', () => {
    const opened = planOf(plan(consoleContext('console.connect', stateOf(), withPassword), {}));
    const hello = opened.steps[1];
    expect(hello?.onFailure).toMatchObject({ kind: 'instead', codes: ['NOPROTO', 'ERR unknown command'] });
    const instead = hello?.onFailure?.kind === 'instead' ? hello.onFailure.steps.map((step) => step.text) : [];
    expect(instead).toEqual(['AUTH app ***', 'CLIENT SETNAME datardo-console']);
  });

  it('selects the database the console was on when it opens again', () => {
    const console = consoleOn(withPassword, { session: session({ database: 5 }) });
    const opened = planOf(plan(consoleContext('console.connect', stateOf(withPassword, [console]), withPassword), {}));
    expect(opened.steps.map((step) => step.text)).toContain('SELECT 5');
  });

  it('refuses a connection that is not connected', () => {
    const state = stateOf();
    const disconnected = { ...state, connections: { ...state.connections, live: {} } } as AppState;
    expect(plan(consoleContext('console.connect', disconnected, withPassword), {})).toEqual({
      kind: 'refuse',
      code: 'console.connect/not-connected',
      message: 'Cache local is not connected.',
    });
  });

  it('reads the database and the user of the saved connection from its address', () => {
    expect(savedDatabase(withPassword)).toBe(2);
    expect(savedDatabase(cacheLocal)).toBe(0);
    expect(savedUser(withPassword)).toBe('app');
    expect(savedUser(redisConnection({ address: 'rediss://my%20user@h:6380/0' }))).toBe('my user');
  });
});
