/**
 * Feature: home.address
 *
 * What a card shows for where a connection leads: enough to tell two connections apart, and nothing that is secret.
 * It is made from what the connection area keeps beside the connection for showing it (its hosts as written, whether
 * it is an SRV name, the host of its SSH tunnel), never from the connection string: this never reads the secret
 * storage.
 */
import type { SavedConnection } from '../../shared/connection';

/** What the address is made from. `address` is the connection string without secrets, read only for its scheme. */
export type AddressInput = Pick<SavedConnection, 'hosts' | 'ssh'> & { readonly address?: string };

/** A host as written, without anything a careless string could carry around it: a user, a path, options. */
function bareHost(written: string): string {
  const afterUser = written.slice(written.lastIndexOf('@') + 1);
  return afterUser.split(/[/?]/u)[0]?.trim() ?? '';
}

/** Every host, as written, one for each line of the tooltip; a scheme, a user and what follows the hosts are left out. */
export function addressHosts(connection: AddressInput): readonly string[] {
  const written = connection.hosts.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '');
  const hosts = written.slice(written.lastIndexOf('@') + 1);
  return hosts
    .split(',')
    .map(bareHost)
    .filter((host) => host !== '');
}

/** Whether the connection string is an SRV name (`mongodb+srv://`). */
function isSrv(connection: AddressInput): boolean {
  return connection.address?.toLowerCase().startsWith('mongodb+srv:') === true;
}

/** The host of the SSH server, without its user or its port. */
function sshHost(host: string): string {
  const afterUser = host.slice(host.lastIndexOf('@') + 1);
  if (afterUser.startsWith('[')) {
    return afterUser.slice(0, afterUser.indexOf(']') + 1);
  }
  return afterUser.split(':')[0] ?? afterUser;
}

/**
 * The one line of a card: the first host as written, `+<n>` for the others; an SRV name alone; ` via ` and the SSH
 * server when there is a tunnel. Never a scheme, a user, a password, a database or an option.
 */
export function address(connection: AddressInput): string {
  const [first = '', ...others] = addressHosts(connection);
  const hosts = isSrv(connection) || others.length === 0 ? first : `${first} +${String(others.length)}`;
  return connection.ssh === undefined ? hosts : `${hosts} via ${sshHost(connection.ssh.host)}`;
}
