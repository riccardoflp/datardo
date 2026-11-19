import { describe, expect, it } from 'vitest';
import { encryptSecrets } from '../../../src/features/connection/encryption';
import { connectionsFromText, isEncrypted } from '../../../src/features/connection/read-file';
import type { FileConnection, FileConnections } from '../../../src/features/connection/types';
import { connectionsToText } from '../../../src/features/connection/write-file';
import { nodeFileCrypto } from '../../../src/main/file-crypto';

async function read(value: unknown, passphrase?: string): Promise<FileConnections> {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const result = await connectionsFromText(text, passphrase, nodeFileCrypto);
  if ('problem' in result) {
    throw new Error(result.problem);
  }
  return result;
}

async function problem(value: unknown, passphrase?: string): Promise<string> {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const result = await connectionsFromText(text, passphrase, nodeFileCrypto);
  return 'problem' in result ? result.problem : 'no problem';
}

async function encrypted(secrets: object, passphrase: string): Promise<string> {
  const [value = ''] = await encryptSecrets([JSON.stringify({ secrets })], passphrase, nodeFileCrypto);
  return value;
}

const compass = (connections: unknown[]): unknown => ({ type: 'Compass Connections', version: 1, connections });
const datardo = (connections: unknown[]): unknown => ({ type: 'Datardo Connections', version: 1, connections });
const mongoster = (connections: unknown[]): unknown => ({ type: 'Mongoster Connections', version: 1, connections });

describe('connection.read-compass', () => {
  it('reads the name, the color, the TLS files, the tunnel and the notes', async () => {
    const file = await read(
      compass([
        {
          id: 'x',
          favorite: { name: ' Prod ', color: 'color3' },
          connectionOptions: {
            connectionString: 'mongodb://admin:secret@db1:27017,db2:27017/?replicaSet=rs0&tls=true&tlsCAFile=%2Fca.pem',
            sshTunnel: {
              host: 'bastion',
              port: 2222,
              username: 'ubuntu',
              identityKeyFile: ['/id_rsa'],
              identityKeyPassphrase: 'kp',
            },
            fleOptions: { autoEncryption: { keyVaultNamespace: 'a.b' } },
          },
        },
      ]),
    );
    expect(file.format).toBe('compass');
    expect(file.connections).toEqual([
      {
        name: 'Prod',
        engine: 'mongodb',
        connectionString: 'mongodb://admin:secret@db1:27017,db2:27017/?replicaSet=rs0',
        tls: { caFile: '/ca.pem' },
        color: 'blue',
        ssh: {
          host: 'bastion',
          port: 2222,
          username: 'ubuntu',
          auth: 'privateKey',
          privateKeyFile: '/id_rsa',
          passphrase: 'kp',
        },
        notes: ['the SSH tunnel goes to the first host only', 'In-Use Encryption settings not imported'],
      },
    ]);
  });

  it('puts the decrypted secrets back, or notes they are encrypted', async () => {
    const entry = {
      favorite: { name: 'K' },
      connectionOptions: {
        connectionString: 'mongodb://admin@h:27017/?authSource=admin&tlsCertificateKeyFile=%2Fk.pem',
        sshTunnel: { host: 'jump', username: 'me' },
      },
      connectionSecrets: await encrypted(
        { password: 'p%40ss', sshTunnelPassword: 'sshpw', tlsCertificateKeyFilePassword: 'kp' },
        'right',
      ),
    };
    const opened = await read(compass([entry]), 'right');
    expect(opened.connections[0]).toMatchObject({
      connectionString: 'mongodb://admin:p%40ss@h:27017/?authSource=admin',
      tls: { certificateKeyFile: '/k.pem', certificateKeyFilePassword: 'kp' },
      ssh: { password: 'sshpw' },
      notes: [],
    });
    const locked = await read(compass([entry]));
    expect(locked.connections[0]).toMatchObject({
      connectionString: 'mongodb://admin@h:27017/?authSource=admin',
      ssh: { password: '' },
      notes: ['passwords not imported (encrypted)'],
    });
    expect(await problem(compass([entry]), 'wrong')).toBe('Wrong passphrase, or the file is damaged');
  });

  it('replaces the AWS session token', async () => {
    const file = await read(
      compass([
        {
          connectionOptions: {
            connectionString:
              'mongodb://key@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:old',
          },
          connectionSecrets: await encrypted({ awsSessionToken: 'tok' }, 'p'),
        },
      ]),
      'p',
    );
    expect(file.connections[0]?.connectionString).toBe(
      'mongodb://key@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN%3Atok',
    );
  });

  it('skips an entry without a connection string', async () => {
    expect((await read(compass([{ connectionOptions: {} }, 3]))).skipped).toBe(2);
  });
});

