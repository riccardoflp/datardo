/**
 * Feature: connection.ssh-tunnel-target — the host an SSH tunnel forwards to, and the address the client then uses on
 * the local end of the tunnel.
 */
import type { EngineName } from '../../shared/engine-request';
import { isRedisStringProblem, redisFromString, redisToString } from './redis-string';
import { decoded, joinUri, optionName, uriParts } from './string-secrets';
import { formText } from './text';

/** Where an SSH tunnel leads, refused (connection.ssh-tunnel-target). */
const tunnelText = {
  scheme: 'The connection string must start with mongodb://',
  srv: formText.srvThroughSsh,
  noHost: 'Unexpected host in the connection string: (none)',
} as const;

/** Where the tunnel leads: a host and a port, as the SSH server reaches them. */
export interface TunnelTarget {
  readonly host: string;
  readonly port: number;
}

/** Why a connection string cannot go through a tunnel. */
export interface TunnelProblem {
  readonly problem: string;
}

const mongoPort = 27017;
const localHost = '127.0.0.1';

/** Whether a reading of a connection string for a tunnel failed. */
export function isTunnelProblem(value: unknown): value is TunnelProblem {
  return typeof value === 'object' && value !== null && 'problem' in value;
}

function mongoTarget(connectionString: string): TunnelTarget | TunnelProblem {
  const trimmed = connectionString.trim();
  if (/^mongodb\+srv:\/\//i.test(trimmed)) {
    return { problem: tunnelText.srv };
  }
  const uri = uriParts(trimmed);
  if (uri === undefined || uri.scheme.toLowerCase() !== 'mongodb://') {
    return { problem: tunnelText.scheme };
  }
  const first = uri.hosts.split(',')[0] ?? '';
  const match = /^(?:\[([^\]]*)\]|([^:]*))(?::(\d*))?$/.exec(first);
  const host = match === null ? '' : (match[1] ?? decoded(match[2] ?? ''));
  if (host === '') {
    return { problem: tunnelText.noHost };
  }
  const port = match?.[3] === undefined || match[3] === '' ? mongoPort : Number(match[3]);
  return { host, port };
}

/** Feature: connection.ssh-tunnel-target — the host and the port the tunnel forwards to, or why there is none. */
export function tunnelTarget(engine: EngineName, connectionString: string): TunnelTarget | TunnelProblem {
  if (engine === 'mongodb') {
    return mongoTarget(connectionString);
  }
  const fields = redisFromString(connectionString);
  if (isRedisStringProblem(fields)) {
    return { problem: fields.message };
  }
  return { host: fields.host, port: fields.port };
}

function mongoThroughTunnel(connectionString: string, localPort: number): string {
  const uri = uriParts(connectionString);
  if (uri === undefined) {
    return connectionString;
  }
  const options = uri.options.filter((option) => optionName(option).toLowerCase() !== 'directconnection');
  return joinUri({
    ...uri,
    hosts: `${localHost}:${String(localPort)}`,
    path: uri.path === '' ? '/' : uri.path,
    options: [...options, 'directConnection=true'],
  });
}

/**
 * Feature: connection.ssh-tunnel-target — the connection string the client uses on the local end of the tunnel: for
 * MongoDB the hosts replaced by `127.0.0.1:<local port>`, as a direct connection; for Redis `127.0.0.1` and the local
 * port, with the same user name, password and database. TLS is still checked against the real host.
 */
export function throughTunnel(engine: EngineName, connectionString: string, localPort: number): string {
  if (engine === 'mongodb') {
    return mongoThroughTunnel(connectionString, localPort);
  }
  const fields = redisFromString(connectionString);
  return isRedisStringProblem(fields)
    ? connectionString
    : redisToString({ ...fields, host: localHost, port: localPort });
}
