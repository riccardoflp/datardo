import { describe, expect, it } from 'vitest';
import { stepText, type StepToWrite } from '../../../src/features/runner/step-text';
import { redisCommand, utf8Bytes, type Json, type MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';

const local = connectionId('local');
const orders: Target = { kind: 'collection', connection: local, database: 'shop', collection: 'orders' };

function mongo(method: string, args: readonly Json[], collection: string | null = 'orders', database = 'shop') {
  const request: MongoRequest =
    collection === null
      ? { engine: 'mongodb', database, method, arguments: args }
      : { engine: 'mongodb', database, collection, method, arguments: args };
  return { kind: 'engine', connection: local, writes: true, request } satisfies StepToWrite;
}

function redis(...words: readonly (string | Uint8Array)[]): StepToWrite {
  return { kind: 'engine', connection: local, writes: true, request: redisCommand(0, ...words) };
}

describe('runner.step-text', () => {
  it('writes the examples of its card exactly', () => {
    const update = mongo('updateMany', [{ status: 'new' }, { $set: { status: 'paid' } }]);
    expect(stepText(update, orders)).toBe('db.orders.updateMany({ status: "new" }, { $set: { status: "paid" } })');
    expect(stepText(redis('DEL', 'orders:42'))).toBe('DEL orders:42');
    expect(stepText(redis('AUTH', 'app', 's3cret'))).toBe('AUTH app ***');
    const create = mongo('createUser', [{ user: 'app', pwd: 's3cret', roles: ['read'] }], null);
    expect(stepText(create, orders)).toBe('db.createUser({ user: "app", pwd: "***", roles: ["read"] })');
  });

  it('writes values in mongosh syntax, and another database with getSiblingDB', () => {
    const remove = mongo('deleteOne', [{ _id: { $oid: '65f1c0ffee0000000000a2c1' } }]);
    expect(stepText(remove, orders)).toBe('db.orders.deleteOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") })');
    expect(stepText(mongo('drop', [], 'orders', 'other'), orders)).toBe('db.getSiblingDB("other").orders.drop()');
    const typed = mongo('insertOne', [
      { at: { $date: { $numberLong: '0' } }, n: { $numberLong: '5' }, d: { $numberDecimal: '1.5' }, i: 3 },
    ]);
    expect(stepText(typed, orders)).toBe(
      'db.orders.insertOne({ at: ISODate("1970-01-01T00:00:00.000Z"), n: Long("5"), d: Decimal128("1.5"), i: 3 })',
    );
  });

  it('quotes a Redis argument with a space, a quote or a byte that is not printable', () => {
    const bytes = new Uint8Array([0x61, 0x00, 0x62]);
    expect(stepText(redis('SET', 'user 7', bytes, 'KEEPTTL'))).toBe('SET "user 7" "a\\x00b" KEEPTTL');
    expect(stepText(redis('SET', 'say "hi"', 'back\\slash'))).toBe('SET "say \\"hi\\"" "back\\\\slash"');
    expect(stepText(redis('SET', 'k', 'café'))).toBe('SET k café');
  });

  it('writes no secret, for every kind of step', () => {
    const steps: StepToWrite[] = [
      redis('AUTH', 's3cret'),
      redis('AUTH', 'app', 's3cret'),
      redis('HELLO', '3', 'AUTH', 'app', 's3cret'),
      redis('MIGRATE', 'h', '6379', '', '0', '5000', 'AUTH', 's3cret', 'KEYS', 'a'),
      redis('MIGRATE', 'h', '6379', '', '0', '5000', 'AUTH2', 'app', 's3cret', 'KEYS', 'a'),
      redis('CONFIG', 'SET', 'requirepass', 's3cret'),
      redis('CONFIG', 'SET', 'masterauth', 's3cret', 'maxmemory', '10mb'),
      redis('CONFIG', 'SET', 'masteruser-password', 's3cret'),
      redis('ACL', 'SETUSER', 'app', 'on', '>s3cret', '~*'),
      mongo('createUser', [{ user: 'app', pwd: 's3cret', roles: [] }], null),
      mongo('updateUser', ['app', { pwd: 's3cret' }], null),
      mongo('runCommand', [{ createUser: 'app', pwd: 's3cret', roles: [] }], null),
      { kind: 'file', action: 'write', path: 'C:\\backups\\shop.agz' },
      { kind: 'app', action: 'test.save', args: null, text: 'save the connection Local' },
    ];
    for (const step of steps) {
      expect(stepText(step, orders)).not.toContain('s3cret');
    }
    expect(stepText(redis('HELLO', '3', 'AUTH', 'app', 's3cret'))).toBe('HELLO 3 AUTH app ***');
    expect(stepText(redis('CONFIG', 'SET', 'masterauth', 's3cret', 'maxmemory', '10mb'))).toBe(
      'CONFIG SET masterauth *** maxmemory 10mb',
    );
  });

  it('writes file steps and app steps', () => {
    expect(stepText({ kind: 'file', action: 'write', path: 'C:\\backups\\shop.agz' })).toBe(
      'write C:\\backups\\shop.agz',
    );
    expect(stepText({ kind: 'file', action: 'create-folder', path: '/tmp/out' })).toBe('create folder /tmp/out');
    expect(stepText({ kind: 'app', action: 'test.save', args: null, text: 'save the connection Local' })).toBe(
      'save the connection Local',
    );
  });

  it('cuts a long value and a long list, and never the same step differently', () => {
    const long = 'a'.repeat(2004);
    expect(stepText(redis('SET', 'k', long))).toBe(`SET k ${'a'.repeat(200)}… (1,804 more)`);
    const documents = Array.from({ length: 1000 }, (_, index) => ({ i: index }));
    const text = stepText(mongo('insertMany', [documents]), orders);
    expect(text.endsWith('{ i: 9 }, … and 990 more])')).toBe(true);
    expect(stepText(mongo('insertMany', [documents]), orders)).toBe(text);
  });

  it('never splits an escape or a character of several bytes', () => {
    const escapes = new Uint8Array(300).fill(0x01);
    expect(stepText(redis('SET', 'k', escapes))).toBe(`SET k "${'\\x01'.repeat(200)}"… (100 more)`);
    const accents = utf8Bytes('é'.repeat(250));
    expect(stepText(redis('SET', 'k', accents))).toBe(`SET k ${'é'.repeat(200)}… (50 more)`);
    const emoji = mongo('insertOne', [{ s: '😀'.repeat(201) }]);
    expect(stepText(emoji, orders)).toBe(`db.orders.insertOne({ s: "${'😀'.repeat(200)}"… (1 more) })`);
  });
});
