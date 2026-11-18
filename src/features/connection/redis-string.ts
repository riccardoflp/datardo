/**
 * Feature: connection.redis-string — how a `redis://` or `rediss://` connection string becomes the fields of a Redis
 * connection, and the fields a connection string.
 */
import type { ConnectionForm } from '../../shared/connection';
import { decoded } from './string-secrets';
import { redisText } from './text';

/** The fields of a Redis connection, as the form shows them. */
export interface RedisFields {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: number;
  readonly tls: boolean;
}

/** Why a Redis connection string cannot be read, with the reason of its refusal. */
export interface RedisStringProblem {
  readonly reason: 'connection-string' | 'port' | 'database';
  readonly message: string;
}

/** The port when the connection string leaves it out. */
export const defaultRedisPort = 6379;

const scheme = /^([a-z][a-z0-9+.-]*):\/\//i;
const hostAndPort = /^(?:\[([^\]]*)\]|([^:[\]]*))(?::(.*))?$/;

/** A whole number from 1 to 65535, from text; undefined when it is not one. */
export function portNumber(text: string): number | undefined {
  if (!/^\d{1,5}$/.test(text)) {
    return undefined;
  }
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : undefined;
}

/** A whole number from 0, from text; undefined when it is not one. */
export function databaseNumber(text: string): number | undefined {
  return /^\d{1,9}$/.test(text) ? Number(text) : undefined;
}

function problem(reason: RedisStringProblem['reason'], message: string): RedisStringProblem {
  return { reason, message };
}

/** Percent-decoded text, or undefined when it is not valid percent-encoding. */
function strictlyDecoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    // Text that is not valid percent-encoding: the connection string is not a URI.
    return undefined;
  }
}

function readCredentials(credentials: string | undefined): { username: string; password: string } | RedisStringProblem {
  if (credentials === undefined) {
    return { username: '', password: '' };
  }
  const colon = credentials.indexOf(':');
  const username = strictlyDecoded(colon < 0 ? credentials : credentials.slice(0, colon));
  const password = strictlyDecoded(colon < 0 ? '' : credentials.slice(colon + 1));
  return username === undefined || password === undefined
    ? problem('connection-string', redisText.invalid)
    : { username, password };
}

function readAuthority(authority: string): { host: string; port: number } | RedisStringProblem {
  const match = hostAndPort.exec(authority);
  if (match === null || /\s/.test(authority)) {
    return problem('connection-string', redisText.invalid);
  }
  const [, ipv6, name, portText] = match;
  const host = ipv6 ?? decoded(name ?? '');
  if (host === '') {
    return problem('connection-string', redisText.noHost);
  }
  if (portText === undefined || portText === '') {
    return { host, port: defaultRedisPort };
  }
  const port = portNumber(portText);
  return port === undefined ? problem('port', redisText.port) : { host, port };
}

function readDatabase(path: string): number | RedisStringProblem {
  if (path === '' || path === '/') {
    return 0;
  }
  const text = decoded(path.slice(1));
  const database = databaseNumber(text);
  return database === undefined ? problem('database', redisText.database(text)) : database;
}

function isProblem(value: unknown): value is RedisStringProblem {
  return typeof value === 'object' && value !== null && 'reason' in value;
}

/** Feature: connection.redis-string — the fields of a Redis connection string, or why it cannot be read. */
export function redisFromString(text: string): RedisFields | RedisStringProblem {
  const trimmed = text.trim();
  const written = scheme.test(trimmed) ? trimmed : `redis://${trimmed}`;
  const name = (scheme.exec(written)?.[1] ?? '').toLowerCase();
  if (name !== 'redis' && name !== 'rediss') {
    return problem('connection-string', redisText.scheme);
  }
  const rest = written.slice(name.length + 3).replace(/[?#].*$/s, '');
  const slash = rest.indexOf('/');
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  const at = authority.lastIndexOf('@');
  const credentials = readCredentials(at < 0 ? undefined : authority.slice(0, at));
  const address = readAuthority(at < 0 ? authority : authority.slice(at + 1));
  const database = readDatabase(slash < 0 ? '' : rest.slice(slash));
  if (isProblem(credentials)) {
    return credentials;
  }
  if (isProblem(address)) {
    return address;
  }
  if (isProblem(database)) {
    return database;
  }
  return { ...credentials, ...address, database, tls: name === 'rediss' };
}

/** Whether a reading of a Redis connection string failed. */
export function isRedisStringProblem(value: RedisFields | RedisStringProblem): value is RedisStringProblem {
  return isProblem(value);
}

/** Feature: connection.redis-string — the connection string of the fields; reading it gives the same fields. */
export function redisToString(fields: RedisFields): string {
  const username = encodeURIComponent(fields.username);
  const password = encodeURIComponent(fields.password);
  const credentials =
    username === '' && password === '' ? '' : password === '' ? `${username}@` : `${username}:${password}@`;
  const host = fields.host.includes(':') ? `[${fields.host}]` : fields.host;
  const port = fields.port === defaultRedisPort ? '' : `:${String(fields.port)}`;
  const database = fields.database === 0 ? '' : `/${String(fields.database)}`;
  return `${fields.tls ? 'rediss' : 'redis'}://${credentials}${host}${port}${database}`;
}

function wholeOr(text: string, fallback: number): number {
  const value = Number(text.trim());
  return Number.isInteger(value) && text.trim() !== '' ? value : fallback;
}

/** The Redis connection string the fields write, without a password. */
export function redisStringOfFields(form: ConnectionForm): string {
  return redisToString({
    host: form.host.trim(),
    port: wholeOr(form.port, 6379),
    username: form.username.trim(),
    password: '',
    database: wholeOr(form.database, 0),
    tls: form.tls.on,
  });
}

/** **Fields** or **Connection string** chosen for Redis: the way chosen shows what the other holds. */
export function withRedisMode(form: ConnectionForm, mode: ConnectionForm['redisMode']): ConnectionForm {
  if (mode === form.redisMode) {
    return form;
  }
  if (mode === 'connection-string') {
    return { ...form, redisMode: mode, connectionString: redisStringOfFields(form) };
  }
  const read = redisFromString(form.connectionString);
  if (isRedisStringProblem(read)) {
    return { ...form, redisMode: mode };
  }
  return {
    ...form,
    redisMode: mode,
    host: read.host,
    port: String(read.port),
    username: read.username,
    database: String(read.database),
    password: read.password === '' ? form.password : read.password,
    tls: { ...form.tls, on: read.tls },
  };
}
