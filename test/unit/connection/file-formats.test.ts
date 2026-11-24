import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { presetColors } from '../../../src/shared/color';
import { colorFrom, compassColor } from '../../../src/features/connection/color-from-compass';
import { decryptSecrets, encryptSecrets, fromBase64 } from '../../../src/features/connection/encryption';
import { connectionsFromList } from '../../../src/features/connection/read-list';
import { throughTunnel, tunnelTarget } from '../../../src/features/connection/ssh-tunnel-target';
import { nodeFileCrypto } from '../../../src/main/file-crypto';

/** A value encrypted as Compass's `encrypt.ts` does it, written here with Node's crypto alone. */
function compassEncrypted(text: string, passphrase: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const key = pbkdf2Sync(Buffer.from(passphrase, 'utf8'), salt, 100_000, 32, 'sha512');
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([0, 1]), salt, iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

describe('connection.ssh-tunnel-target', () => {
  it('leads to the first host of a MongoDB connection string, as a direct connection', () => {
    expect(tunnelTarget('mongodb', 'mongodb://u:p@db1:27018,db2/app?replicaSet=rs0')).toEqual({
      host: 'db1',
      port: 27018,
    });
    expect(throughTunnel('mongodb', 'mongodb://u:p@db1:27018,db2/app?replicaSet=rs0', 50000)).toBe(
      'mongodb://u:p@127.0.0.1:50000/app?replicaSet=rs0&directConnection=true',
    );
  });

  it('takes the brackets off an IPv6 address and replaces directConnection', () => {
    expect(tunnelTarget('mongodb', 'mongodb://[::1]/?directConnection=false&tls=true')).toEqual({
      host: '::1',
      port: 27017,
    });
    expect(throughTunnel('mongodb', 'mongodb://[::1]/?directConnection=false&tls=true', 50000)).toBe(
      'mongodb://127.0.0.1:50000/?tls=true&directConnection=true',
    );
    expect(throughTunnel('mongodb', 'mongodb://h', 50000)).toBe('mongodb://127.0.0.1:50000/?directConnection=true');
  });

  it('decodes the host and keeps the credentials as written', () => {
    expect(tunnelTarget('mongodb', 'mongodb://a%40b@my%2Dhost:1/db')).toEqual({ host: 'my-host', port: 1 });
    expect(throughTunnel('mongodb', 'mongodb://a%40b@my%2Dhost:1/db', 50000)).toBe(
      'mongodb://a%40b@127.0.0.1:50000/db?directConnection=true',
    );
  });

  it('refuses what cannot go through a tunnel', () => {
    expect(tunnelTarget('mongodb', 'mongodb+srv://c.example.net')).toEqual({
      problem:
        'A mongodb+srv:// connection string can not go through an SSH tunnel: use the mongodb://host:port form of one of the servers.',
    });
    expect(tunnelTarget('mongodb', 'http://h')).toEqual({
      problem: 'The connection string must start with mongodb://',
    });
    expect(tunnelTarget('mongodb', 'mongodb:///db')).toEqual({
      problem: 'Unexpected host in the connection string: (none)',
    });
  });

  it('leads a Redis connection to its host and port, keeping the user and the database', () => {
    expect(tunnelTarget('redis', 'rediss://ada@cache.internal:6380/2')).toEqual({ host: 'cache.internal', port: 6380 });
    expect(throughTunnel('redis', 'rediss://ada@cache.internal:6380/2', 50000)).toBe('rediss://ada@127.0.0.1:50000/2');
    expect(tunnelTarget('redis', 'redis://cache')).toEqual({ host: 'cache', port: 6379 });
  });
});

describe('connection.color-from-compass', () => {
  it('turns names, codes and hex colors into the eleven presets', () => {
    expect(colorFrom('color3', 'nearest-preset')).toBe('blue');
    expect(colorFrom('color2', 'nearest-preset')).toBe('teal');
    expect(colorFrom('iris', 'nearest-preset')).toBe('indigo');
    expect(colorFrom('color7', 'nearest-preset')).toBe('pink');
    expect(colorFrom('color10', 'nearest-preset')).toBe('gray');
    expect(colorFrom(' Blue ', 'nearest-preset')).toBe('blue');
    expect(colorFrom('#ff0000', 'nearest-preset')).toBe('red');
    expect(colorFrom('#00f', 'nearest-preset')).toBe('blue');
    expect(colorFrom('ffa500', 'nearest-preset')).toBe('orange');
    expect(colorFrom('#808080', 'nearest-preset')).toBe('gray');
    expect(colorFrom('#xyz', 'nearest-preset')).toBeUndefined();
    expect(colorFrom(3, 'nearest-preset')).toBeUndefined();
    expect(colorFrom('constructor', 'nearest-preset')).toBeUndefined();
  });

  it('keeps a custom color in the formats of Datardo and Mongoster', () => {
    expect(colorFrom('#12ABEF', 'keep-custom')).toBe('#12abef');
    expect(colorFrom('color4', 'keep-custom')).toBe('indigo');
  });

  it('writes the codes of Compass, brown as orange and a custom color as its nearest preset', () => {
    expect(compassColor('teal')).toBe('color2');
    expect(compassColor('brown')).toBe('color8');
    expect(compassColor('#12abef')).toBe('color3');
    expect(compassColor('#5c6bc0')).toBe('color4');
    expect(presetColors.map((each) => compassColor(each))).toEqual([
      'color6',
      'color8',
      'color9',
      'color1',
      'color3',
      'color5',
      'color7',
      'color2',
      'color4',
      'color8',
      'color10',
    ]);
  });

  it('reads back every preset written to Compass as itself, and brown as orange', () => {
    const back = presetColors.map((each) => colorFrom(compassColor(each), 'nearest-preset'));
    expect(back).toEqual(presetColors.map((each) => (each === 'brown' ? 'orange' : each)));
  });
});

describe('connection.encryption', () => {
  it('reads a value Compass encrypted, and refuses a wrong passphrase', async () => {
    const data = compassEncrypted('{"secrets":{"password":"pw"}}', 'phrase');
    expect(await decryptSecrets(data, 'phrase', nodeFileCrypto)).toBe('{"secrets":{"password":"pw"}}');
    expect(await decryptSecrets(data, 'wrong', nodeFileCrypto)).toEqual({
      kind: 'problem',
      problem: 'Wrong passphrase, or the file is damaged',
      wrongPassphrase: true,
    });
  });

  it('uses one salt per file and a new IV per value', async () => {
    const [first = '', second = ''] = await encryptSecrets(['a', 'b'], 'phrase', nodeFileCrypto);
    const one = fromBase64(first) ?? new Uint8Array();
    const two = fromBase64(second) ?? new Uint8Array();
    expect([...one.subarray(2, 18)]).toEqual([...two.subarray(2, 18)]);
    expect([...one.subarray(18, 34)]).not.toEqual([...two.subarray(18, 34)]);
    expect(await decryptSecrets(second, 'phrase', nodeFileCrypto)).toBe('b');
  });

  it('refuses data too short or of another version', async () => {
    expect(await decryptSecrets('AAE=', 'p', nodeFileCrypto)).toMatchObject({
      problem: 'The encrypted data is too short',
    });
    const [value = ''] = await encryptSecrets(['a'], 'p', nodeFileCrypto);
    const bytes = fromBase64(value) ?? new Uint8Array();
    bytes[1] = 2;
    expect(await decryptSecrets(Buffer.from(bytes).toString('base64'), 'p', nodeFileCrypto)).toMatchObject({
      problem: 'Unknown encrypted data version: 0x2',
    });
  });
});

describe('connection.read-list', () => {
  it('reads names, quotes and separators', () => {
    const read = connectionsFromList(
      [
        '﻿mongodb://localhost:27017/app',
        'Production = mongodb+srv://ada:pw@cluster0.x.mongodb.net/shop?retryWrites=true',
        '"Quoted Name" = "mongodb://h1:27017/db",',
        "'Single': mongodb://h2/db;",
        'Tabbed\tmongodb://h3/db',
        '# a comment',
        '',
        '// another',
      ].join('\r\n'),
    );
    expect(read.skipped).toBe(0);
    expect(read.connections.map((each) => [each.name, each.engine, each.connectionString])).toEqual([
      ['localhost:27017', 'mongodb', 'mongodb://localhost:27017/app'],
      ['Production', 'mongodb', 'mongodb+srv://ada:pw@cluster0.x.mongodb.net/shop?retryWrites=true'],
      ['Quoted Name', 'mongodb', 'mongodb://h1:27017/db'],
      ['Single', 'mongodb', 'mongodb://h2/db'],
      ['Tabbed', 'mongodb', 'mongodb://h3/db'],
    ]);
  });

  it('names a line after the // comment right above it, and only that line', () => {
    const names = (lines: readonly string[]): readonly string[] =>
      connectionsFromList(lines.join('\n')).connections.map((each) => each.name);
    expect(names(['// Production', 'mongodb+srv://ada@cluster0.x.mongodb.net/shop'])).toEqual(['Production']);
    const sessions = connectionsFromList('// Sessions\nrediss://cache.example.com:6380/2').connections[0];
    expect([sessions?.engine, sessions?.name]).toEqual(['redis', 'Sessions']);
    expect(names(['// Reports', 'Main = mongodb://r1/db'])).toEqual(['Main']);
    expect(names(['// Old', '', 'mongodb://h1/db'])).toEqual(['h1']);
    expect(names(['//', 'mongodb://h2/db'])).toEqual(['h2']);
    expect(names(['// A', '// B', 'mongodb://h3/db'])).toEqual(['B']);
    expect(names(['// A', '# note', 'mongodb://h4/db'])).toEqual(['h4']);
    expect(names(['// A', 'not a connection', 'mongodb://h5/db'])).toEqual(['h5']);
  });

  it('skips and counts what is not a connection', () => {
    expect(connectionsFromList('not a connection\nmongodb:// broken').skipped).toBe(2);
    expect(connectionsFromList('redis://cache/orders')).toMatchObject({ connections: [], skipped: 1 });
  });

  it('moves the TLS files out and notes a missing password', () => {
    expect(connectionsFromList('Secure = mongodb://ada@h/db?tls=true&tlsCAFile=%2Fca.pem').connections).toEqual([
      {
        name: 'Secure',
        engine: 'mongodb',
        connectionString: 'mongodb://ada@h/db',
        tls: { caFile: '/ca.pem' },
        notes: ['no password'],
      },
    ]);
    expect(connectionsFromList('X = mongodb://CN=me@h/?authMechanism=MONGODB-X509').connections[0]?.notes).toEqual([]);
  });

  it('reads Redis lines', () => {
    const read = connectionsFromList('Cache = redis://:s3cret@cache:6379/2\nrediss://ada@cache.example.com:6380');
    expect(read.connections).toEqual([
      { name: 'Cache', engine: 'redis', connectionString: 'redis://:s3cret@cache:6379/2', notes: [] },
      {
        name: 'cache.example.com:6380',
        engine: 'redis',
        connectionString: 'rediss://ada@cache.example.com:6380',
        tls: {},
        notes: ['no password'],
      },
    ]);
  });
});
