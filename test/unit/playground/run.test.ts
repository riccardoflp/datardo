import { describe, expect, it } from 'vitest';
import { connectionId, tabId } from '../../../src/shared/ids';
import { plan, runText } from '../../../src/features/playground/run';
import type { PlaygroundRun } from '../../../src/features/playground/types';
import {
  argsOf,
  cache,
  contextOf,
  firstTab,
  local,
  planOf,
  playgroundOf,
  playgroundTabOf,
  production,
  questionOf,
  stateOf,
  withPlayground,
} from './context';

const script = ['use("shop");', '', 'const a = 1;', 'db.orders', '  .find({})', 'print(a);'].join('\n');

function offsetOfLine(source: string, line: number): number {
  return (
    source
      .split('\n')
      .slice(0, line - 1)
      .join('\n').length + (line > 1 ? 1 : 0)
  );
}

const running: PlaygroundRun = {
  tab: tabId('t2'),
  title: 'Playground 2',
  connection: connectionId('c-local'),
  connectionName: 'Local',
  database: 'shop',
  startedAt: 0,
  firstLine: 1,
};

describe('playground.run', () => {
  it('runs the whole script with Run all, titled Playground 1', () => {
    const found = planOf(plan(contextOf('playground.run', withPlayground(script)), { args: 'all' }));
    expect(found.title).toBe('Playground 1');
    expect(found.steps).toHaveLength(1);
    expect(found.steps[0]?.text).toBe('run Playground 1 on Local › shop');
    const args = argsOf(found, 'playground.run');
    expect(args).toMatchObject({
      tab: 't1',
      title: 'Playground 1',
      connection: local.id,
      database: 'shop',
      firstLine: 1,
    });
    expect(String(args['code'])).toContain('async');
    expect(found.danger).toEqual({ kind: 'none' });
    expect(found.publishes).toBe(false);
  });

  it('runs the selected lines 3 to 5 alone, titled with their lines', () => {
    const selection = { from: offsetOfLine(script, 3), to: offsetOfLine(script, 6) - 1 };
    const found = planOf(
      plan(contextOf('playground.run', withPlayground(script)), { args: { part: 'selection', selection } }),
    );
    expect(found.title).toBe('Playground 1 (lines 3–5)');
    expect(argsOf(found, 'playground.run')).toMatchObject({ firstLine: 3, database: 'shop' });
  });

  it('titles a selection inside line 4 with its one line', () => {
    const from = offsetOfLine(script, 4);
    const ran = runText(
      script,
      'selection',
      { selection: { from, to: from + 2 } },
      {
        title: 'Playground 1',
        playground: playgroundOf(script),
      },
    );
    expect(ran).toMatchObject({ title: 'Playground 1 (line 4)', text: 'db', firstLine: 4 });
  });

  it('runs the statement of a Run button alone, on the database of the use before it', () => {
    const ran = runText(
      script,
      'statement',
      { line: 4 },
      {
        title: 'Playground 1',
        playground: playgroundOf(script, { defaultDatabase: 'test' }),
      },
    );
    expect(ran).toEqual({
      text: 'db.orders\n  .find({})',
      firstLine: 4,
      title: 'Playground 1 (lines 4–5)',
      database: 'shop',
    });
  });

  it('runs a statement on the default database without a use before it', () => {
    const source = 'db.orders.find()\nuse("shop")';
    const ran = runText(
      source,
      'statement',
      { caret: 0 },
      { title: 'Playground 1', playground: playgroundOf(source, { defaultDatabase: 'test' }) },
    );
    expect(ran.database).toBe('test');
  });

  it('runs the whole script with Ctrl+Enter when nothing is selected', () => {
    const found = planOf(plan(contextOf('playground.run', withPlayground(script)), { args: 'selection' }));
    expect(found.title).toBe('Playground 1');
  });

  it('starts nothing for a syntax error: its error is the result, on the line of the script', () => {
    const broken = 'a = 1;\n\ndb.orders.find({';
    const args = argsOf(planOf(plan(contextOf('playground.run', withPlayground(broken)), {})), 'playground.run');
    expect(args).not.toHaveProperty('code');
    expect(args['error']).toEqual({ message: 'SyntaxError: Unexpected token', line: 3 });
  });

  it('reads the tree again after a text that writes, and not after one that reads', () => {
    const writing = planOf(plan(contextOf('playground.run', withPlayground('db.orders.insertOne({ _id: 1 })')), {}));
    expect(argsOf(writing, 'playground.run')['writes']).toBe(true);
    const reading = planOf(plan(contextOf('playground.run', withPlayground('db.orders.find()')), {}));
    expect(argsOf(reading, 'playground.run')['writes']).toBe(false);
  });

  it('refuses with no playground tab active', () => {
    expect(plan(contextOf('playground.run', stateOf()), { args: 'all' })).toEqual({
      kind: 'refuse',
      code: 'playground.run/no-playground',
      message: 'Open a playground to run it: New playground creates one.',
    });
  });

  it('refuses a second run while one is in progress in another tab', () => {
    const state = stateOf({
      tabs: [playgroundTabOf(firstTab, 'Playground 1'), playgroundTabOf(tabId('t2'), 'Playground 2')],
      playgrounds: { [firstTab]: playgroundOf('1'), t2: playgroundOf('2', { tab: tabId('t2'), run: running }) },
    });
    expect(plan(contextOf('playground.run', state), {})).toEqual({
      kind: 'refuse',
      code: 'playground.run/running',
      message: 'A playground is already running.',
    });
  });

  it('connects a connection that is not connected first, and refuses when it cannot', () => {
    const state = withPlayground('1', {}, { states: {} });
    expect(plan(contextOf('playground.run', state), {})).toEqual({
      kind: 'read',
      need: { key: 'connected', read: 'playground.run:connect', args: { connection: local.id } },
    });
    expect(plan(contextOf('playground.run', state), { connected: 'refused' })).toEqual({
      kind: 'refuse',
      code: 'playground.run/not-connected',
      message: 'Could not connect to Local: refused',
    });
    expect(planOf(plan(contextOf('playground.run', state), { connected: null })).steps).toHaveLength(1);
  });

  it("asks for another connection when the playground's was removed, and sets it first", () => {
    const state = withPlayground('1', {}, { saved: [production, cache], states: { [production.id]: 'connected' } });
    expect(questionOf(plan(contextOf('playground.run', state), {})).title).toBe('Playground connection');
    const found = planOf(
      plan(contextOf('playground.run', state), {
        connection: production.id,
        databases: { databases: ['shop'] },
        database: 'shop',
      }),
    );
    expect(found.steps.map((each) => each.kind === 'app' && each.action)).toEqual([
      'playground.set-target',
      'playground.run',
    ]);
    expect(argsOf(found, 'playground.run')['connection']).toBe(production.id);
  });
});
