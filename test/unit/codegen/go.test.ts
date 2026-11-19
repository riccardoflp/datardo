import { describe, expect, it } from 'vitest';
import { goCode } from '../../../src/features/codegen/go';
import { date, emptyFind, findExample, findFilter, int, lines, pipelineExample, program } from './queries';

const objectIdFunction = `func objectID(hex string) bson.ObjectID {
\tid, err := bson.ObjectIDFromHex(hex)
\tif err != nil {
\t\tpanic(err)
\t}
\treturn id
}
`;

const findLines = `filter := bson.D{
\t{Key: "status", Value: "paid"},
\t{Key: "customer", Value: objectID("65f1c0de9a1b2c3d4e5f6a7b")},
\t{Key: "createdAt", Value: bson.D{
\t\t{Key: "$gte", Value: bson.NewDateTimeFromTime(time.Date(2024, time.January, 1, 0, 0, 0, 0, time.UTC))},
\t}},
}
projection := bson.D{{Key: "total", Value: 1}, {Key: "status", Value: 1}}
sort := bson.D{{Key: "createdAt", Value: -1}}
opts := options.Find().SetProjection(projection).SetSort(sort)

cursor, err := collection.Find(ctx, filter, opts)

${objectIdFunction}`;

const fullProgram = `package main

import (
\t"context"
\t"fmt"
\t"os"
\t"time"

\t"go.mongodb.org/mongo-driver/v2/bson"
\t"go.mongodb.org/mongo-driver/v2/mongo"
\t"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
\turi := os.Getenv("MONGODB_URI")
\tif uri == "" {
\t\turi = "mongodb://localhost:27017"
\t}
\tclient, err := mongo.Connect(options.Client().ApplyURI(uri))
\tif err != nil {
\t\tpanic(err)
\t}
\tctx := context.Background()
\tdefer client.Disconnect(ctx)
\tcollection := client.Database("shop").Collection("orders")

\tfilter := bson.D{
\t\t{Key: "status", Value: "paid"},
\t\t{Key: "customer", Value: objectID("65f1c0de9a1b2c3d4e5f6a7b")},
\t\t{Key: "createdAt", Value: bson.D{
\t\t\t{Key: "$gte", Value: bson.NewDateTimeFromTime(time.Date(2024, time.January, 1, 0, 0, 0, 0, time.UTC))},
\t\t}},
\t}
\tprojection := bson.D{{Key: "total", Value: 1}, {Key: "status", Value: 1}}
\tsort := bson.D{{Key: "createdAt", Value: -1}}
\topts := options.Find().SetProjection(projection).SetSort(sort)

\tcursor, err := collection.Find(ctx, filter, opts)
\tif err != nil {
\t\tpanic(err)
\t}
\tvar results []bson.M
\tif err := cursor.All(ctx, &results); err != nil {
\t\tpanic(err)
\t}
\tfor _, doc := range results {
\t\tfmt.Println(doc)
\t}
}

${objectIdFunction}`;

const pipelineLines = `pipeline := mongo.Pipeline{
\tbson.D{{Key: "$match", Value: bson.D{{Key: "status", Value: "paid"}}}},
\tbson.D{
\t\t{Key: "$group", Value: bson.D{
\t\t\t{Key: "_id", Value: "$customer"},
\t\t\t{Key: "total", Value: bson.D{{Key: "$sum", Value: "$total"}}},
\t\t\t{Key: "orders", Value: bson.D{{Key: "$sum", Value: 1}}},
\t\t}},
\t},
\tbson.D{{Key: "$sort", Value: bson.D{{Key: "total", Value: -1}}}},
\tbson.D{{Key: "$limit", Value: 10}},
}

cursor, err := collection.Aggregate(ctx, pipeline)
`;

/** The packages a full program imports, without the tabs. */
function imports(code: string): readonly string[] {
  const block = code.slice(code.indexOf('import (\n') + 'import (\n'.length, code.indexOf('\n)'));
  return block.split('\n').map((line) => line.trim());
}

describe('codegen.go', () => {
  it('writes the find example, indented with tabs', () => {
    expect(goCode(findExample, lines)).toBe(findLines);
  });

  it('writes the find example as a full program', () => {
    expect(goCode(findExample, program)).toBe(fullProgram);
  });

  it('writes the pipeline example', () => {
    expect(goCode(pipelineExample, lines)).toBe(pipelineLines);
  });

  it('writes nothing typed as bson.D{}', () => {
    expect(goCode(emptyFind, lines)).toBe('filter := bson.D{}\n\ncursor, err := collection.Find(ctx, filter)\n');
  });

  it('declares opts with only a sort, and no opts with neither', () => {
    const sorted = goCode({ kind: 'find', filter: findFilter, sort: { at: int(1) } }, lines);
    expect(sorted).toContain('opts := options.Find().SetSort(sort)\n');
    expect(goCode({ kind: 'find', filter: { a: 'b' } }, lines)).not.toContain('opts');
  });

  it('imports context, fmt, math, os and time in that order, then the driver', () => {
    const filter = { at: date('2024-01-01T00:00:00.000Z'), n: { $numberDouble: 'NaN' } };
    expect(imports(goCode({ kind: 'find', filter }, program))).toEqual([
      '"context"',
      '"fmt"',
      '"math"',
      '"os"',
      '"time"',
      '',
      '"go.mongodb.org/mongo-driver/v2/bson"',
      '"go.mongodb.org/mongo-driver/v2/mongo"',
      '"go.mongodb.org/mongo-driver/v2/mongo/options"',
    ]);
  });

  it('does not import time without a date', () => {
    expect(imports(goCode({ kind: 'find', filter: { a: 1 } }, program))).not.toContain('"time"');
  });

  it('puts a comma after the last item of every broken value', () => {
    for (const query of [findExample, pipelineExample]) {
      const code = goCode(query, lines);
      const values = code.slice(0, code.indexOf('\n\ncursor')).split('\n');
      const closing = values.flatMap((line, index) => (line.trim().startsWith('}') ? [values[index - 1] ?? ''] : []));
      expect(closing.length).toBeGreaterThan(0);
      for (const lastItem of closing) {
        expect(lastItem.endsWith(','), lastItem).toBe(true);
      }
    }
  });
});
