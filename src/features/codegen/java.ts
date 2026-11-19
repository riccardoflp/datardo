/**
 * Feature: codegen.java
 *
 * The query or the pipeline as code for the synchronous Java driver: `org.bson.Document` built with `.append`, the
 * declarations and the iterable from a `MongoCollection<Document>` named `collection`; a full program is the class
 * `Main` that connects, runs it and prints each document as JSON.
 */
import type { Json } from '../../shared/engine-request';
import { codeWidth, fitsOnOneLine, hexByte, indentation, laidOut, quoted } from './layout';
import { defaultUri } from './nodejs';
import { isoText } from './mongosh';
import { codeValue, type CodeQuery, type CodeTarget, type CodeValue } from './source';

const indent = '    ';
const largestInt = 2_147_483_647;

/** A number of C# or Java: a whole number beyond an `int` is written with `L`. */
export function longSuffixed(value: number, written: string): string {
  const size = Math.abs(value);
  return Number.isInteger(value) && size > largestInt && size <= Number.MAX_SAFE_INTEGER ? `${written}L` : written;
}

function numberText(value: number): string {
  if (Number.isNaN(value)) {
    return 'Double.NaN';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'Double.POSITIVE_INFINITY' : 'Double.NEGATIVE_INFINITY';
  }
  return longSuffixed(value, String(value));
}

function using(needs: Set<string>, name: string, written: string): string {
  needs.add(name);
  return written;
}

function scalarText(value: Exclude<CodeValue, { kind: 'array' | 'document' }>, needs: Set<string>): string {
  switch (value.kind) {
    case 'null':
      return 'null';
    case 'undefined':
      return using(needs, 'org.bson.BsonUndefined', 'new BsonUndefined()');
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
      return using(needs, 'org.bson.types.Decimal128', `Decimal128.parse(${quoted(value.digits)})`);
    case 'object-id':
      return using(needs, 'org.bson.types.ObjectId', `new ObjectId(${quoted(value.hex)})`);
    case 'date':
      needs.add('java.time.Instant');
      return using(needs, 'java.util.Date', `Date.from(Instant.parse(${quoted(isoText(value.time))}))`);
    case 'regex':
      return using(
        needs,
        'org.bson.BsonRegularExpression',
        `new BsonRegularExpression(${quoted(value.pattern)}, ${quoted(value.options)})`,
      );
    case 'uuid':
      needs.add('java.util.UUID');
      return using(needs, 'org.bson.BsonBinary', `new BsonBinary(UUID.fromString(${quoted(value.text)}))`);
    case 'binary':
      needs.add('java.util.Base64');
      return using(
        needs,
        'org.bson.types.Binary',
        `new Binary((byte) ${hexByte(value.subtype)}, Base64.getDecoder().decode(${quoted(value.base64)}))`,
      );
    case 'timestamp':
      return using(needs, 'org.bson.BsonTimestamp', `new BsonTimestamp(${String(value.t)}, ${String(value.i)})`);
    case 'min-key':
      return using(needs, 'org.bson.types.MinKey', 'new MinKey()');
    case 'max-key':
      return using(needs, 'org.bson.types.MaxKey', 'new MaxKey()');
    case 'code':
      return using(needs, 'org.bson.types.Code', `new Code(${quoted(value.code)})`);
  }
}

/** A document: `new Document("key", value)` and one `.append` per other field, broken before each `.append`. */
function documentText(entries: readonly (readonly [string, Json])[], level: number, needs: Set<string>): string {
  const [first, ...others] = entries.map(([key, item]) => `(${quoted(key)}, ${javaValue(item, level + 1, needs)})`);
  if (first === undefined) {
    return 'new Document()';
  }
  const single = `new Document${first}${others.map((part) => `.append${part}`).join('')}`;
  if (fitsOnOneLine(single, indent, level)) {
    return single;
  }
  const pad = indentation(indent, level + 1);
  return `new Document${first}${others.map((part) => `\n${pad}.append${part}`).join('')}`;
}

/** A value as Java code, at a level of indentation; the classes it imports are added to `needs`. */
export function javaValue(json: Json, level: number, needs: Set<string>): string {
  const value = codeValue(json);
  if (value.kind === 'array') {
    needs.add('java.util.Arrays');
    return laidOut(
      value.items.map((item) => javaValue(item, level + 1, needs)),
      level,
      { indent, open: 'Arrays.asList(', close: ')' },
    );
  }
  if (value.kind === 'document') {
    return documentText(value.entries, level, needs);
  }
  return scalarText(value, needs);
}

/** The list of stages: on one line when the whole list, with its indentation, is at most 50 columns long. */
const pipelineWidth = codeWidth - 30;

function pipelineText(pipeline: readonly Json[], level: number, needs: Set<string>): string {
  needs.add('java.util.List');
  needs.add('java.util.Arrays');
  const stages = pipeline.map((stage) => javaValue(stage, level + 1, needs));
  const single = `Arrays.asList(${stages.join(', ')})`;
  if (!single.includes('\n') && indentation(indent, level).length + single.length <= pipelineWidth) {
    return single;
  }
  const pad = indentation(indent, level + 1);
  return `Arrays.asList(\n${stages.map((stage) => `${pad}${stage}`).join(',\n')}\n${indentation(indent, level)})`;
}

function linesOf(query: CodeQuery, level: number, needs: Set<string>): { declarations: string[]; call: string } {
  if (query.kind === 'aggregate') {
    return {
      declarations: [`List<Document> pipeline = ${pipelineText(query.pipeline, level, needs)};`],
      call: 'collection.aggregate(pipeline)',
    };
  }
  const declarations = [`Document filter = ${javaValue(query.filter, level, needs)};`];
  let call = 'collection.find(filter)';
  if (query.projection !== undefined) {
    declarations.push(`Document projection = ${javaValue(query.projection, level, needs)};`);
    call += '.projection(projection)';
  }
  if (query.sort !== undefined) {
    declarations.push(`Document sort = ${javaValue(query.sort, level, needs)};`);
    call += '.sort(sort)';
  }
  return { declarations, call };
}

const clientImports = [
  'com.mongodb.client.MongoClient',
  'com.mongodb.client.MongoClients',
  'com.mongodb.client.MongoCollection',
  'org.bson.Document',
];

/** Feature: codegen.java — the lines, or the whole program, for the Java driver. */
export function javaCode(query: CodeQuery, target: CodeTarget): string {
  const needs = new Set<string>();
  const level = target.program ? 3 : 0;
  const { declarations, call } = linesOf(query, level, needs);
  if (!target.program) {
    const type = query.kind === 'aggregate' ? 'AggregateIterable<Document>' : 'FindIterable<Document>';
    return `${declarations.join('\n')}\n\n${type} results = ${call};\n`;
  }
  const imports = [...new Set([...clientImports, ...needs])].sort();
  const pad = indentation(indent, level);
  const database = quoted(target.database);
  const collection = quoted(target.collection);
  return [
    ...imports.map((name) => `import ${name};`),
    '',
    'public class Main {',
    '    public static void main(String[] args) {',
    `        String uri = System.getenv().getOrDefault("MONGODB_URI", ${quoted(defaultUri)});`,
    '        try (MongoClient client = MongoClients.create(uri)) {',
    `            MongoCollection<Document> collection = client.getDatabase(${database}).getCollection(${collection});`,
    '',
    ...declarations.map((line) => `${pad}${line}`),
    '',
    `            for (Document doc : ${call}) {`,
    '                System.out.println(doc.toJson());',
    '            }',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}
