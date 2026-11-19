import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { nodejsCode } from '../../../src/features/codegen/nodejs';
import { emptyFind, findExample, findFilter, lines, pipelineExample, program } from './queries';

const findLines = `const filter = {
  status: "paid",
  customer: new ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
  createdAt: { $gte: new Date("2024-01-01T00:00:00.000Z") }
};
const projection = { total: 1, status: 1 };
const sort = { createdAt: -1 };
`;

const pipelineLines = `const pipeline = [
  { $match: { status: "paid" } },
  {
    $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } }
  },
  { $sort: { total: -1 } },
  { $limit: 10 }
];

const cursor = client.db("shop").collection("orders").aggregate(pipeline);
`;

describe('codegen.nodejs', () => {
  it('writes the find example', () => {
    expect(nodejsCode(findExample, lines)).toBe(
      `${findLines}\nconst cursor = client.db("shop").collection("orders").find(filter, { projection, sort });\n`,
    );
  });

  it('writes the find example as a full program of 20 lines', () => {
    const code = nodejsCode(findExample, program);
    expect(
      code.startsWith(
        'import { MongoClient, ObjectId } from "mongodb";\n\n' +
          'const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");\n\n' +
          findLines,
      ),
    ).toBe(true);
    expect(code.endsWith('} finally {\n  await client.close();\n}\n')).toBe(true);
    const shown = code.split('\n').slice(0, -1);
    expect(shown).toHaveLength(20);
    const tryBlock = shown.slice(shown.indexOf('try {') + 1, shown.indexOf('} finally {'));
    expect(tryBlock).toEqual([
      '  const cursor = client.db("shop").collection("orders").find(filter, { projection, sort });',
      '  for await (const doc of cursor) {',
      '    console.log(doc);',
      '  }',
    ]);
  });

  it('writes the pipeline example', () => {
    expect(nodejsCode(pipelineExample, lines)).toBe(pipelineLines);
  });

  it('writes nothing typed as a filter of {}', () => {
    expect(nodejsCode(emptyFind, lines)).toBe(
      'const filter = {};\n\nconst cursor = client.db("shop").collection("orders").find(filter);\n',
    );
  });

  it('imports MongoClient, BSONRegExp, Decimal128, Long in that order', () => {
    const filter = {
      a: { $numberLong: '5' },
      b: { $numberDecimal: '0.10' },
      c: { $regularExpression: { pattern: '^a', options: 'x' } },
    };
    expect(nodejsCode({ kind: 'find', filter }, program).split('\n')[0]).toBe(
      'import { MongoClient, BSONRegExp, Decimal128, Long } from "mongodb";',
    );
  });

  it('ends a find with a projection and no sort with .find(filter, { projection });', () => {
    const code = nodejsCode({ kind: 'find', filter: findFilter, projection: { total: 1 } }, lines);
    expect(code.endsWith('.find(filter, { projection });\n')).toBe(true);
  });

  it('writes lines and programs that parse as an ES module', () => {
    for (const query of [findExample, pipelineExample, emptyFind]) {
      for (const target of [lines, program]) {
        expect(() => parse(nodejsCode(query, target), { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow();
      }
    }
  });
});