describe('connection.read-file', () => {
  it('refuses a JSON file of another kind, invalid JSON and other versions', async () => {
    expect(await problem({ type: 'Something' })).toBe(
      'This JSON file is neither a Compass export ("Compass Connections") nor a Datardo or Mongoster export',
    );
    expect(await problem('{ nope')).toMatch(/^Not a valid JSON file: /);
    expect(await problem({ type: 'Datardo Connections', version: 2, connections: [] })).toBe(
      'Unsupported version of the file: 2 (expected 1)',
    );
    expect(await problem({ type: 'Datardo Connections', version: 1 })).toBe('The file has no list of connections');
  });

  it('bounds the size and the depth of a file', async () => {
    expect(await problem(`{${' '.repeat(11 * 1024 * 1024)}}`)).toBe(
      'The file is too large: a file of connections has at most 10 MB',
    );
    let deep: unknown = 1;
    for (let level = 0; level < 100; level += 1) {
      deep = { a: deep };
    }
    expect(await problem(datardo([deep]))).toBe('The file is nested too deeply to be a file of connections');
  });

  it('reads a Mongoster file without passwords', async () => {
    const file = await read(
      mongoster([
        {
          name: 'Shop',
          uri: 'mongodb://ada@db1:27017/app',
          ssh: { host: 'jump', username: 'me', auth: 'password' },
          version: { $numberInt: '1' },
        },
      ]),
    );
    expect(file.connections).toEqual([
      {
        name: 'Shop',
        engine: 'mongodb',
        connectionString: 'mongodb://ada@db1:27017/app',
        ssh: { host: 'jump', username: 'me', auth: 'password', password: '' },
        notes: ['no password', 'no SSH password'],
      },
    ]);
  });

  it('reads a Mongoster file with encrypted passwords and a Redis address', async () => {
    const entry = {
      name: 'Shop',
      uri: 'mongodb://ada@db1:27017,db2:27017/app?replicaSet=rs0',
      redisOplog: { url: 'redis://cache:6379/0', prefix: 'app:' },
      secrets: await encrypted({ password: 'pw', redisPassword: 'r3' }, 'right'),
    };
    expect(isEncrypted(JSON.stringify(mongoster([entry])))).toBe(true);
    const locked = await read(mongoster([entry]));
    expect(locked.connections[0]).toMatchObject({
      connectionString: 'mongodb://ada@db1:27017,db2:27017/app?replicaSet=rs0',
      oplog: { url: 'redis://cache:6379/0', settings: { prefix: 'app:' } },
      notes: ['passwords not imported (encrypted)'],
    });
    const opened = await read(mongoster([entry]), 'right');
    expect(opened.connections[0]).toMatchObject({
      connectionString: 'mongodb://ada:pw@db1:27017,db2:27017/app?replicaSet=rs0',
      oplog: { url: 'redis://:r3@cache:6379/0' },
      notes: [],
    });
  });

  it('notes no missing password for X.509', async () => {
    expect((await read('mongodb://CN=me@h/?authMechanism=MONGODB-X509')).connections[0]?.notes).toEqual([]);
  });

  it('reads a Datardo file with a Redis entry and its link', async () => {
    const file = await read(
      datardo([
        {
          id: 'a1',
          name: 'Local',
          engine: 'mongodb',
          uri: 'mongodb://db1/shop',
          redisOplog: { connection: 'c7', prefix: 'app:' },
        },
        { id: 'c7', name: 'Cache local', engine: 'redis', uri: 'rediss://cache:6380/1' },
        { name: 'Odd', engine: 'postgres', uri: 'postgres://h' },
        { name: 'Wrong', engine: 'redis', uri: 'mongodb://h' },
      ]),
    );
    expect(file.skipped).toBe(2);
    expect(file.connections).toEqual([
      {
        id: 'a1',
        name: 'Local',
        engine: 'mongodb',
        connectionString: 'mongodb://db1/shop',
        oplog: { connection: 'c7', settings: { prefix: 'app:' } },
        notes: [],
      },
      { id: 'c7', name: 'Cache local', engine: 'redis', connectionString: 'rediss://cache:6380/1', tls: {}, notes: [] },
    ]);
  });

  it('leaves out a link whose Redis connection is not in the file', async () => {
    const file = await read(
      datardo([{ id: 'a1', name: 'Local', engine: 'mongodb', uri: 'mongodb://db1', redisOplog: { connection: 'c9' } }]),
    );
    expect(file.connections[0]).not.toHaveProperty('oplog');
    expect(file.connections[0]?.notes).toEqual([
      'redis-oplog link not imported: its Redis connection is not in the file',
    ]);
  });
});

