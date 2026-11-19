import { describe, expect, it } from 'vitest';
import { parse } from '../../../src/features/manage/read-options';
import { plan, sampleRequest, view, type ValidationState } from '../../../src/features/manage/validation';
import { manageContext, planOf, recordedOptions, started } from './harness';
import { summaryOf } from './summary';

const withRules: ValidationState = {
  database: 'shop',
  collection: 'orders',
  readOnly: false,
  read: { kind: 'read', options: parse([recordedOptions('validator')]) },
};
const noRules: ValidationState = {
  ...withRules,
  read: { kind: 'read', options: { kind: 'found', type: 'collection', options: {} } },
};
const documents = Array.from({ length: 37 }, (_, index) => ({ _id: index, status: 'paid' }));

describe('manage.validation', () => {
  it('shows the validator, strict and error when unset, and no note', () => {
    const shown = view(withRules);
    expect(shown.editor?.text).toBe(
      '{\n' +
        '  validator: { createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") }, status: { $type: "string" } },\n' +
        '  validationLevel: "strict",\n' +
        '  validationAction: "error"\n' +
        '}',
    );
    expect(shown.note).toBeUndefined();
    expect(shown.readSample).toBe(false);
    expect(shown.toolbar.save).toMatchObject({ enabled: false, element: 'manage.edit-validation@toolbar' });
  });

  it('reads a sample of 1,000 documents for a collection without rules', () => {
    const asking = view(noRules);
    expect(asking).toMatchObject({ state: 'loading', readSample: true });
    expect(asking.message).toBe('Reading 1,000 documents to propose rules…');
    expect(view({ ...noRules, sample: { kind: 'reading' } }).readSample).toBe(false);
    expect(sampleRequest('shop', 'orders')).toEqual({
      engine: 'mongodb',
      database: 'shop',
      collection: 'orders',
      method: 'aggregate',
      arguments: [[{ $sample: { size: 1000 } }]],
      timeLimitMs: 60_000,
    });
  });

  it('proposes a generated $jsonSchema, strict and error, with the number of documents sampled', () => {
    const generated = view({ ...noRules, sample: { kind: 'read', summary: summaryOf(documents) } });
    expect(generated.editor?.text).toBe(
      '{\n' +
        '  validator: { $jsonSchema: { bsonType: "object", required: ["_id", "status"], properties: ' +
        '{ _id: { bsonType: "int" }, status: { bsonType: "string" } } } },\n' +
        '  validationLevel: "strict",\n' +
        '  validationAction: "error"\n' +
        '}',
    );
    expect(generated.note).toBe(
      'orders has no validation rules: this $jsonSchema was generated from 37 documents. Review it, then save ' +
        '(Ctrl+S) to apply it. validationAction "warn" only logs invalid documents.',
    );
    expect(generated.toolbar.save?.enabled).toBe(true);
    expect(generated.toolbar.discard?.enabled).toBe(false);
  });

  it('shows validator: {} and no note for an empty collection without rules', () => {
    const empty = view({ ...noRules, sample: { kind: 'read', summary: summaryOf([]) } });
    expect(empty.editor?.text).toBe(
      '{\n  validator: {},\n  validationLevel: "strict",\n  validationAction: "error"\n}',
    );
    expect(empty.note).toBeUndefined();
    expect(empty.toolbar.save?.enabled).toBe(false);
  });

  it('on a read-only connection, reads no sample, says there are no rules, and has no Save', () => {
    const readOnly = view({ ...noRules, readOnly: true });
    expect(readOnly.readSample).toBe(false);
    expect(readOnly.note).toBe('orders has no validation rules.');
    expect(readOnly.editor?.readOnly).toBe(true);
    expect(readOnly.toolbar.save).toBeUndefined();
  });

  it('sends nothing to change the collection: opening the section only reads', () => {
    const context = manageContext('manage.validation');
    const opened = planOf(plan(context, started({ database: 'shop', collection: 'orders' })));
    expect(opened.steps).toEqual([]);
    expect(opened.after).toEqual([
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: 'c-local' },
        args: {
          shows: { kind: 'collection', connection: 'c-local', database: 'shop', collection: 'orders' },
          section: 'validation',
        },
      },
    ]);
  });

  it('shows a collection that no longer exists', () => {
    const gone = view({ ...withRules, read: { kind: 'read', options: { kind: 'not-found' } } });
    expect(gone).toMatchObject({ state: 'gone', message: 'The collection shop.orders no longer exists.' });
  });
});
