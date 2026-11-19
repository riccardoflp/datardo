/**
 * The rewriting of a script so that its calls need no `await`, with the worked examples of the card word for word.
 */
import { describe, expect, it } from 'vitest';
import { rewritten } from '../../../src/features/playground/rewrite';

const R = '__datardoResolve';
const V = '__datardoResult';

/** The card writes `R` and `V`; the code has the two names. */
function expanded(text: string): string {
  return text.replaceAll('R(', `${R}(`).replaceAll('V =', `${V} =`);
}

function codeOf(source: string): string {
  const result = rewritten(source);
  if (result.kind !== 'rewritten') {
    throw new Error(`Expected a rewritten script, got ${JSON.stringify(result)}`);
  }
  return result.code;
}

function bodyOf(source: string): string {
  const code = codeOf(source);
  const head = `(async () => { let ${V}; `;
  const tail = `\n; return ${V}; })()`;
  expect(code.startsWith(head)).toBe(true);
  expect(code.endsWith(tail)).toBe(true);
  return code.slice(head.length, code.length - tail.length);
}

const workedExamples: readonly (readonly [string, string])[] = [
  ['db.users.countDocuments()', 'V = await R((db.users.countDocuments()))'],
  [
    'const u = db.users.findOne({ name: "Ada" }); u.name',
    'const u = (await R((db.users.findOne({ name: "Ada" })))); V = await R((u.name))',
  ],
  ['const n = db.stock.findOne({}).n', 'const n = (await R(((await R((db.stock.findOne({})))).n)))'],
  ['db.users.find().toArray().length', 'V = await R(((await R(((await R((db.users.find()))).toArray()))).length))'],
  ['print(db.users.countDocuments())', 'V = await R((print((await R((db.users.countDocuments()))))))'],
  [
    'if (db.users.findOne({ name: "Ada" })) { print("found") }',
    'if ((await R((db.users.findOne({ name: "Ada" }))))) { await R((print("found"))) }',
  ],
  [
    'const o = { name: "Ada", n: db.users.countDocuments() }',
    'const o = { name: "Ada", n: (await R((db.users.countDocuments()))) }',
  ],
  ['`${db.users.countDocuments()} users`', 'V = await R((`${(await R((db.users.countDocuments())))} users`))'],
  ['[1, 2].map((n) => db.items.findOne({ n }))', 'V = await R(([1, 2].map((n) => db.items.findOne({ n }))))'],
  [
    'session.withTransaction(() => { orders.insertOne({ _id: 1 }); })',
    'V = await R((session.withTransaction(async () => { await R((orders.insertOne({ _id: 1 }))); })))',
  ],
  [
    'db.users.findOne({ name: "Ada" })?.address.city',
    'V = await R(((await R((db.users.findOne({ name: "Ada" }))))?.address.city))',
  ],
  ['u?.best().name', 'V = await R((u?.best().name))'],
  [
    'async function total(id) { return db.orders.countDocuments({ userId: id }) }',
    'async function total(id) { return (await R((db.orders.countDocuments({ userId: id })))) }',
  ],
  [
    'function total(id) { return db.orders.countDocuments({ userId: id }) }',
    'function total(id) { return db.orders.countDocuments({ userId: id }) }',
  ],
];

describe('playground.rewrite', () => {
  it.each(workedExamples)('rewrites %s as the card writes it', (source, expected) => {
    expect(bodyOf(source)).toBe(expanded(expected));
  });

  it('keeps every line of the source on its own line number, with one line more', () => {
    const source = ['use("shop");', '', 'const a = db.orders', '  .find({})', '  .toArray();', 'a.length'].join('\n');
    const code = codeOf(source);
    const lines = code.split('\n');
    expect(lines).toHaveLength(source.split('\n').length + 1);
    expect(lines[3]).toContain('.find({})');
    expect(lines[5]).toContain('a.length');
  });

  it('keeps two lines without semicolons two statements, the second starting with V = await', () => {
    const body = bodyOf('const a = db.users.countDocuments()\ndb.orders.countDocuments()');
    const [, second] = body.split('\n');
    expect(second?.startsWith(`${V} = await`)).toBe(true);
  });

  it('awaits the calls inside an async callback of map, and none inside a callback that is not async', () => {
    expect(bodyOf('[1, 2].map(async (n) => db.items.findOne({ n }))')).toBe(
      expanded('V = await R(([1, 2].map(async (n) => (await R((db.items.findOne({ n })))))))'),
    );
  });

  it('gives the syntax error Unexpected token at line 1 for db.users.find({', () => {
    expect(rewritten('db.users.find({')).toEqual({
      kind: 'syntax-error',
      message: 'Unexpected token',
      line: 1,
      column: 16,
    });
  });

  it('gives no result for a script that ends with a declaration, an if or a loop', () => {
    for (const source of ['const a = 1', 'if (a) { b() }', 'for (const x of y) { z(x) }']) {
      expect(bodyOf(source)).not.toContain(`${V} =`);
    }
  });

  it('runs a script that already writes await the same as one that does not', () => {
    expect(bodyOf('await db.users.findOne({})')).toBe(
      expanded('V = await R((await (await R((db.users.findOne({}))))))'),
    );
  });

  it('allows a #! line at the start, and return at the top level', () => {
    const body = bodyOf('#!/usr/bin/env mongosh\nreturn db.users.countDocuments()');
    expect(body).toBe(expanded('\nreturn (await R((db.users.countDocuments())))'));
  });

  it('leaves parameters and declarations of classes alone', () => {
    expect(bodyOf('async function f(a = g()) { h() }')).toBe(expanded('async function f(a = g()) { await R((h())) }'));
  });
});
