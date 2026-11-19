import { describe, expect, it } from 'vitest';
import {
  parse,
  request,
  validationRules,
  viewDefinition,
  type CollectionOptions,
} from '../../../src/features/manage/read-options';
import { manageContext, recordedOptions } from './harness';

function found(options: CollectionOptions): Extract<CollectionOptions, { kind: 'found' }> {
  if (options.kind !== 'found') {
    throw new Error('Expected a collection.');
  }
  return options;
}

describe('manage.read-options', () => {
  it('sends db.getCollectionInfos({ name: "orders" })', () => {
    const read = request(manageContext('manage.read-options'), {
      connection: 'c-local',
      database: 'shop',
      collection: 'orders',
    });
    expect(read).toEqual({
      kind: 'engine',
      requests: [
        {
          connection: 'c-local',
          request: {
            engine: 'mongodb',
            database: 'shop',
            method: 'listCollections',
            arguments: [{ name: 'orders' }],
            timeLimitMs: 10_000,
          },
        },
      ],
    });
  });

  it('gives the definition of a view on orders with its $match', () => {
    const view = found(parse([recordedOptions('view')]));
    expect(view.type).toBe('view');
    expect(viewDefinition(view.options)).toEqual({ viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] });
  });

  it('gives a pipeline that is an empty array when the server reports none', () => {
    expect(viewDefinition({ viewOn: 'orders' })).toEqual({ viewOn: 'orders', pipeline: [] });
  });

  it('gives validationLevel strict and validationAction error for a validator alone', () => {
    const rules = validationRules(found(parse([recordedOptions('validator')])).options);
    expect(rules.validationLevel).toBe('strict');
    expect(rules.validationAction).toBe('error');
    expect(validationRules({})).toEqual({ validator: {}, validationLevel: 'strict', validationAction: 'error' });
  });

  it('gives not found for a name that no longer exists', () => {
    expect(parse([recordedOptions('missing')])).toEqual({ kind: 'not-found' });
  });

  it('keeps a date inside a validator as a date', () => {
    const rules = validationRules(found(parse([recordedOptions('validator')])).options);
    expect(rules.validator['createdAt']).toEqual({ $gte: { $date: { $numberLong: '1704067200000' } } });
  });

  it('fails the read with the message of the server', () => {
    expect(() => parse([{ kind: 'error', message: 'not authorized on shop' }])).toThrow('not authorized on shop');
  });
});
