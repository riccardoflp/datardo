import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecretStorage, type SecretCipher } from '../../../src/storage/secrets';

/** A cipher whose key is one byte: enough to see that nothing is written in clear text. */
function fakeCipher(available: boolean, key = 7): SecretCipher {
  return {
    isAvailable: () => available,
    encrypt: (text) => Uint8Array.from(new TextEncoder().encode(text), (byte) => byte ^ key),
    decrypt: (bytes) => {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes, (byte) => byte ^ key));
      if (!text.startsWith('mongodb://') && !text.startsWith('{')) {
        throw new Error('Not encrypted with this key.');
      }
      return text;
    },
  };
}

const secret = 'mongodb://ada:s3cret@db1:27017';
let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-secrets-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('the secret storage', () => {
  it('writes each value encrypted, in base64, and reads it back', async () => {
    const storage = new SecretStorage(folder, fakeCipher(true));
    await storage.load();
    expect(storage.set('connection/c-1/string', secret)).toBe(true);
    await storage.flush();
    const text = await readFile(join(folder, 'secrets.json'), 'utf8');
    expect(text).not.toContain('s3cret');
    const written = JSON.parse(text) as { version: number; values: Record<string, unknown> };
    expect(written.version).toBe(1);
    expect(typeof written.values['connection/c-1/string']).toBe('string');
    const again = new SecretStorage(folder, fakeCipher(true));
    await again.load();
    expect(again.get('connection/c-1/string')).toBe(secret);
    expect(again.isSaved()).toBe(true);
  });

  it('a value that cannot be decrypted reads as missing', async () => {
    const storage = new SecretStorage(folder, fakeCipher(true));
    await storage.load();
    storage.set('connection/c-1/string', secret);
    await storage.flush();
    const otherKey = new SecretStorage(folder, fakeCipher(true, 9));
    await otherKey.load();
    expect(otherKey.has('connection/c-1/string')).toBe(true);
    expect(otherKey.get('connection/c-1/string')).toBeUndefined();
  });

  it('deletes the values of a connection', async () => {
    const storage = new SecretStorage(folder, fakeCipher(true));
    await storage.load();
    storage.set('connection/c-1/string', secret);
    storage.set('connection/c-1/options', '{"keyPassword":"k"}');
    storage.set('mcp/token', '{"token":"t"}');
    storage.delete('connection/c-1/string', 'connection/c-1/options');
    await storage.flush();
    const values = (JSON.parse(await readFile(join(folder, 'secrets.json'), 'utf8')) as { values: object }).values;
    expect(Object.keys(values)).toEqual(['mcp/token']);
  });

  it('with no keychain, keeps the secrets in memory and writes no file (R14.2)', async () => {
    await writeFile(join(folder, 'secrets.json'), '{"version":1,"values":{"connection/c-1/string":"AAAA"}}');
    const storage = new SecretStorage(folder, fakeCipher(false));
    expect(await storage.load()).toEqual({ kind: 'missing' });
    expect(storage.isSaved()).toBe(false);
    expect(storage.get('connection/c-1/string')).toBeUndefined();
    storage.set('connection/c-2/string', secret);
    expect(storage.get('connection/c-2/string')).toBe(secret);
    await storage.flush();
    expect(await readFile(join(folder, 'secrets.json'), 'utf8')).not.toContain('s3cret');
    expect(await readdir(folder)).toEqual(['secrets.json']);
    storage.delete('connection/c-2/string');
    expect(storage.get('connection/c-2/string')).toBeUndefined();
  });

  it('a file of a newer version is read and never written', async () => {
    const writer = new SecretStorage(folder, fakeCipher(true));
    await writer.load();
    writer.set('connection/c-1/string', secret);
    await writer.flush();
    const text = (await readFile(join(folder, 'secrets.json'), 'utf8')).replace('"version": 1', '"version": 2');
    await writeFile(join(folder, 'secrets.json'), text);
    const storage = new SecretStorage(folder, fakeCipher(true));
    expect(await storage.load()).toEqual({ kind: 'newer', version: 2 });
    expect(storage.get('connection/c-1/string')).toBe(secret);
    expect(storage.set('connection/c-1/string', 'mongodb://other')).toBe(false);
  });
});
