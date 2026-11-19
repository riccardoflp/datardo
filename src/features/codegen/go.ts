/**
 * Feature: codegen.go
 *
 * The query or the pipeline as code for version 2 of the Go driver: `bson.D` documents and `bson.A` arrays indented
 * with tabs, the declarations and the cursor from a collection named `collection` and a context named `ctx`, then the
 * small functions its values need; a full program connects, runs it, reads every result and prints each.
 */
import type { Json } from '../../shared/engine-request';
import { base64Bytes, codeValue, type CodeQuery, type CodeTarget, type CodeValue } from './source';
import { hexByte, indentation, laidOut, quoted } from './layout';
import { defaultUri } from './nodejs';

const indent = '\t';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The functions a value may need, written after the code. */
export const goFunctions: Readonly<Record<'objectID' | 'decimal128', string>> = {
  objectID: [
    'func objectID(hex string) bson.ObjectID {',
    '\tid, err := bson.ObjectIDFromHex(hex)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\treturn id',
    '}',
  ].join('\n'),
  decimal128: [
    'func decimal128(s string) bson.Decimal128 {',
    '\td, err := bson.ParseDecimal128(s)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\treturn d',
    '}',
  ].join('\n'),
};

/** What Go code needs: the packages of the standard library it imports, and the functions it calls. */
export interface GoNeeds {
  readonly imports: Set<string>;
  readonly functions: Set<'objectID' | 'decimal128'>;
}

function numberText(value: number, needs: GoNeeds): string {
  if (Number.isFinite(value)) {
    return String(value);
  }
  needs.imports.add('math');
  return Number.isNaN(value) ? 'math.NaN()' : value > 0 ? 'math.Inf(1)' : 'math.Inf(-1)';
}

function bytesText(bytes: readonly number[]): string {
  return `[]byte{${bytes.map(hexByte).join(', ')}}`;
}

function dateText(time: number): string {
  const date = new Date(time);
  const parts = [
    date.getUTCFullYear(),
    `time.${months[date.getUTCMonth()] ?? ''}`,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds() * 1_000_000,
    'time.UTC',
  ];
  return `bson.NewDateTimeFromTime(time.Date(${parts.join(', ')}))`;
}