const full: FileConnection = {
  id: 'c-full',
  name: 'Full',
  engine: 'mongodb',
  connectionString: 'mongodb://ada:p%40ss@db1:27017/app',
  folder: 'Work',
  color: 'orange',
  readOnly: true,
  tls: { caFile: '/ca.pem', certificateKeyFile: '/k.pem', certificateKeyFilePassword: 'kp' },
  ssh: { host: 'jump', port: 2200, username: 'me', auth: 'password', password: 'sshpw' },
  oplog: { connection: 'c-cache', settings: { prefix: 'app:' } },
  notes: [],
};
const cache: FileConnection = {
  id: 'c-cache',
  name: 'Cache',
  engine: 'redis',
  connectionString: 'redis://:r3dis@cache',
  notes: [],
};

async function written(
  connections: readonly FileConnection[],
  format: 'datardo' | 'compass' | 'list',
  secrets: 'remove' | 'include' | 'encrypt',
  passphrase?: string,
): Promise<{ text: string; notes: readonly string[] }> {
  const result = await connectionsToText(
    connections,
    { format, secrets, ...(passphrase === undefined ? {} : { passphrase }) },
    nodeFileCrypto,
  );
  if ('problem' in result) {
    throw new Error(result.problem);
  }
  return result;
}

describe('connection.write-file', () => {
  it('writes Datardo’s format without the secrets', async () => {
    const { text } = await written([full, cache], 'datardo', 'remove');
    expect(text.endsWith('}\n')).toBe(true);
    const file = JSON.parse(text) as { secrets: string; connections: unknown[] };
    expect(file.secrets).toBe('removed');
    expect(file.connections).toEqual([
      {
        id: 'c-full',
        name: 'Full',
        engine: 'mongodb',
        uri: 'mongodb://ada@db1:27017/app',
        folder: 'Work',
        color: 'orange',
        readOnly: true,
        tls: { caFile: '/ca.pem', certificateKeyFile: '/k.pem' },
        ssh: { host: 'jump', port: 2200, username: 'me', auth: 'password' },
        redisOplog: { connection: 'c-cache', prefix: 'app:' },
      },
      { id: 'c-cache', name: 'Cache', engine: 'redis', uri: 'redis://cache' },
    ]);
    expect(text).not.toMatch(/p%40ss|kp"|sshpw|r3dis/);
  });

  it('writes Compass’s format with the TLS settings in the connection string', async () => {
    const { text, notes } = await written([full, cache], 'compass', 'remove');
    const file = JSON.parse(text) as { connections: Record<string, unknown>[] };
    expect(file.connections).toHaveLength(1);
    expect(file.connections[0]).toMatchObject({
      favorite: { name: 'Full', color: 'color8' },
      savedConnectionType: 'favorite',
      connectionOptions: {
        connectionString: 'mongodb://ada@db1:27017/app?tls=true&tlsCAFile=%2Fca.pem&tlsCertificateKeyFile=%2Fk.pem',
        sshTunnel: { host: 'jump', port: 2200, username: 'me' },
      },
    });
    expect(notes).toEqual([
      "folders, read-only and redis-oplog were left out (Compass doesn't have them)",
      "1 Redis connection was left out (Compass doesn't have them)",
    ]);
  });

  it('writes a list', async () => {
    const removed = await written([full, cache], 'list', 'remove');
    expect(removed.text).toBe(
      [
        '# Connections exported from Datardo: name = connection string (without passwords)',
        'Full = mongodb://ada@db1:27017/app?tls=true&tlsCAFile=%2Fca.pem&tlsCertificateKeyFile=%2Fk.pem',
        'Cache = redis://cache',
        '',
      ].join('\n'),
    );
    expect(removed.notes).toEqual([
      "1 SSH tunnel was left out (a connection string can't hold one)",
      'folders, colors, read-only and redis-oplog were left out',
    ]);
    expect((await written([cache], 'list', 'include')).text).toContain('Cache = redis://:r3dis@cache');
  });

  it('removes the secret options too', async () => {
    const proxy: FileConnection = {
      id: 'p',
      name: 'P',
      engine: 'mongodb',
      connectionString: 'mongodb://ada:pw@h/?proxyHost=p&proxyPassword=pp',
      notes: [],
    };
    const file = JSON.parse((await written([proxy], 'datardo', 'remove')).text) as { connections: { uri: string }[] };
    expect(file.connections[0]?.uri).toBe('mongodb://ada@h/?proxyHost=p');
  });

  it('refuses encryption without a passphrase, and for a list', async () => {
    expect(await connectionsToText([full], { format: 'datardo', secrets: 'encrypt' }, nodeFileCrypto)).toMatchObject({
      problem: 'A passphrase is needed to encrypt the passwords',
    });
    expect(
      await connectionsToText([full], { format: 'list', secrets: 'encrypt', passphrase: 'p' }, nodeFileCrypto),
    ).toMatchObject({ problem: "A list of connection strings can't be encrypted" });
  });

  it('reads back every format as the same connections, less what it leaves out', async () => {
    for (const secrets of ['include', 'encrypt'] as const) {
      const { text } = await written([full, cache], 'datardo', secrets, 'passphrase');
      const back = await read(text, 'passphrase');
      expect(back.connections.map(({ notes: _notes, ...each }) => each)).toEqual(
        [
          {
            ...full,
            notes: undefined,
            ssh: { host: 'jump', port: 2200, username: 'me', auth: 'password', password: 'sshpw' },
          },
          { ...cache, notes: undefined },
        ].map(({ notes: _notes, ...each }) => each),
      );
    }
    const compassBack = await read((await written([full], 'compass', 'encrypt', 'passphrase')).text, 'passphrase');
    expect(compassBack.connections[0]).toMatchObject({
      name: 'Full',
      color: 'orange',
      connectionString: 'mongodb://ada:p%40ss@db1:27017/app',
      tls: full.tls,
      ssh: { host: 'jump', port: 2200, password: 'sshpw' },
    });
    const listBack = await read((await written([full, cache], 'list', 'include')).text);
    expect(listBack.connections.map((each) => each.connectionString)).toEqual([
      'mongodb://ada:p%40ss@db1:27017/app',
      'redis://:r3dis@cache',
    ]);
  });
});
