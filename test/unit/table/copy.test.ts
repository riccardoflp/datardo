import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { parsedValue } from '../../../src/features/query/parse';
import { plan as copyAsPlan } from '../../../src/features/table/copy-as';
import { plan as copyPathPlan } from '../../../src/features/table/copy-path';
import { copyText } from '../../../src/features/table/copy-text';
import { plan as copyValuePlan } from '../../../src/features/table/copy-value';
import { columnsOfDocuments } from '../../../src/features/table/detect-columns';
import type { Json } from '../../../src/shared/engine-request';
import { contextOf } from '../query/context';
import { canonical, everyType } from '../query/values';
import { documentOf } from './people';

const order = documentOf({
  _id: new BSON.ObjectId('65f1c0de65f1c0de65f1c0de'),
  status: 'paid',
  total: new BSON.Double(42.5),
  createdAt: new Date('2024-03-15T10:30:00.000Z'),
  tags: ['a', 'b'],
});

const mongosh = `{
  _id: ObjectId("65f1c0de65f1c0de65f1c0de"),
  status: "paid",
  total: 42.5,
  createdAt: ISODate("2024-03-15T10:30:00.000Z"),
  tags: [
    "a",
    "b"
  ]
}`;

const two = [documentOf({ _id: 1, status: 'new' }), documentOf({ _id: 2, status: 'paid', tags: ['x'] })];

describe('table.copy-text', () => {
  it('writes one document in each format', () => {
    expect(copyText([order], 'mongosh', 'orders')).toBe(mongosh);
    expect(copyText([order], 'extended-json', 'orders')).toBe(
      '{\n  "_id": {\n    "$oid": "65f1c0de65f1c0de65f1c0de"\n  },\n  "status": "paid",\n  "total": 42.5,\n  "createdAt": {\n    "$date": "2024-03-15T10:30:00.000Z"\n  },\n  "tags": [\n    "a",\n    "b"\n  ]\n}',
    );
    expect(copyText([order], 'json', 'orders')).toBe(
      '{\n  "_id": "65f1c0de65f1c0de65f1c0de",\n  "status": "paid",\n  "total": 42.5,\n  "createdAt": "2024-03-15T10:30:00.000Z",\n  "tags": [\n    "a",\n    "b"\n  ]\n}',
    );
    expect(copyText([order], 'yaml', 'orders')).toBe(
      '_id: "65f1c0de65f1c0de65f1c0de"\nstatus: paid\ntotal: 42.5\ncreatedAt: 2024-03-15T10:30:00.000Z\ntags:\n  - a\n  - b\n',
    );
    expect(copyText([order], 'insert-command', 'orders')).toBe(`db.getCollection("orders").insertOne(${mongosh});`);
  });

  it('writes two documents as JSON Lines, YAML and insertMany', () => {
    expect(copyText(two, 'json-lines', 'orders')).toBe(
      '{"_id":1,"status":"new"}\n{"_id":2,"status":"paid","tags":["x"]}\n',
    );
    expect(copyText(two, 'yaml', 'orders')).toBe(
      '- _id: 1\n  status: new\n- _id: 2\n  status: paid\n  tags:\n    - x\n',
    );
    expect(copyText(two, 'insert-command', 'orders')).toBe(
      'db.getCollection("orders").insertMany([\n  {\n    _id: 1,\n    status: "new"\n  },\n  {\n    _id: 2,\n    status: "paid",\n    tags: [\n      "x"\n    ]\n  }\n]);',
    );
  });

  it('writes CSV with one line per element of an expanded array, each ending with CR LF', () => {
    const documents = [...two, documentOf({ _id: 3, status: 'a, b', items: [{ sku: 'A' }, { sku: 'B' }] })];
    const columns = columnsOfDocuments(documents, ['items']);
    expect(copyText(documents, 'csv', 'orders', columns)).toBe(
      '_id,status,tags,items.sku\r\n1,new,,\r\n2,paid,"[""x""]",\r\n3,"a, b",,A\r\n3,"a, b",,B\r\n',
    );
  });

  it('writes a Decimal128 as a JSON number only when it holds it as written', () => {
    const prices = documentOf({ price: BSON.Decimal128.fromString('12.50'), n: BSON.Decimal128.fromString('12.5') });
    expect(copyText([prices], 'json', 'orders')).toBe('{\n  "price": "12.50",\n  "n": 12.5\n}');
    expect(copyText([prices], 'yaml', 'orders')).toBe('price: "12.50"\nn: 12.5\n');
  });

  it('keeps the types of the numbers in mongosh and Extended JSON', () => {
    const numbers = documentOf({
      big: BSON.Long.fromString('9007199254740993'),
      a: new BSON.Int32(5),
      b: BSON.Long.fromNumber(5),
      c: new BSON.Double(5),
      d: new BSON.Double(5.5),
    });
    expect(copyText([numbers], 'mongosh', 'orders')).toBe(
      '{\n  big: NumberLong("9007199254740993"),\n  a: 5,\n  b: NumberLong(5),\n  c: Double(5),\n  d: 5.5\n}',
    );
    const extended = JSON.parse(copyText([numbers], 'extended-json', 'orders')) as unknown;
    expect(extended).toEqual({
      big: { $numberLong: '9007199254740993' },
      a: 5,
      b: { $numberLong: '5' },
      c: { $numberDouble: '5.0' },
      d: 5.5,
    });
    expect(copyText([numbers], 'json', 'orders')).toContain('"big": "9007199254740993"');
  });

  it('writes a note of two lines as a block in YAML, a string yes and a key yes in quotes', () => {
    expect(copyText([{ note: 'line one\nline two' }], 'yaml', 'orders')).toBe('note: |-\n  line one\n  line two\n');
    expect(copyText([{ note: 'line one\nline two' }], 'mongosh', 'orders')).toContain('"line one\\nline two"');
    expect(copyText([{ yes: 'yes' }], 'yaml', 'orders')).toBe('"yes": "yes"\n');
  });

  it('names the collection as it is', () => {
    expect(copyText([two[0]!], 'insert-command', 'my-orders')).toMatch(
      /^db\.getCollection\("my-orders"\)\.insertOne\(/,
    );
  });

  it('gives mongosh that query.parse reads back with every type (M10)', () => {
    const document = everyType as unknown as Json;
    expect(parsedValue(copyText([everyType as never], 'mongosh', 'orders'), 0, () => '')).toEqual({
      ok: true,
      value: document,
    });
  });
});

describe('table.copy-as', () => {
  it('asks the format from Go to, with the five formats for one document and the seven for several', () => {
    const one = copyAsPlan(contextOf('table.copy-as'), { args: { documents: [order] } });
    expect(one).toMatchObject({ kind: 'ask', question: { title: 'Copy as' } });
    const several = copyAsPlan(contextOf('table.copy-as'), { args: { documents: two } });
    const choices = (several as unknown as { question: { fields: { choices: unknown[] }[] } }).question.fields[0]!
      .choices;
    expect(choices).toHaveLength(7);
  });

  it('copies the text of table.copy-text and writes nothing', () => {
    const outcome = copyAsPlan(contextOf('table.copy-as'), {
      args: { documents: [order], format: 'mongosh', collection: 'orders' },
    });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [], after: [{ kind: 'copy', text: mongosh }] } });
  });
});

