import { describe, expect, it } from 'vitest';
import { javaCode } from '../../../src/features/codegen/java';
import { emptyFind, findExample, findFilter, int, lines, pipelineExample, program } from './queries';

const findDeclarations = [
  'Document filter = new Document("status", "paid")',
  '    .append("customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b"))',
  '    .append("createdAt", new Document("$gte", Date.from(Instant.parse("2024-01-01T00:00:00.000Z"))));',
  'Document projection = new Document("total", 1).append("status", 1);',
  'Document sort = new Document("createdAt", -1);',
];

const fullProgram = `import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Instant;
import java.util.Date;
import org.bson.Document;
import org.bson.types.ObjectId;

public class Main {
    public static void main(String[] args) {
        String uri = System.getenv().getOrDefault("MONGODB_URI", "mongodb://localhost:27017");
        try (MongoClient client = MongoClients.create(uri)) {
            MongoCollection<Document> collection = client.getDatabase("shop").getCollection("orders");

            Document filter = new Document("status", "paid")
                .append("customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b"))
                .append("createdAt", new Document("$gte", Date.from(Instant.parse("2024-01-01T00:00:00.000Z"))));
            Document projection = new Document("total", 1).append("status", 1);
            Document sort = new Document("createdAt", -1);

            for (Document doc : collection.find(filter).projection(projection).sort(sort)) {
                System.out.println(doc.toJson());
            }
        }
    }
}
`;

const pipelineLines = `List<Document> pipeline = Arrays.asList(
    new Document("$match", new Document("status", "paid")),
    new Document("$group", new Document("_id", "$customer")
            .append("total", new Document("$sum", "$total"))
            .append("orders", new Document("$sum", 1))),
    new Document("$sort", new Document("total", -1)),
    new Document("$limit", 10)
);

AggregateIterable<Document> results = collection.aggregate(pipeline);
`;

describe('codegen.java', () => {
  it('writes the find example', () => {
    expect(javaCode(findExample, lines)).toBe(
      `${findDeclarations.join('\n')}\n\nFindIterable<Document> results = collection.find(filter).projection(projection).sort(sort);\n`,
    );
  });

  it('writes the find example as a full program', () => {
    expect(javaCode(findExample, program)).toBe(fullProgram);
  });

  it('writes the pipeline example', () => {
    expect(javaCode(pipelineExample, lines)).toBe(pipelineLines);
  });

  it('writes nothing typed as new Document()', () => {
    expect(javaCode(emptyFind, lines)).toBe(
      'Document filter = new Document();\n\nFindIterable<Document> results = collection.find(filter);\n',
    );
  });

  it('ends a find with a sort and no projection with collection.find(filter).sort(sort);', () => {
    const code = javaCode({ kind: 'find', filter: findFilter, sort: { at: int(1) } }, lines);
    expect(code.endsWith('collection.find(filter).sort(sort);\n')).toBe(true);
  });

  it('imports Arrays and List for a pipeline, and loops over collection.aggregate(pipeline)', () => {
    const code = javaCode(pipelineExample, program);
    expect(code).toContain('import java.util.Arrays;\nimport java.util.List;\n');
    expect(code).toContain('for (Document doc : collection.aggregate(pipeline)) {');
  });

  it('writes 3000000000 as 3000000000L and NumberLong(5) as 5L', () => {
    const filter = { a: { $numberDouble: '3000000000' }, b: { $numberLong: '5' } };
    expect(javaCode({ kind: 'find', filter }, lines)).toContain(
      'Document filter = new Document("a", 3000000000L).append("b", 5L);',
    );
  });

  it('writes each import once, in order as text', () => {
    const filter = { a: [date1(), date1()], b: { $oid: '65f1c0de9a1b2c3d4e5f6a7b' }, c: [int(1)] };
    const imports = javaCode({ kind: 'aggregate', pipeline: [{ $match: filter }] }, program)
      .split('\n')
      .filter((line) => line.startsWith('import '));
    expect(imports).toEqual([...new Set(imports)].sort());
  });
});

function date1(): { $date: { $numberLong: string } } {
  return { $date: { $numberLong: '0' } };
}
