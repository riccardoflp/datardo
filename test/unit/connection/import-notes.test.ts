import { describe, expect, it } from 'vitest';
import { describe as detail } from '../../../src/features/connection/import';
import { connectionsFromText } from '../../../src/features/connection/read-file';
import type { FileConnection, FileConnections } from '../../../src/features/connection/types';
import { nodeFileCrypto } from '../../../src/main/file-crypto';

async function fileOf(entries: readonly unknown[], type: string): Promise<FileConnections> {
  const text = JSON.stringify({ type, version: 1, secrets: 'included', connections: entries });
  const file = await connectionsFromText(text, undefined, nodeFileCrypto);
  if ('problem' in file) {
    throw new Error(file.problem);
  }
  return file;
}

function detailOf(file: FileConnections, name: string): string {
  const connection = file.connections.find((each) => each.name === name) as FileConnection;
  return detail(connection, { saved: [], all: file.connections }, false);
}

describe('connection.import', () => {
  it('says what a connection of a Datardo file does beyond its host, in order', async () => {
    const file = await fileOf(
      [
        {
          id: 'p',
          name: 'Prod',
          engine: 'mongodb',
          uri: 'mongodb://ada@db1/app?proxyHost=socks.example.com&proxyPort=1080&tlsInsecure=true',
          ssh: { host: 'jump', port: 2200, username: 'me', auth: 'password' },
          noHistory: true,
          queriesFolder: '/home/eve/.ssh',
          redisOplog: { connection: 'r' },
        },
        { id: 'r', name: 'Cache', engine: 'redis', uri: 'rediss://cache.example.com:6380' },
      ],
      'Datardo Connections',
    );
    expect(detailOf(file, 'Prod')).toBe(
      'MongoDB · db1 · invalid certificates allowed · invalid host names allowed · proxy socks.example.com:1080 · ' +
        'SSH me@jump:2200 · redis-oplog → cache.example.com:6380 · no undo history · queries folder /home/eve/.ssh · ' +
        'no password · no SSH password',
    );
  });

  it('names the TLS settings that allow invalid certificates and host names, and SSH without the port 22', async () => {
    const file = await fileOf(
      [
        {
          name: 'Tls',
          engine: 'mongodb',
          uri: 'mongodb://db2/app?tlsAllowInvalidHostnames=true',
          tls: { allowInvalidCertificates: true },
          ssh: { host: 'bastion', port: 22, username: 'ops', auth: 'agent' },
        },
      ],
      'Datardo Connections',
    );
    expect(detailOf(file, 'Tls')).toBe(
      'MongoDB · db2 · TLS · invalid certificates allowed · invalid host names allowed · SSH ops@bastion',
    );
  });

  it('never shows a password of the Redis address redis-oplog publishes to', async () => {
    const file = await fileOf(
      [
        { name: 'Shop', uri: 'mongodb://db1/shop', redisOplog: { url: 'redis://:s3cret@cache:6379/0' } },
        { name: 'Odd', uri: 'mongodb://db3/shop', redisOplog: { url: 'not an address' } },
      ],
      'Mongoster Connections',
    );
    expect(detailOf(file, 'Shop')).toContain('redis-oplog → cache:6379');
    expect(detailOf(file, 'Shop')).not.toContain('s3cret');
    expect(detailOf(file, 'Odd')).toContain('redis-oplog → a host that could not be read');
  });
});
