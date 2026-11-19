import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsedQueryFile } from '../../../src/features/saved-query/parse-file';
import { find, pipeline } from './harness';

const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'saved-query', 'mongoster-0.8.0');

function messageOf(text: string): string {
  const read = parsedQueryFile(text);
  return read.ok ? 'read' : read.message;
}

const base = '"name":"n","database":"d","collection":"c"';

describe('saved-query.parse-file', () => {
  it('gives each row of the table exactly its message', () => {
    expect(messageOf('{ name: "x" }')).toMatch(/^not valid JSON: \S/u);
    expect(messageOf('[]')).toBe('it must be a JSON object.');
    expect(messageOf('"text"')).toBe('it must be a JSON object.');
    expect(messageOf('{"database":"d","collection":"c"}')).toBe('"name" is missing: it must be a non-empty string.');
    expect(messageOf('{"name":"  ","database":"d","collection":"c"}')).toBe(
      '"name" is missing: it must be a non-empty string.',
    );
    expect(messageOf('{"name":3,"database":"d","collection":"c"}')).toBe(
      '"name" is missing: it must be a non-empty string.',
    );
    expect(messageOf('{"name":"n","collection":"c"}')).toBe('"database" is missing: it must be a non-empty string.');
    expect(messageOf(`{${base},"filter":1}`)).toBe('"filter" must be a string or an array of lines.');
    expect(messageOf(`{${base},"sort":1}`)).toBe('"sort" must be a string or an array of lines.');
    expect(messageOf(`{${base},"projection":[1]}`)).toBe('"projection" must be a string or an array of lines.');
    expect(messageOf(`{${base},"description":1}`)).toBe('"description" must be a string or an array of lines.');
    expect(messageOf(`{${base},"connection":3}`)).toBe('"connection" must be a string.');
    expect(messageOf(`{${base},"filter":"{}","pipeline":[]}`)).toBe(
      'it has both a "pipeline" and "filter", "sort" or "projection": keep one or the other.',
    );
    expect(messageOf(`{${base},"pipeline":{}}`)).toBe('"pipeline" must be an array of stages.');
    expect(messageOf(`{${base},"pipeline":["$match"]}`)).toBe(
      'stage 1 of "pipeline" must be an object with "stage" and "body".',
    );
    expect(messageOf(`{${base},"pipeline":[{"stage":"match","body":"{}"}]}`)).toBe(
      '"stage" of stage 1 must be a stage name such as "$match".',
    );
    expect(messageOf(`{${base},"pipeline":[{"stage":"$match","body":"{}","enabled":"no"}]}`)).toBe(
      '"enabled" of stage 1 must be true or false.',
    );
    expect(messageOf(`{${base},"pipeline":[{"stage":"$match","body":1}]}`)).toBe(
      '"body" of stage 1 must be a string or an array of lines.',
    );
  });

  it('gives the four worked examples their results', () => {
    expect(parsedQueryFile('{"name":"a","database":"shop","collection":"orders"}')).toEqual({
      ok: true,
      query: { name: 'a', database: 'shop', collection: 'orders', query: find('') },
    });
    expect(parsedQueryFile(readFileSync(join(recorded, 'shop', 'orders', 'totals-by-customer.json'), 'utf8'))).toEqual({
      ok: true,
      query: {
        name: 'Totals by customer',
        connection: 'Production',
        database: 'shop',
        collection: 'orders',
        query: pipeline(
          ['$match', '{ status: "paid" }'],
          ['$group', '{\n  _id: "$customer",\n  total: { $sum: "$total" }\n}'],
          ['$sort', '{ total: -1 }', false],
        ),
      },
    });
    expect(messageOf('{"name":"a","database":"shop"}')).toBe('"collection" is missing: it must be a non-empty string.');
    expect(messageOf('[]')).toBe('it must be a JSON object.');
  });

  it('reads a file saved with a byte order mark', () => {
    expect(parsedQueryFile('\u{FEFF}{"name":"a","database":"shop","collection":"orders"}').ok).toBe(true);
  });

  it('gives a filter written as an array of lines on three lines', () => {
    const read = parsedQueryFile(`{${base},"filter":["{", "  a: 1", "}"]}`);
    expect(read.ok && read.query.query).toEqual(find('{\n  a: 1\n}'));
  });

  it('reads a file with an extra field, which is ignored', () => {
    const read = parsedQueryFile(`{${base},"owner":"ada"}`);
    expect(read).toEqual({ ok: true, query: { name: 'n', database: 'd', collection: 'c', query: find('') } });
  });

  it('reads a filter that is not valid mongosh as it is: it is refused only when it runs', () => {
    const read = parsedQueryFile(`{${base},"filter":"{ a: "}`);
    expect(read.ok && read.query.query).toEqual(find('{ a: '));
  });

  it('drops the spaces around the name, the database and the collection, and an empty connection', () => {
    const read = parsedQueryFile('{"name":" X ","database":" d ","collection":" c ","connection":"  ","sort":null}');
    expect(read).toEqual({ ok: true, query: { name: 'X', database: 'd', collection: 'c', query: find('') } });
  });

  it('reads a pipeline that is empty as a pipeline, and a stage without enabled as enabled', () => {
    const empty = parsedQueryFile(`{${base},"pipeline":[]}`);
    expect(empty.ok && empty.query.query).toEqual({ kind: 'pipeline', stages: [] });
    const one = parsedQueryFile(`{${base},"pipeline":[{"stage":" $limit ","body":"5"}]}`);
    expect(one.ok && one.query.query).toEqual(pipeline(['$limit', '5']));
  });
});
