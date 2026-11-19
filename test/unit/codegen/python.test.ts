import { describe, expect, it } from 'vitest';
import { pythonCode } from '../../../src/features/codegen/python';
import { emptyFind, findExample, findFilter, int, lines, pipelineExample, program } from './queries';

const declarations = `query = {
    "status": "paid",
    "customer": ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
    "createdAt": {"$gte": datetime(2024, 1, 1, tzinfo=timezone.utc)}
}
projection = {"total": 1, "status": 1}
sort = [("createdAt", -1)]
`;

const fullProgram = `import os
from datetime import datetime, timezone

from pymongo import MongoClient
from bson import ObjectId

client = MongoClient(os.environ.get("MONGODB_URI", "mongodb://localhost:27017"))
collection = client["shop"]["orders"]

${declarations}
for doc in collection.find(query, projection, sort=sort):
    print(doc)
`;

const pipelineLines = `pipeline = [
    {"$match": {"status": "paid"}},
    {
        "$group": {"_id": "$customer", "total": {"$sum": "$total"}, "orders": {"$sum": 1}}
    },
    {"$sort": {"total": -1}},
    {"$limit": 10}
]

cursor = client["shop"]["orders"].aggregate(pipeline)
`;

describe('codegen.python', () => {
  it('writes the find example', () => {
    expect(pythonCode(findExample, lines)).toBe(
      `${declarations}\ncursor = client["shop"]["orders"].find(query, projection, sort=sort)\n`,
    );
  });

  it('writes the find example as a full program', () => {
    expect(pythonCode(findExample, program)).toBe(fullProgram);
  });

  it('writes the pipeline example', () => {
    expect(pythonCode(pipelineExample, lines)).toBe(pipelineLines);
  });

  it('writes nothing typed as a query of {}, and an empty pipeline as []', () => {
    expect(pythonCode(emptyFind, lines)).toBe('query = {}\n\ncursor = client["shop"]["orders"].find(query)\n');
    expect(pythonCode({ kind: 'aggregate', pipeline: [] }, lines).split('\n')[0]).toBe('pipeline = []');
  });

  it('ends a find with a sort and no projection with .find(query, sort=sort)', () => {
    const code = pythonCode({ kind: 'find', filter: findFilter, sort: { at: int(1) } }, lines);
    expect(code.endsWith('.find(query, sort=sort)\n')).toBe(true);
  });

  it('writes a sort as a list of pairs in the order of its fields', () => {
    const code = pythonCode({ kind: 'find', filter: {}, sort: { status: int(1), createdAt: int(-1) } }, lines);
    expect(code).toContain('sort = [("status", 1), ("createdAt", -1)]\n');
  });

  it('puts the imports of the standard library first, then those of the driver', () => {
    const filter = {
      n: { $numberLong: '7' },
      u: { $binary: { base64: 'OyQRAeK7QlWMr0E2xWapYg==', subType: '04' } },
      b: { $binary: { base64: 'AQID', subType: '00' } },
    };
    expect(pythonCode({ kind: 'find', filter }, program).split('\n').slice(0, 8)).toEqual([
      'import os',
      'import base64',
      'from uuid import UUID',
      '',
      'from pymongo import MongoClient',
      'from bson.binary import Binary',
      'from bson.int64 import Int64',
      '',
    ]);
  });

  it('writes true, false and null as True, False and None', () => {
    expect(pythonCode({ kind: 'find', filter: { a: true, b: false, c: null } }, lines)).toContain(
      'query = {"a": True, "b": False, "c": None}',
    );
  });
});
