/**
 * Feature: connection.read-list — a text with one connection string per line, of either engine, with or without a
 * name: `Production = mongodb+srv://…`, `"Cache": rediss://…`, `mongodb://localhost:27017/app`.
 */
import type { EngineName } from '../../shared/engine-request';
import { isRedisStringProblem, redisFromString } from './redis-string';
import { optionName, optionValue, decoded, splitCredentials, uriParts } from './string-secrets';
import { fileText } from './text';
import { tlsFromUri } from './tls-in-uri';
import type { FileConnection, FileConnections } from './types';

const mechanismsWithoutPassword = ['MONGODB-X509', 'GSSAPI', 'MONGODB-AWS', 'MONGODB-OIDC'];

/** The engine of a connection string by its scheme, in any case; undefined for another scheme. */
export function engineOfString(connectionString: string): EngineName | undefined {
  if (/^mongodb(\+srv)?:\/\//i.test(connectionString)) {
    return 'mongodb';
  }
  return /^rediss?:\/\//i.test(connectionString) ? 'redis' : undefined;
}

/** Whether a connection string of the engine has a host right after its scheme. */
export function hasHost(engine: EngineName, connectionString: string): boolean {
  if (engineOfString(connectionString) !== engine) {
    return false;
  }
  if (engine === 'redis') {
    return !isRedisStringProblem(redisFromString(connectionString));
  }
  const hosts = uriParts(connectionString)?.hosts ?? '';
  return hosts !== '' && !/^[,:]/.test(hosts);
}

/** The host part of a connection string, credentials left out; for Redis the host and the port (`cache:6379`). */
export function hostOf(engine: EngineName, connectionString: string): string {
  if (engine === 'redis') {
    const fields = redisFromString(connectionString);
    return isRedisStringProblem(fields) ? '' : `${fields.host}:${String(fields.port)}`;
  }
  return uriParts(connectionString)?.hosts ?? '';
}

/** Whether a connection string has a user without a password, and needs one. */
export function lacksPassword(engine: EngineName, connectionString: string): boolean {
  if (engine === 'redis') {
    const fields = redisFromString(connectionString);
    return !isRedisStringProblem(fields) && fields.username !== '' && fields.password === '';
  }
  const uri = uriParts(connectionString);
  const { user, password } = splitCredentials(uri?.credentials);
  if (user === undefined || user === '' || (password !== undefined && password !== '')) {
    return false;
  }
  const mechanism = uri?.options.find((option) => optionName(option).toLowerCase() === 'authmechanism');
  return !mechanismsWithoutPassword.includes(decoded(optionValue(mechanism ?? '')).toUpperCase());
}

/** The notes about what is missing: **no password**, **no SSH password**. */
export function missingNotes(connection: Omit<FileConnection, 'notes'>): readonly string[] {
  return [
    ...(lacksPassword(connection.engine, connection.connectionString) ? [fileText.noPassword] : []),
    ...(connection.ssh?.auth === 'password' && (connection.ssh.password ?? '') === '' ? [fileText.noSshPassword] : []),
  ];
}

const schemes = /(mongodb(\+srv)?|rediss?):\/\//i;

function connectionOfLine(line: string): FileConnection | undefined {
  const at = line.search(schemes);
  if (at < 0) {
    return undefined;
  }
  const written = (line.slice(at).split(/\s/)[0] ?? '').replace(/["'`,;]+$/, '');
  const engine = engineOfString(written);
  if (engine === undefined || !hasHost(engine, written)) {
    return undefined;
  }
  const named = line
    .slice(0, at)
    .replace(/[\s=:,;|"'`]+$/, '')
    .replace(/^["'`]+/, '')
    .trim();
  const name = named === '' ? hostOf(engine, written) : named;
  if (engine === 'redis') {
    const connection = { name, engine, connectionString: written, ...(/^rediss:/i.test(written) ? { tls: {} } : {}) };
    return { ...connection, notes: missingNotes(connection) };
  }
  const { connectionString, tls } = tlsFromUri(written);
  const connection = { name, engine, connectionString, ...(tls === undefined ? {} : { tls }) };
  return { ...connection, notes: missingNotes(connection) };
}

/** Feature: connection.read-list — the connections of the lines, and how many lines were not one. */
export function connectionsFromList(text: string): FileConnections {
  const connections: FileConnection[] = [];
  let skipped = 0;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }
    const connection = connectionOfLine(line);
    if (connection === undefined) {
      skipped += 1;
    } else {
      connections.push(connection);
    }
  }
  return { format: 'list', connections, skipped };
}
