import { describe, expect, it } from 'vitest';
import { tabId } from '../../../src/shared/ids';
import { collectionReference, exampleScript, plan } from '../../../src/features/playground/open';
import { argsOf, cache, contextOf, local, planOf, playgroundTabOf, production, questionOf, stateOf } from './context';

const example = [
  '// Datardo playground: Ctrl+Enter runs the script (or the selected lines) on the connection shown above.',
  '// mongosh syntax; the value of the last expression is shown below, print() and printjson() write to the output.',
  '',
  'use("shop");',
  '',
  'db.orders.find({}).limit(20);',
].join('\n');

describe('playground.open', () => {
  it('opens Playground 1 on a collection with the example', () => {
    const outcome = plan(
      contextOf('playground.open', stateOf(), {
        kind: 'collection',
        connection: local.id,
        database: 'shop',
        collection: 'orders',
      }),
      {},
    );
    const found = planOf(outcome);
    expect(found.steps[0]?.text).toBe('open the playground Playground 1');
    expect(argsOf(found, 'playground.open')).toEqual({
      connection: local.id,
      database: 'shop',
      title: 'Playground 1',
      text: example,
      caret: 'end',
    });
    expect(found.danger).toEqual({ kind: 'none' });
    expect(found.undo).toEqual({ cannot: 'Cannot be undone, and needs none: the tab is closed.' });
  });

  it('numbers the next playground with the lowest number free', () => {
    const target = { kind: 'connection' as const, connection: local.id };
    const withFirst = stateOf({ tabs: [playgroundTabOf(tabId('t1'), 'Playground 1')] });
    expect(argsOf(planOf(plan(contextOf('playground.open', withFirst, target), {})), 'playground.open')['title']).toBe(
      'Playground 2',
    );
    const withSecond = stateOf({ tabs: [playgroundTabOf(tabId('t2'), 'Playground 2')] });
    expect(argsOf(planOf(plan(contextOf('playground.open', withSecond, target), {})), 'playground.open')['title']).toBe(
      'Playground 1',
    );
  });

  it('ends with db.getCollectionNames() on a database, and db.getMongo().getDBNames() on test for a connection', () => {
    expect(exampleScript({ kind: 'database', database: 'shop' }).split('\n').pop()).toBe('db.getCollectionNames();');
    const onConnection = argsOf(
      planOf(plan(contextOf('playground.open', stateOf(), { kind: 'connection', connection: local.id }), {})),
      'playground.open',
    );
    expect(onConnection['database']).toBe('test');
    expect(String(onConnection['text'])).not.toContain('use(');
    expect(String(onConnection['text']).split('\n').pop()).toBe('db.getMongo().getDBNames();');
  });

  it('writes db.getCollection("…") for a name that is not an identifier or is a method of db', () => {
    expect(collectionReference('orders')).toBe('db.orders');
    for (const name of ['order-items', 'getCollection', 'getName', 'aggregate', 'stats', 'version']) {
      expect(collectionReference(name)).toBe(`db.getCollection(${JSON.stringify(name)})`);
    }
  });

  it('holds the script another feature gives, with the caret at its first line', () => {
    const found = planOf(
      plan(contextOf('playground.open', stateOf(), { kind: 'database', connection: local.id, database: 'shop' }), {
        args: { script: 'db.a.find()' },
      }),
    );
    expect(argsOf(found, 'playground.open')).toMatchObject({ text: 'db.a.find()', caret: 'start' });
  });

  it('opens on a read-only connection', () => {
    const found = planOf(
      plan(
        contextOf('playground.open', stateOf(), { kind: 'database', connection: production.id, database: 'shop' }),
        {},
      ),
    );
    expect(argsOf(found, 'playground.open')['connection']).toBe(production.id);
  });

  it('opens on the current MongoDB connection from Go to, and asks for one when there is none', () => {
    const current = planOf(plan(contextOf('playground.open', stateOf({ current: local })), {}));
    expect(argsOf(current, 'playground.open')).toMatchObject({ connection: local.id, database: 'test' });
    expect(
      questionOf(plan(contextOf('playground.open', stateOf({ current: cache, saved: [local, cache] })), {})).title,
    ).toBe('Playground connection');
  });

  it('refuses with only Redis connections saved', () => {
    expect(plan(contextOf('playground.open', stateOf({ saved: [cache], states: {} })), {})).toEqual({
      kind: 'refuse',
      code: 'playground.open/no-connection',
      message: 'Add a MongoDB connection first.',
    });
  });
});
