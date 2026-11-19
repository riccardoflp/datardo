import { describe, expect, it } from 'vitest';
import { csharpCode } from '../../../src/features/codegen/csharp';
import { date, emptyFind, findExample, findFilter, lines, pipelineExample, program } from './queries';

const declarations = `var filter = new BsonDocument
{
    { "status", "paid" },
    { "customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b") },
    { "createdAt", new BsonDocument("$gte", new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc)) }
};
var sort = new BsonDocument("createdAt", -1);
var projection = new BsonDocument { { "total", 1 }, { "status", 1 } };
`;

const fullProgram = `using MongoDB.Bson;
using MongoDB.Driver;

var uri = Environment.GetEnvironmentVariable("MONGODB_URI") ?? "mongodb://localhost:27017";
var client = new MongoClient(uri);
var collection = client.GetDatabase("shop").GetCollection<BsonDocument>("orders");

${declarations}
foreach (var doc in collection.Find(filter).Sort(sort).Project(projection).ToList())
{
    Console.WriteLine(doc);
}
`;

const pipelineLines = `var pipeline = new[]
{
    new BsonDocument("$match", new BsonDocument("status", "paid")),
    new BsonDocument("$group", new BsonDocument
    {
        { "_id", "$customer" },
        { "total", new BsonDocument("$sum", "$total") },
        { "orders", new BsonDocument("$sum", 1) }
    }),
    new BsonDocument("$sort", new BsonDocument("total", -1)),
    new BsonDocument("$limit", 10)
};

var results = collection.Aggregate<BsonDocument>(pipeline).ToList();
`;

describe('codegen.csharp', () => {
  it('writes the find example', () => {
    expect(csharpCode(findExample, lines)).toBe(
      `${declarations}\nvar results = collection.Find(filter).Sort(sort).Project(projection).ToList();\n`,
    );
  });

  it('writes the find example as a full program', () => {
    expect(csharpCode(findExample, program)).toBe(fullProgram);
  });

  it('writes the pipeline example', () => {
    expect(csharpCode(pipelineExample, lines)).toBe(pipelineLines);
  });

  it('writes nothing typed as new BsonDocument()', () => {
    expect(csharpCode(emptyFind, lines)).toBe(
      'var filter = new BsonDocument();\n\nvar results = collection.Find(filter).ToList();\n',
    );
  });

  it('ends a find with a projection and no sort with Project(projection).ToList();', () => {
    const code = csharpCode({ kind: 'find', filter: findFilter, projection: { total: 1 } }, lines);
    expect(code.endsWith('collection.Find(filter).Project(projection).ToList();\n')).toBe(true);
  });

  it('writes null as BsonNull.Value', () => {
    expect(csharpCode({ kind: 'find', filter: { a: null } }, lines)).toContain(
      'var filter = new BsonDocument("a", BsonNull.Value);',
    );
  });

  it('adds the milliseconds of a date with AddMilliseconds, and nothing without', () => {
    const code = (iso: string): string => csharpCode({ kind: 'find', filter: { a: date(iso) } }, lines);
    expect(code('2024-03-01T10:20:30.123Z')).toContain(
      'new DateTime(2024, 3, 1, 10, 20, 30, DateTimeKind.Utc).AddMilliseconds(123)',
    );
    expect(code('2024-03-01T10:20:30.000Z')).not.toContain('AddMilliseconds');
  });

  it('writes a UUID with GuidRepresentation.Standard', () => {
    const uuid = { $binary: { base64: 'OyQRAeK7QlWMr0E2xWapYg==', subType: '04' } };
    expect(csharpCode({ kind: 'find', filter: { u: uuid } }, lines)).toContain(
      'new BsonBinaryData(Guid.Parse("3b241101-e2bb-4255-8caf-4136c566a962"), GuidRepresentation.Standard)',
    );
  });
});