describe('table.copy-value', () => {
  it('copies the value in mongosh syntax with its type, never the short form of the cell', () => {
    const copied = (value: Json): unknown => copyValuePlan(contextOf('table.copy-value'), { args: { value } });
    expect(copied('paid')).toMatchObject({ plan: { after: [{ kind: 'copy', text: '"paid"' }] } });
    expect(copied(canonical(new Date('2024-03-15T10:30:00.000Z')))).toMatchObject({
      plan: { after: [{ text: 'ISODate("2024-03-15T10:30:00.000Z")' }] },
    });
    expect(copied(['a', 'b'])).toMatchObject({ plan: { after: [{ text: '["a", "b"]' }] } });
    expect(copied(canonical(BSON.Long.fromNumber(1204)))).toMatchObject({
      plan: { after: [{ text: 'NumberLong(1204)' }] },
    });
    expect(copied(canonical(new BSON.Double(5)))).toMatchObject({ plan: { after: [{ text: 'Double(5)' }] } });
    expect(copied(canonical(new BSON.Int32(42)))).toMatchObject({ plan: { after: [{ text: '42' }] } });
  });

  it('copies the whole value of a cut cell, and nothing from an empty cell', () => {
    const long = 'x'.repeat(400);
    expect(copyValuePlan(contextOf('table.copy-value'), { args: { value: long } })).toMatchObject({
      plan: { after: [{ text: `"${long}"` }] },
    });
    expect(copyValuePlan(contextOf('table.copy-value'), { args: {} })).toMatchObject({
      kind: 'run',
      plan: { after: [] },
    });
  });
});

describe('table.copy-path', () => {
  it('copies the key of the column without quotes and without a position', () => {
    expect(copyPathPlan(contextOf('table.copy-path'), { args: { key: 'address.city' } })).toMatchObject({
      plan: { after: [{ kind: 'copy', text: 'address.city' }] },
    });
    expect(copyPathPlan(contextOf('table.copy-path'), { args: { key: 'items.sku' } })).toMatchObject({
      plan: { after: [{ text: 'items.sku' }] },
    });
  });
});
