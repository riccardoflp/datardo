/**
 * Feature: codegen.nodejs
 *
 * The query or the pipeline as code for the Node.js driver: the declarations of `filter`, `projection`, `sort` or
 * `pipeline`, and the cursor from a connected `MongoClient` named `client`; a full program is an ES module that
 * imports the BSON classes its values use, connects, prints each document and closes the client.
 */
import type { Json } from '../../shared/engine-request';
import { hexByte, laidOut, quoted } from './layout';
import { escapedSlashes, isoText, javascriptNumber, keyText } from './mongosh';
import { codeValue, type CodeQuery, type CodeTarget, type CodeValue } from './source';

const indent = '  ';

/** The connection string a program uses when `MONGODB_URI` is not set. */
export const defaultUri = 'mongodb://localhost:27017';

function using(needs: Set<string>, name: string, written: string): string {
  needs.add(name);
  return written;
}

function regexText(value: Extract<CodeValue, { kind: 'regex' }>, needs: Set<string>): string {
  if (/^[imsu]*$/u.test(value.options) && value.pattern !== '') {
    return `/${escapedSlashes(value.pattern)}/${value.options}`;
  }
  return using(needs, 'BSONRegExp', `new BSONRegExp(${quoted(value.pattern)}, ${quoted(value.options)})`);
}

function scalarText(value: Exclude<CodeValue, { kind: 'array' | 'document' }>, needs: Set<string>): string {
  switch (value.kind) {
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'boolean':
      return String(value.value);
    case 'string':
    case 'symbol':
      return quoted(value.value);
    case 'number':
      return javascriptNumber(value.value);
    case 'long':
      return using(needs, 'Long', `Long.fromString(${quoted(value.digits)})`);
    case 'decimal':
      return using(needs, 'Decimal128', `Decimal128.fromString(${quoted(value.digits)})`);
    case 'object-id':
      return using(needs, 'ObjectId', `new ObjectId(${quoted(value.hex)})`);
    case 'date':
      return `new Date(${quoted(isoText(value.time))})`;
    case 'regex':
      return regexText(value, needs);
    case 'uuid':
      return using(needs, 'UUID', `new UUID(${quoted(value.text)})`);
    case 'binary':
      return using(
        needs,
        'Binary',
        `new Binary(Buffer.from(${quoted(value.base64)}, "base64"), ${hexByte(value.subtype)})`,
      );
    case 'timestamp':
      return using(needs, 'Timestamp', `new Timestamp({ t: ${String(value.t)}, i: ${String(value.i)} })`);
    case 'min-key':
      return using(needs, 'MinKey', 'new MinKey()');
    case 'max-key':
      return using(needs, 'MaxKey', 'new MaxKey()');
    case 'code':
      return using(needs, 'Code', `new Code(${quoted(value.code)})`);
  }
}

/** A value as Node.js code, at a level of indentation; the BSON classes it uses are added to `needs`. */
export function nodejsValue(json: Json, level: number, needs: Set<string>): string {
  const value = codeValue(json);
  if (value.kind === 'array') {
    return laidOut(
      value.items.map((item) => nodejsValue(item, level + 1, needs)),
      level,
      { indent, open: '[', close: ']' },
    );
  }
  if (value.kind === 'document') {
    return laidOut(
      value.entries.map(([key, item]) => `${keyText(key)}: ${nodejsValue(item, level + 1, needs)}`),
      level,
      { indent, open: '{', close: '}', spaced: true },
    );
  }
  return scalarText(value, needs);
}

/** The declarations and the call that makes the cursor. */
function linesOf(query: CodeQuery, target: CodeTarget, needs: Set<string>): { declarations: string[]; call: string } {
  const collection = `client.db(${quoted(target.database)}).collection(${quoted(target.collection)})`;
  if (query.kind === 'aggregate') {
    return {
      declarations: [`const pipeline = ${nodejsValue(query.pipeline, 0, needs)};`],
      call: `${collection}.aggregate(pipeline)`,
    };
  }
  const declarations = [`const filter = ${nodejsValue(query.filter, 0, needs)};`];
  const options: string[] = [];
  if (query.projection !== undefined) {
    declarations.push(`const projection = ${nodejsValue(query.projection, 0, needs)};`);
    options.push('projection');
  }
  if (query.sort !== undefined) {
    declarations.push(`const sort = ${nodejsValue(query.sort, 0, needs)};`);
    options.push('sort');
  }
  const second = options.length === 0 ? '' : `, { ${options.join(', ')} }`;
  return { declarations, call: `${collection}.find(filter${second})` };
}

/** Feature: codegen.nodejs — the lines, or the whole program, for the Node.js driver. */
export function nodejsCode(query: CodeQuery, target: CodeTarget): string {
  const needs = new Set<string>();
  const { declarations, call } = linesOf(query, target, needs);
  if (!target.program) {
    return `${declarations.join('\n')}\n\nconst cursor = ${call};\n`;
  }
  const imports = ['MongoClient', ...[...needs].sort()].join(', ');
  return [
    `import { ${imports} } from "mongodb";`,
    '',
    `const client = new MongoClient(process.env.MONGODB_URI ?? ${quoted(defaultUri)});`,
    '',
    ...declarations,
    '',
    'try {',
    `  const cursor = ${call};`,
    '  for await (const doc of cursor) {',
    '    console.log(doc);',
    '  }',
    '} finally {',
    '  await client.close();',
    '}',
    '',
  ].join('\n');
}