function uuidBytes(text: string): readonly number[] {
  const hex = text.replace(/-/gu, '');
  return Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function scalarText(value: Exclude<CodeValue, { kind: 'array' | 'document' }>, needs: GoNeeds): string {
  switch (value.kind) {
    case 'null':
      return 'nil';
    case 'undefined':
      return 'bson.Undefined{}';
    case 'boolean':
      return String(value.value);
    case 'string':
    case 'symbol':
      return quoted(value.value);
    case 'number':
      return numberText(value.value, needs);
    case 'long':
      return `int64(${value.digits})`;
    case 'decimal':
      needs.functions.add('decimal128');
      return `decimal128(${quoted(value.digits)})`;
    case 'object-id':
      needs.functions.add('objectID');
      return `objectID(${quoted(value.hex)})`;
    case 'date':
      needs.imports.add('time');
      return dateText(value.time);
    case 'regex':
      return `bson.Regex{Pattern: ${quoted(value.pattern)}, Options: ${quoted(value.options)}}`;
    case 'uuid':
      return `bson.Binary{Subtype: 0x04, Data: ${bytesText(uuidBytes(value.text))}}`;
    case 'binary':
      return `bson.Binary{Subtype: ${hexByte(value.subtype)}, Data: ${bytesText(base64Bytes(value.base64))}}`;
    case 'timestamp':
      return `bson.Timestamp{T: ${String(value.t)}, I: ${String(value.i)}}`;
    case 'min-key':
      return 'bson.MinKey{}';
    case 'max-key':
      return 'bson.MaxKey{}';
    case 'code':
      return `bson.JavaScript(${quoted(value.code)})`;
  }
}

/** A document as `bson.D`, its fields in order. */
function documentText(entries: readonly (readonly [string, Json])[], level: number, needs: GoNeeds): string {
  const items = entries.map(([key, item]) => `{Key: ${quoted(key)}, Value: ${goValue(item, level + 1, needs)}}`);
  return laidOut(items, level, { indent, open: 'bson.D{', close: '}', trailingComma: true });
}

/** A value as Go code, at a level of indentation; the imports and functions it needs are added to `needs`. */
export function goValue(json: Json, level: number, needs: GoNeeds): string {
  const value = codeValue(json);
  if (value.kind === 'array') {
    return laidOut(
      value.items.map((item) => goValue(item, level + 1, needs)),
      level,
      { indent, open: 'bson.A{', close: '}', trailingComma: true },
    );
  }
  if (value.kind === 'document') {
    return documentText(value.entries, level, needs);
  }
  return scalarText(value, needs);
}

function linesOf(query: CodeQuery, level: number, needs: GoNeeds): { declarations: string[]; call: string } {
  if (query.kind === 'aggregate') {
    const stages = query.pipeline.map((stage) => goValue(stage, level + 1, needs));
    const pipeline = laidOut(stages, level, { indent, open: 'mongo.Pipeline{', close: '}', trailingComma: true });
    return { declarations: [`pipeline := ${pipeline}`], call: 'collection.Aggregate(ctx, pipeline)' };
  }
  const declarations = [`filter := ${documentText(Object.entries(query.filter), level, needs)}`];
  const setters: string[] = [];
  if (query.projection !== undefined) {
    declarations.push(`projection := ${goValue(query.projection, level, needs)}`);
    setters.push('.SetProjection(projection)');
  }
  if (query.sort !== undefined) {
    declarations.push(`sort := ${goValue(query.sort, level, needs)}`);
    setters.push('.SetSort(sort)');
  }
  if (setters.length === 0) {
    return { declarations, call: 'collection.Find(ctx, filter)' };
  }
  declarations.push(`opts := options.Find()${setters.join('')}`);
  return { declarations, call: 'collection.Find(ctx, filter, opts)' };
}

/** The functions the code uses, `decimal128` before `objectID`, after an empty line. */
function functionsText(needs: GoNeeds): string {
  const names = [...needs.functions].sort();
  return names.length === 0 ? '' : `\n${names.map((name) => goFunctions[name]).join('\n\n')}\n`;
}

const driverPackages = [
  'go.mongodb.org/mongo-driver/v2/bson',
  'go.mongodb.org/mongo-driver/v2/mongo',
  'go.mongodb.org/mongo-driver/v2/mongo/options',
];

function mainLines(target: CodeTarget, declarations: readonly string[], call: string): readonly string[] {
  const pad = indentation(indent, 1);
  return [
    'func main() {',
    '\turi := os.Getenv("MONGODB_URI")',
    '\tif uri == "" {',
    `\t\turi = ${quoted(defaultUri)}`,
    '\t}',
    '\tclient, err := mongo.Connect(options.Client().ApplyURI(uri))',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tctx := context.Background()',
    '\tdefer client.Disconnect(ctx)',
    `\tcollection := client.Database(${quoted(target.database)}).Collection(${quoted(target.collection)})`,
    '',
    ...declarations.map((line) => `${pad}${line}`),
    '',
    `\tcursor, err := ${call}`,
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tvar results []bson.M',
    '\tif err := cursor.All(ctx, &results); err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tfor _, doc := range results {',
    '\t\tfmt.Println(doc)',
    '\t}',
    '}',
  ];
}

/** Feature: codegen.go — the lines, or the whole program, for version 2 of the Go driver. */
export function goCode(query: CodeQuery, target: CodeTarget): string {
  const needs: GoNeeds = { imports: new Set(), functions: new Set() };
  const { declarations, call } = linesOf(query, target.program ? 1 : 0, needs);
  if (!target.program) {
    return `${declarations.join('\n')}\n\ncursor, err := ${call}\n${functionsText(needs)}`;
  }
  const standard = [...new Set(['context', 'fmt', 'os', ...needs.imports])].sort();
  return [
    'package main',
    '',
    'import (',
    ...standard.map((name) => `\t${quoted(name)}`),
    '',
    ...driverPackages.map((name) => `\t${quoted(name)}`),
    ')',
    '',
    ...mainLines(target, declarations, call),
    functionsText(needs),
  ].join('\n');
}
