import { describe, expect, it } from 'vitest';
import { connectionId } from '../../../src/shared/ids';
import { databaseNames, databasesRead, plan } from '../../../src/features/playground/target';
import { targetLabel, type PlaygroundRun } from '../../../src/features/playground/types';
import { argsOf, cache, contextOf, firstTab, local, planOf, production, questionOf, withPlayground } from './context';

const found = { databases: ['admin', 'shop'] };

describe('playground.target', () => {
  it('asks for the connection, listing the MongoDB ones with current, connected and read-only', () => {
    const state = withPlayground('a = 1', {}, { saved: [local, production, cache] });
    const question = questionOf(plan(contextOf('playground.target', state), {}));
    expect(question.title).toBe('Playground connection');
    expect(question.text).toBe('Connection the playground runs on');
    const [field] = question.fields;
    expect(field?.kind === 'pick-one' ? field.choices : []).toEqual([
      { value: local.id, label: 'Local', description: 'current · connected' },
      { value: production.id, label: 'Production', description: 'read-only' },
    ]);
  });

  it('reads the databases of the connection picked, then asks for one, with Other database…', () => {
    const state = withPlayground('a = 1');
    expect(plan(contextOf('playground.target', state), { connection: local.id })).toEqual({
      kind: 'read',
      need: { key: 'databases', read: 'playground.target:databases', args: { connection: local.id } },
    });
    const question = questionOf(
      plan(contextOf('playground.target', state), { connection: local.id, databases: found }),
    );
    expect(question.title).toBe('Default database on Local');
    expect(question.text).toBe('Used until the script calls use("…")');
    const [field] = question.fields;
    expect(field?.kind === 'pick-one' ? field.choices.map((each) => each.label) : []).toEqual([
      'admin',
      'shop',
      'Other database…',
    ]);
  });

  it('asks for a name after Other database…, which may not be empty', () => {
    const state = withPlayground('a = 1');
    const question = questionOf(
      plan(contextOf('playground.target', state), { connection: local.id, databases: found, database: '' }),
    );
    expect(question.title).toBe('Default database');
    expect(question.fields[0]).toMatchObject({
      kind: 'text',
      label: 'Database name',
      rules: [{ kind: 'not-empty', message: 'Required' }],
    });
    const chosen = planOf(
      plan(contextOf('playground.target', state), {
        connection: local.id,
        databases: found,
        database: '',
        name: 'reports',
      }),
    );
    expect(chosen.steps[0]?.text).toBe('set the playground Playground 1 to Local › reports');
  });

  it('sets the playground to Production and shop, labelled read-only', () => {
    const state = withPlayground('a = 1');
    const chosen = planOf(
      plan(contextOf('playground.target', state), { connection: production.id, databases: found, database: 'shop' }),
    );
    expect(argsOf(chosen, 'playground.set-target')).toEqual({ tab: 't1', connection: production.id, database: 'shop' });
    expect(targetLabel('Production', 'shop', true)).toBe('Production › shop (read-only)');
  });

  it('refuses a connection that cannot be reached, and one with no MongoDB connection', () => {
    const state = withPlayground('a = 1');
    expect(
      plan(contextOf('playground.target', state), { connection: local.id, databases: { error: 'timed out' } }),
    ).toEqual({
      kind: 'refuse',
      code: 'playground.target/not-connected',
      message: 'Could not connect to Local: timed out',
    });
    expect(
      plan(contextOf('playground.target', withPlayground('a', {}, { saved: [cache], states: {} })), {}),
    ).toMatchObject({
      code: 'playground.target/no-connection',
    });
  });

  it('changes nothing while a run of the playground is in progress', () => {
    const run: PlaygroundRun = {
      tab: firstTab,
      title: 'Playground 1',
      connection: connectionId('c-local'),
      connectionName: 'Local',
      database: 'shop',
      startedAt: 0,
      firstLine: 1,
    };
    const state = withPlayground('a = 1', { run });
    expect(planOf(plan(contextOf('playground.target', state), {})).steps).toEqual([]);
  });

  it('reads the names of listDatabases, sorted, or the error', () => {
    expect(databaseNames({ databases: [{ name: 'shop' }, { name: 'admin' }] })).toEqual(['admin', 'shop']);
    expect(databasesRead.parse([{ error: 'refused' }], null)).toEqual({ error: 'refused' });
  });
});
