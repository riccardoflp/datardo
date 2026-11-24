/**
 * The lists of the MCP server with what Datardo excludes from searches (M39), called by an MCP client over HTTP
 * against the test MongoDB: of 40 databases, 3 excluded on Local, `list_databases` leaves the 3 out and
 * `find_documents` on one of them still answers; `list_connections` leaves out a connection excluded as a whole, and
 * `list_collections` a collection with an exclusion of its own. The databases are `m39mcp_00` to `m39mcp_39`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { liveMcp, localId, standaloneId, type LiveMcp } from './live';

let live: LiveMcp;
const databases = Array.from({ length: 40 }, (_, index) => `m39mcp_${String(index).padStart(2, '0')}`);
const excluded = ['m39mcp_05', 'm39mcp_21', 'm39mcp_38'];
const drop: Json = { dropDatabase: { $numberInt: '1' } };

function exclude(fields: { readonly exclusions?: readonly string[]; readonly excluded?: true }, id = localId): void {
  const connection = live.state().connections.saved.find((each) => each.id === id);
  if (connection !== undefined) {
    live.dispatch({ slice: 'connections', type: 'saved', connection: { ...connection, ...fields } });
  }
}

beforeAll(async () => {
  live = await liveMcp();
  for (const database of databases) {
    await live.mongo(database, 'runCommand', [drop]);
    await live.mongo(database, 'insertMany', [[{ _id: 1, name: `ada of ${database}` }]], 'people');
  }
  await live.mongo('m39mcp_00', 'insertMany', [[{ _id: 1 }]], 'audit');
}, 120_000);

afterAll(async () => {
  for (const database of databases) {
    await live.mongo(database, 'runCommand', [drop]);
  }
  await live.close();
}, 120_000);

describe('mcp.data-tools', () => {
  it('of 40 databases, 3 excluded, list_databases leaves the 3 out, and find_documents on one still answers', async () => {
    exclude({ exclusions: excluded });
    const listed = (await live.tool('list_databases', { connection: 'Local' })).text;
    const names = (JSON.parse(listed) as { name: string }[]).map((each) => each.name);
    expect(names.filter((name) => name.startsWith('m39mcp_'))).toEqual(
      databases.filter((name) => !excluded.includes(name)),
    );
    const found = await live.tool('find_documents', {
      connection: 'Local',
      database: 'm39mcp_21',
      collection: 'people',
    });
    expect(found.isError).toBe(false);
    expect(found.text).toContain('ada of m39mcp_21');
  });

  it('leaves out a connection excluded as a whole and a collection with an exclusion of its own', async () => {
    exclude({ excluded: true }, standaloneId);
    exclude({ exclusions: ['m39mcp_00.audit'] });
    const connections = (await live.tool('list_connections')).text;
    expect(connections).toContain('"name": "Local"');
    expect(connections).not.toContain('"name": "Standalone"');
    const collections = (await live.tool('list_collections', { connection: 'Local', database: 'm39mcp_00' })).text;
    expect(collections).toContain('people');
    expect(collections).not.toContain('audit');
  });
});
