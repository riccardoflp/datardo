import { describe, expect, it } from 'vitest';
import { namesMatch, singular, stem } from '../../../src/features/relation/name-match';

describe('relation.name-match', () => {
  it.each([
    ['customerId', 'customer', 'customers', 'customer', true],
    ['customer_id', 'customer', 'customers', 'customer', true],
    ['user_ids', 'user', 'users', 'user', true],
    ['authorRef', 'author', 'authors', 'author', true],
    ['orderKey', 'order', 'orders', 'order', true],
    ['categoryId', 'category', 'categories', 'category', true],
    ['addressId', 'address', 'addresses', 'address', true],
    ['boxId', 'box', 'boxes', 'box', true],
    ['personId', 'person', 'people', 'person', true],
    ['billing.customerId', 'customer', 'crm.customers', 'customer', true],
    ['customers', 'customers', 'customers', 'customer', true],
    ['line-item_id', 'lineitem', 'line_items', 'lineitem', true],
    ['parentId', 'parent', 'categories', 'category', false],
    ['id', '', 'ids', 'id', false],
    ['statusId', 'status', 'statuses', 'statuse', false],
    ['paid', 'pa', 'pas', 'pa', true],
  ] as const)(
    '%s: stem %s, %s: singular %s, match %s',
    (...[field, fieldStem, collection, collectionSingular, match]) => {
      expect(stem(field.split('.').at(-1) ?? field)).toBe(fieldStem);
      expect(singular(collection.split('.').at(-1) ?? collection)).toBe(collectionSingular);
      expect(namesMatch(field, collection)).toBe(match);
    },
  );

  it('never counts the case: CUSTOMERID matches Customers', () => {
    expect(namesMatch('CUSTOMERID', 'Customers')).toBe(true);
  });

  it('matches customerIds and customer_refs with customers', () => {
    expect(namesMatch('customerIds', 'customers')).toBe(true);
    expect(namesMatch('customer_refs', 'customers')).toBe(true);
  });

  it('gives class the stem class, which matches classes', () => {
    expect(stem('class')).toBe('class');
    expect(namesMatch('class', 'classes')).toBe(true);
  });
});
