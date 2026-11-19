/**
 * Records the replies of the reads of the Users and roles page from the throwaway MongoDB into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the unit tests of `user.list`, `user.list-roles` and `user.signed-in` read the recorded
 * files, and the files change only when they are recorded again. The users and roles it creates are dropped at the end.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId, type ConnectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const plain = connectionId('record');
const signedIn = connectionId('record-signed-in');
/** The password of the throwaway users: they live only for the recording, on a server that lives only for the tests. */
const throwawayPassword = 'recording-only';

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function command(
  engines: EngineService,
  database: string,
  body: Json,
  connection: ConnectionId = plain,
): Promise<unknown> {
  return engines.send(
    { connection, request: { engine: 'mongodb', database, method: 'runCommand', arguments: [body] } },
    AbortSignal.timeout(20_000),
  );
}

async function save(name: string, reply: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-user-${name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
}

async function createAll(engines: EngineService): Promise<void> {
  await command(engines, 'shop', {
    createRole: 'reader',
    privileges: [{ resource: { db: 'shop', collection: 'orders' }, actions: ['find'] }],
    roles: ['read'],
  });
  await command(engines, 'admin', {
    createRole: 'auditor',
    privileges: [
      { resource: { cluster: true }, actions: ['serverStatus'] },
      { resource: { db: 'shop', collection: '' }, actions: ['find', 'listIndexes'] },
    ],
    roles: [],
  });
  await command(engines, 'crm', { createRole: 'viewer', privileges: [], roles: [{ role: 'read', db: 'crm' }] });
  await command(engines, 'shop', {
    createUser: 'app',
    pwd: throwawayPassword,
    roles: ['readWrite', { role: 'read', db: 'reporting' }, 'reader'],
    customData: { team: 'billing', since: { $date: { $numberLong: String(Date.UTC(2026, 0, 10)) } } },
  });
  await command(engines, 'admin', {
    createUser: 'app',
    pwd: throwawayPassword,
    roles: [{ role: 'readWrite', db: 'shop' }],
  });
  await command(engines, 'admin', { createUser: 'zoe', pwd: throwawayPassword, roles: ['clusterMonitor'] });
  await command(engines, 'admin', { createUser: 'bob', pwd: throwawayPassword, roles: [] });
}

async function dropAll(engines: EngineService): Promise<void> {
  for (const database of ['shop', 'admin', 'crm']) {
    await command(engines, database, { dropAllUsersFromDatabase: int(1) });
    await command(engines, database, { dropAllRolesFromDatabase: int(1) });
  }
}

async function recordAll(engines: EngineService, address: string): Promise<void> {
  await save('usersInfo-shop', await command(engines, 'shop', { usersInfo: int(1) }));
  await save('usersInfo-all', await command(engines, 'admin', { usersInfo: { forAllDBs: true } }));
  await save(
    'rolesInfo-shop',
    await command(engines, 'shop', { rolesInfo: int(1), showPrivileges: true, showBuiltinRoles: false }),
  );
  await save(
    'rolesInfo-shop-builtin',
    await command(engines, 'shop', { rolesInfo: int(1), showPrivileges: true, showBuiltinRoles: true }),
  );
  await save(
    'rolesInfo-admin',
    await command(engines, 'admin', { rolesInfo: int(1), showPrivileges: true, showBuiltinRoles: false }),
  );
  await save(
    'rolesInfo-crm',
    await command(engines, 'crm', { rolesInfo: int(1), showPrivileges: true, showBuiltinRoles: false }),
  );
  await save(
    'system-roles-distinct',
    await engines.send(
      {
        connection: plain,
        request: {
          engine: 'mongodb',
          database: 'admin',
          collection: 'system.roles',
          method: 'distinct',
          arguments: ['db'],
        },
      },
      AbortSignal.timeout(20_000),
    ),
  );
  await save('connectionStatus-anonymous', await command(engines, 'admin', { connectionStatus: int(1) }));
  const url = new URL(address);
  url.username = 'app';
  url.password = throwawayPassword;
  url.searchParams.set('authSource', 'admin');
  await engines.connect(
    signedIn,
    { engine: 'mongodb', connectionString: url.toString(), connectTimeoutMs: 10_000 },
    AbortSignal.timeout(20_000),
  );
  await save('connectionStatus-app', await command(engines, 'admin', { connectionStatus: int(1) }, signedIn));
  await engines.disconnect(signedIn);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records usersInfo, rolesInfo and connectionStatus on MongoDB', async () => {
    const engines = createEngines();
    const address = testServers().mongoStandalone;
    await engines.connect(
      plain,
      { engine: 'mongodb', connectionString: address, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await dropAll(engines);
      await createAll(engines);
      await recordAll(engines, address);
      await dropAll(engines);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
