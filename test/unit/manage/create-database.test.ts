import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/manage/create-database';
import { manageContext, planOf, questionOf, readOf, started } from './harness';

const context = manageContext('manage.create-database');
const databases = [{ name: 'admin' }, { name: 'shop' }];

describe('manage.create-database', () => {
  it('reads the databases, then asks the two names', () => {
    expect(readOf(plan(context, started({})))).toEqual({
      key: 'databases',
      read: 'tree.list-databases',
      args: { connection: 'c-local' },
    });
    const question = questionOf(plan(context, started({}, { databases })));
    expect(question.title).toBe('Create database');
    expect(question.button).toBe('Create');
    expect(question.fields.map((field) => field.label)).toEqual([
      'Database name on Local',
      'Name of its first collection (MongoDB creates a database together with a collection)',
    ]);
  });

  it('with shop and orders, runs db.getSiblingDB("shop").createCollection("orders") and opens its tab', () => {
    const created = planOf(plan(context, started({}, { databases: [], name: 'shop', first: 'orders' })));
    expect(created.steps.map((step) => step.text)).toEqual(['db.getSiblingDB("shop").createCollection("orders")']);
    expect(created.danger).toEqual({ kind: 'none' });
    expect(created.after).toEqual([
      { kind: 'refresh', connection: 'c-local' },
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: 'c-local' },
        args: { shows: { kind: 'collection', connection: 'c-local', database: 'shop', collection: 'orders' } },
      },
    ]);
    expect(created.undo).toHaveProperty('cannot');
  });

  it('trims the names: " shop " creates shop', () => {
    const created = planOf(plan(context, started({}, { databases: [], name: ' shop ', first: ' orders ' })));
    expect(created.steps[0]?.text).toBe('db.getSiblingDB("shop").createCollection("orders")');
  });

  it('cannot accept an invalid name: the form is asked again with the message of manage.name-rules', () => {
    const invalid = [
      ['', 'Enter a name'],
      ['my shop', 'A database name cannot contain spaces or / \\ . " $ * < > : | ?'],
      ['a'.repeat(64), 'A database name is at most 63 bytes'],
    ] as const;
    for (const [name, message] of invalid) {
      const question = questionOf(plan(context, started({}, { databases: [], name, first: 'orders' })));
      expect(question.text).toBe(message);
    }
    const [field] = questionOf(plan(context, started({}, { databases }))).fields;
    expect(field?.kind === 'text' ? field.rules?.map((rule) => rule.message) : []).toContain('Enter a name');
  });

  it('shows This database already exists for the name of a database that exists', () => {
    const question = questionOf(plan(context, started({}, { databases, name: 'shop', first: 'orders' })));
    expect(question.text).toBe('This database already exists');
    const [field] = questionOf(plan(context, started({}, { databases }))).fields;
    expect(field?.kind === 'text' ? field.rules : []).toContainEqual({
      kind: 'not-one-of',
      values: ['admin', 'shop'],
      message: 'This database already exists',
    });
  });

  it('is refused on a read-only connection before any question', () => {
    expect(plan(context, started({ connection: 'c-production' }))).toEqual({
      kind: 'refuse',
      code: 'manage.create-database/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
