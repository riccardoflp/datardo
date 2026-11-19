/**
 * Feature: codegen.csharp
 *
 * The query or the pipeline as code for the .NET driver: `BsonDocument` values, the declarations and the results from
 * an `IMongoCollection<BsonDocument>` named `collection`; a full program is made of top-level statements that connect,
 * run it and print each document.
 */
import type { Json } from '../../shared/engine-request';
import { longSuffixed } from './java';
import { codeWidth, fitsOnOneLine, hexByte, indentation, quoted } from './layout';
import { defaultUri } from './nodejs';
import { codeValue, type CodeQuery, type CodeTarget, type CodeValue } from './source';

const indent = '    ';

function numberText(value: number): string {
  if (Number.isNaN(value)) {
    return 'double.NaN';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'double.PositiveInfinity' : 'double.NegativeInfinity';
  }
  return longSuffixed(value, String(value));
}

function dateText(time: number): string {
  const date = new Date(time);
  const parts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
  const base = `new DateTime(${parts.join(', ')}, DateTimeKind.Utc)`;
  const milliseconds = date.getUTCMilliseconds();
  return milliseconds === 0 ? base : `${base}.AddMilliseconds(${String(milliseconds)})`;
}

function scalarText(value: Exclude<CodeValue, { kind: 'array' | 'document' }>): string {
  switch (value.kind) {
    case 'null':
      return 'BsonNull.Value';
    case 'undefined':
      return 'BsonUndefined.Value';
    case 'boolean':
      return String(value.value);
    case 'string':
    case 'symbol':
      return quoted(value.value);
    case 'number':
      return numberText(value.value);
    case 'long':
      return `${value.digits}L`;
    case 'decimal':
      return `Decimal128.Parse(${quoted(value.digits)})`;
    case 'object-id':
      return `new ObjectId(${quoted(value.hex)})`;
    case 'date':
      return dateText(value.time);
    case 'regex':
      return `new BsonRegularExpression(${quoted(value.pattern)}, ${quoted(value.options)})`;
    case 'uuid':
      return `new BsonBinaryData(Guid.Parse(${quoted(value.text)}), GuidRepresentation.Standard)`;
    case 'binary':
      return `new BsonBinaryData(Convert.FromBase64String(${quoted(value.base64)}), (BsonBinarySubType)${hexByte(value.subtype)})`;
    case 'timestamp':
      return `new BsonTimestamp(${String(value.t)}, ${String(value.i)})`;
    case 'min-key':
      return 'BsonMinKey.Value';
    case 'max-key':
      return 'BsonMaxKey.Value';
    case 'code':
      return `new BsonJavaScript(${quoted(value.code)})`;
  }
}

/** An initializer: on one line when it fits, otherwise with `{` and `}` on their own lines. */
function initializer(head: string, items: readonly string[], level: number): string {
  const single = `${head} { ${items.join(', ')} }`;
  if (fitsOnOneLine(single, indent, level)) {
    return single;
  }
  const pad = indentation(indent, level + 1);
  const end = indentation(indent, level);
  return `${head}\n${end}{\n${items.map((item) => `${pad}${item}`).join(',\n')}\n${end}}`;
}

/** A value as C# code, at a level of indentation. */
export function csharpValue(json: Json, level: number): string {
  const value = codeValue(json);
  if (value.kind === 'array') {
    return value.items.length === 0
      ? 'new BsonArray()'
      : initializer(
          'new BsonArray',
          value.items.map((item) => csharpValue(item, level + 1)),
          level,
        );
  }
  if (value.kind === 'document') {
    const [first, ...others] = value.entries;
    if (first === undefined) {
      return 'new BsonDocument()';
    }
    // A document of one field is written with the constructor of two arguments.
    if (others.length === 0) {
      return `new BsonDocument(${quoted(first[0])}, ${csharpValue(first[1], level)})`;
    }
    const items = value.entries.map(([key, item]) => `{ ${quoted(key)}, ${csharpValue(item, level + 1)} }`);
    return initializer('new BsonDocument', items, level);
  }
  return scalarText(value);
}

/** The array of stages: on one line when the whole array is at most 65 columns long. */
const pipelineWidth = codeWidth - 15;

function pipelineText(pipeline: readonly Json[]): string {
  const stages = pipeline.map((stage) => csharpValue(stage, 1));
  const single = `new[] { ${stages.join(', ')} }`;
  if (!single.includes('\n') && single.length <= pipelineWidth) {
    return single;
  }
  return `new[]\n{\n${stages.map((stage) => `${indent}${stage}`).join(',\n')}\n}`;
}

function linesOf(query: CodeQuery): { declarations: string[]; call: string } {
  if (query.kind === 'aggregate') {
    return {
      declarations: [`var pipeline = ${pipelineText(query.pipeline)};`],
      call: 'collection.Aggregate<BsonDocument>(pipeline).ToList()',
    };
  }
  const declarations = [`var filter = ${csharpValue(query.filter, 0)};`];
  let call = 'collection.Find(filter)';
  if (query.sort !== undefined) {
    declarations.push(`var sort = ${csharpValue(query.sort, 0)};`);
    call += '.Sort(sort)';
  }
  if (query.projection !== undefined) {
    declarations.push(`var projection = ${csharpValue(query.projection, 0)};`);
    call += '.Project(projection)';
  }
  return { declarations, call: `${call}.ToList()` };
}

/** Feature: codegen.csharp — the lines, or the whole program, for the .NET driver. */
export function csharpCode(query: CodeQuery, target: CodeTarget): string {
  const { declarations, call } = linesOf(query);
  if (!target.program) {
    return `${declarations.join('\n')}\n\nvar results = ${call};\n`;
  }
  return [
    'using MongoDB.Bson;',
    'using MongoDB.Driver;',
    '',
    `var uri = Environment.GetEnvironmentVariable("MONGODB_URI") ?? ${quoted(defaultUri)};`,
    'var client = new MongoClient(uri);',
    `var collection = client.GetDatabase(${quoted(target.database)}).GetCollection<BsonDocument>(${quoted(target.collection)});`,
    '',
    ...declarations,
    '',
    `foreach (var doc in ${call})`,
    '{',
    '    Console.WriteLine(doc);',
    '}',
    '',
  ].join('\n');
}
