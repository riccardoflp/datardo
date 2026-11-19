import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { knownHostsFile, withHostKey } from '../../../src/storage/known-hosts';
import { Store } from '../../../src/storage/store';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-known-hosts-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('the known hosts file', () => {
  it('writes the fingerprints by host and port at version 1 and reads them back', async () => {
    const store = new Store(folder, knownHostsFile);
    expect(await store.load()).toEqual({ kind: 'missing' });
    store.set(withHostKey(store.get(), 'bastion:22', 'SHA256:abc'));
    store.set(withHostKey(store.get(), 'bastion:2222', 'SHA256:def'));
    await store.flush();
    const text = await readFile(join(folder, 'known-hosts.json'), 'utf8');
    expect(JSON.parse(text)).toEqual({
      version: 1,
      hosts: { 'bastion:22': 'SHA256:abc', 'bastion:2222': 'SHA256:def' },
    });
    const again = new Store(folder, knownHostsFile);
    expect(await again.load()).toEqual({ kind: 'current' });
    expect(again.get().hosts['bastion:22']).toBe('SHA256:abc');
  });

  it('replaces the key of a server', () => {
    const file = withHostKey(withHostKey({ hosts: {} }, 'h:22', 'SHA256:old'), 'h:22', 'SHA256:new');
    expect(file.hosts).toEqual({ 'h:22': 'SHA256:new' });
  });

  it('leaves out what is not a fingerprint', async () => {
    await writeFile(join(folder, 'known-hosts.json'), JSON.stringify({ version: 1, hosts: { a: 'SHA256:x', b: 3 } }));
    const store = new Store(folder, knownHostsFile);
    await store.load();
    expect(store.get().hosts).toEqual({ a: 'SHA256:x' });
  });
});
