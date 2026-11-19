import { describe, expect, it } from 'vitest';
import { inScope } from '../../../src/features/oplog/scope';

describe('oplog.scope', () => {
  it.each([
    [[], 'app', 'users', true],
    [['app'], 'app', 'users', true],
    [['app'], 'other', 'users', false],
    [['app.users'], 'app', 'users', true],
    [['app.users'], 'app', 'orders', false],
    [['app.*'], 'app', 'orders', true],
    [['*.logs'], 'any', 'logs', true],
    [['*.logs'], 'any', 'logs2', false],
    [['app.users', 'shop'], 'shop', 'x', true],
    [['app.logs.2024'], 'app', 'logs.2024', true],
    [['app.logs.2024'], 'app', 'logsX2024', false],
    [['a+b'], 'a+b', 'c', true],
    [['a+b'], 'aab', 'c', false],
  ])('patterns %j on %s.%s: published %s', (patterns, database, collection, published) => {
    expect(inScope(patterns, database, collection)).toBe(published);
  });

  it('never matches part of a name: app does not publish the database apps', () => {
    expect(inScope(['app'], 'apps', 'users')).toBe(false);
  });
});
