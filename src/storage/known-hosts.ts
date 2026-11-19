/**
 * `known-hosts.json`: the host keys of the SSH servers the user confirmed (connection.trust-host-key), by `host:port`,
 * as OpenSSH's fingerprints. Not secret: a fingerprint says which server to expect, not how to reach it.
 */
import type { Json } from '../shared/engine-request';
import type { JsonObject, StoredFile } from './store';

/** What `known-hosts.json` holds: the fingerprint of each server, by `host:port`. */
export interface KnownHosts {
  readonly hosts: Readonly<Record<string, string>>;
}

/** No server known. */
export const noKnownHosts: KnownHosts = { hosts: {} };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The kind of file `known-hosts.json` is. */
export const knownHostsFile: StoredFile<KnownHosts> = {
  path: 'known-hosts.json',
  holds: 'The known hosts',
  version: 1,
  migrations: {},
  empty: () => noKnownHosts,
  read: (object) => {
    const hosts = object['hosts'] ?? {};
    if (!isObject(hosts)) {
      throw new Error('hosts is not an object.');
    }
    return {
      hosts: Object.fromEntries(
        Object.entries(hosts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    };
  },
  write: (value) => ({ hosts: { ...value.hosts } }),
};

/** The known hosts with the key of a server remembered, replacing the one it had. */
export function withHostKey(file: KnownHosts, server: string, fingerprint: string): KnownHosts {
  return { hosts: { ...file.hosts, [server]: fingerprint } };
}
