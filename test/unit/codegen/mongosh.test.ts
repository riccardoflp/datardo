import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { mongoshCode } from '../../../src/features/codegen/mongosh';
import { emptyFind, findExample, findFilter, lines, pipelineExample, program } from './queries';

const findText = `db.getCollection("orders").find({
  status: "paid",
  customer: ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
  createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") }
}, { total: 1, status: 1 }).sort({ createdAt: -1 });
`;

const pipelineText = `db.getCollection("orders").aggregate([
  { $match: { status: "paid" } },
  {
    $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } }
  },
  { $sort: { total: -1 } },
  { $limit: 10 }
]);
`;

describe('codegen.mongosh', () => {
  it('writes the find example', () => {
    expect(mongoshCode(findExample, lines)).toBe(findText);
  });

  it('writes the find example as a full program, after use("shop");', () => {
    expect(mongoshCode(findExample, program)).toBe(`use("shop");\n\n${findText}`);
  });

  it('writes the pipeline example', () => {
    expect(mongoshCode(pipelineExample, lines)).toBe(pipelineText);
  });

  it('writes nothing typed as a find of {}', () => {
    expect(mongoshCode(emptyFind, lines)).toBe('db.getCollection("orders").find({});\n');
  });

  it('gives find one argument when there is a sort and no projection', () => {
    const code = mongoshCode({ kind: 'find', filter: { status: 'paid' }, sort: { at: { $numberInt: '1' } } }, lines);
    expect(code).toBe('db.getCollection("orders").find({ status: "paid" }).sort({ at: 1 });\n');
  });

  it('reaches any collection with getCollection', () => {
    const code = mongoshCode({ kind: 'find', filter: findFilter }, { ...lines, collection: 'my-coll.2024' });
    expect(code.startsWith('db.getCollection("my-coll.2024").find(')).toBe(true);
  });

  it('writes text that parses as JavaScript', () => {
    for (const query of [findExample, pipelineExample, emptyFind]) {
      for (const target of [lines, program]) {
        expect(() => parse(mongoshCode(query, target), { ecmaVersion: 'latest' })).not.toThrow();
      }
    }
  });
});
