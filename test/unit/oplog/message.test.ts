import { describe, expect, it } from 'vitest';
import { idStringify, meteorId, oplogMessage } from '../../../src/features/oplog/message';
import { defaultOplogSettings } from '../../../src/features/oplog/types';

describe('oplog.message', () => {
  it('sends an update to the collection, each namespace and the document, with its fields', () => {
    const settings = { prefix: 'p:', namespaces: ['ns1', 'ns2'], scope: [] };
    expect(oplogMessage(settings, 'users', { e: 'u', id: 'abc', fields: ['a', 'b.c'] })).toEqual({
      channels: ['p:users', 'p:ns1::users', 'p:ns2::users', 'p:users::abc'],
      message: '{"e":"u","d":{"_id":"abc"},"f":["a","b.c"]}',
    });
  });

  it('sends an ObjectId as Meteor writes it', () => {
    expect(oplogMessage(defaultOplogSettings, 'users', { e: 'i', id: { $oid: '0123456789abcdef01234567' } })).toEqual({
      channels: ['users', 'users::0123456789abcdef01234567'],
      message: '{"e":"i","d":{"_id":{"$type":"oid","$value":"0123456789abcdef01234567"}}}',
    });
  });

  it('sends a number _id as a number, its channel with ~', () => {
    const expected = { channels: ['c', 'c::~3'], message: '{"e":"r","d":{"_id":3}}' };
    expect(oplogMessage(defaultOplogSettings, 'c', { e: 'r', id: 3 })).toEqual(expected);
    expect(oplogMessage(defaultOplogSettings, 'c', { e: 'r', id: { $numberInt: '3' } })).toEqual(expected);
  });

  it('sends nothing for an _id that cannot be a Meteor id', () => {
    expect(oplogMessage(defaultOplogSettings, 'c', { e: 'i', id: { a: { $numberInt: '1' } } })).toBeUndefined();
  });

  it.each([
    ['abc', 'abc'],
    ['-x', '--x'],
    ['~x', '-~x'],
    ['{x', '-{x'],
    ['0123456789abcdef01234567', '-0123456789abcdef01234567'],
    [5, '~5'],
  ])('idStringify(%j) is %s', (id, text) => {
    expect(idStringify(id)).toBe(text);
  });

  it('sends nothing for a Long beyond the safe integers, and 42 for a Long of 42', () => {
    expect(meteorId({ $numberLong: '9007199254740993' })).toBeUndefined();
    expect(
      oplogMessage(defaultOplogSettings, 'c', { e: 'i', id: { $numberLong: '9007199254740993' } }),
    ).toBeUndefined();
    expect(meteorId({ $numberLong: '42' })).toBe(42);
  });
});
